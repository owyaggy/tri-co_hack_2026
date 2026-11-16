"""Web search (Kagi) and page fetching, both cached in the DB's web_cache (SPEC §3.6, §4).

The cache is DEMO safety: once the demo question has run, its search results and pages
replay from the DB, so a flaky network on stage doesn't matter. seed.py --reset keeps it.
"""
import html as html_lib
import ipaddress
import json
import os
import re
import socket
import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import trafilatura

import db

KAGI_URL = "https://kagi.com/api/v1/search"  # v1; the legacy v0 GET returns 401 with new keys
KAGI_USD_PER_SEARCH = 0.012  # what one search costs (SPEC §9.1)
SEARCH_LIMIT = 15  # of ~30 Kagi returns; extra candidates because some good sites refuse our fetcher
FETCH_TIMEOUT_S = 15
# Fetch safety (explainers/security.md): anyone can make the server fetch a URL (the professor's
# "add source", Kagi results in /ask), so the fetcher refuses anything but the public web.
MAX_REDIRECTS = 5
MAX_PAGE_BYTES = 5_000_000  # a page bigger than this is cut off here (after decompression)
FETCH_PORTS = {80, 443}
# Public-looking IPv6 ranges that carry an IPv4 address inside (NAT64, 6to4): refused outright.
BLOCKED_NETWORKS = [ipaddress.ip_network("64:ff9b::/96"), ipaddress.ip_network("64:ff9b:1::/48"),
                    ipaddress.ip_network("2002::/16")]
MAX_EXCERPT_CHARS = 20_000
# A generic client name: no user or project details go to the sites we fetch.
USER_AGENT = "Mozilla/5.0 (compatible; Dialectic/0.1)"
# Text only screen readers get, e.g. Cambridge's citation labels ("Du Bois (Reference Du Bois1897"
# on the page reads "Du Bois (1897"). Readers never see it, so quotes and sentence links must not
# include it (#5). Dropped before extraction; pages already in web_cache keep it.
SCREEN_READER_ONLY_CLASSES = [
    "sr-only", "show-for-sr", "visually-hidden", "visuallyhidden", "screen-reader-text",
    "screen-reader-only", "element-invisible", "u-visually-hidden",
]
SCREEN_READER_ONLY_XPATH = [
    f"//*[contains(concat(' ', normalize-space(@class), ' '), ' {name} ')]" for name in SCREEN_READER_ONLY_CLASSES
]


def cache_get(conn, key):
    row = conn.execute("SELECT value FROM web_cache WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else None


def cache_put(conn, key, value):
    conn.execute(
        "INSERT OR REPLACE INTO web_cache (key, value, created_at) VALUES (?, ?, ?)",
        (key, json.dumps(value), db.now()),
    )
    conn.commit()


def clean_html(text):
    """Kagi snippets contain HTML (<strong>, &#39;): strip tags, unescape entities."""
    return html_lib.unescape(re.sub(r"<[^>]+>", "", text)).strip()


def search(conn, meter, query):
    """Web search. Returns [{title, url, snippet}]. Only `query` leaves the server.
    An uncached search is paid: check the spending limits first, record it after (SPEC §9.1)."""
    key = f"search:{query}"
    cached = cache_get(conn, key)
    if cached is not None:
        return cached
    api_key = os.environ.get("KAGI_API_KEY")
    if not api_key:
        raise RuntimeError("KAGI_API_KEY is not set (put it in .env), or turn off 'AI may find sources' in the charter")
    meter.check("search")
    resp = httpx.post(
        KAGI_URL,
        json={"query": query},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=FETCH_TIMEOUT_S,
    )
    resp.raise_for_status()
    meter.record("search", 1, KAGI_USD_PER_SEARCH)
    # data.search holds the web results (about 30); video, infobox and related_search are ignored.
    results = [
        {"title": clean_html(item.get("title", "")), "url": item["url"], "snippet": clean_html(item.get("snippet") or "")}
        for item in resp.json()["data"]["search"][:SEARCH_LIMIT]
        if item["url"].startswith(("http://", "https://"))  # shown as links: no javascript: URLs
    ]
    cache_put(conn, key, results)
    return results


class UnsafeURL(httpx.HTTPError):
    """A URL the server won't fetch: not http(s) on 80/443, or its host is not on the public internet."""


def is_public_ip(ip):
    """False for loopback, private (RFC 1918, fc00::/7), link-local (169.254/16, fe80::/10, so the
    cloud metadata address too), CGNAT/tailnet 100.64/10, multicast, reserved and unspecified."""
    if ip.version == 6 and ip.ipv4_mapped is not None:  # ::ffff:127.0.0.1 is 127.0.0.1
        ip = ip.ipv4_mapped
    if any(ip in net for net in BLOCKED_NETWORKS if net.version == ip.version):
        return False
    return ip.is_global and not ip.is_multicast and not ip.is_reserved


def public_address(url):
    """Check a URL and resolve its host. Returns the IP to connect to, or raises UnsafeURL.
    Every address the name resolves to must be public, so a name can't hide a private one."""
    if url.scheme not in ("http", "https"):
        raise UnsafeURL(f"Only http and https links can be fetched, not {url.scheme or 'this'}: {url}")
    if url.port is not None and url.port not in FETCH_PORTS:
        raise UnsafeURL(f"Only the standard web ports (80, 443) can be fetched: {url}")
    host = url.raw_host.decode("ascii")
    if not host:
        raise UnsafeURL(f"No host in {url}")
    try:
        infos = socket.getaddrinfo(host, url.port or (443 if url.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise UnsafeURL(f"Couldn't find the site {host}: {e}")
    ips = [ipaddress.ip_address(info[4][0].split("%")[0]) for info in infos]
    for ip in ips:
        if not is_public_ip(ip):
            raise UnsafeURL(f"{host} is not on the public internet ({ip}), so it can't be fetched")
    # IPv4 first: a droplet may have no IPv6 route even when the name has an AAAA record.
    return next((ip for ip in ips if ip.version == 4), ips[0])


def get_public(url):
    """GET a page on the public web: (final URL, html text). Follows up to MAX_REDIRECTS redirects
    itself, checking each hop. Connects to the IP it checked (Host header and TLS name stay the
    site's), so a DNS answer that changes between the check and the connect can't redirect it."""
    url = httpx.URL(url)
    deadline = time.monotonic() + FETCH_TIMEOUT_S * 2  # a whole fetch, however slowly the bytes come
    # trust_env=False: no proxy from the environment, the connection goes where we checked.
    with httpx.Client(timeout=FETCH_TIMEOUT_S, trust_env=False, follow_redirects=False) as client:
        for _ in range(MAX_REDIRECTS + 1):
            ip = public_address(url)
            host = url.raw_host.decode("ascii")
            pinned = url.copy_with(host=str(ip))
            request = client.build_request("GET", pinned, headers={"User-Agent": USER_AGENT, "Host": host},
                                           extensions={"sni_hostname": host})
            resp = client.send(request, stream=True)
            try:
                if resp.is_redirect:
                    url = url.join(resp.headers["location"])
                    continue
                if resp.is_error:  # named by the site's URL, not the IP we connected to
                    raise httpx.HTTPStatusError(f"{resp.status_code} from {url}", request=request, response=resp)
                body = bytearray()
                for chunk in resp.iter_bytes():
                    body += chunk
                    if len(body) >= MAX_PAGE_BYTES or time.monotonic() > deadline:
                        break  # TODO(edge): a cut-off page is extracted as far as it got
                return url, bytes(body[:MAX_PAGE_BYTES]).decode(resp.encoding or "utf-8", errors="replace")
            finally:
                resp.close()
    raise UnsafeURL(f"More than {MAX_REDIRECTS} redirects from {url}")


def download_page(url):
    """Fetch a page and extract its main text, with no caching. Returns {title, text};
    text is '' if extraction found nothing. Raises httpx.HTTPError if the site refuses,
    or UnsafeURL (also an httpx.HTTPError) if it isn't a public web page."""
    _, html = get_public(url)
    text = trafilatura.extract(html, include_comments=False, include_tables=False,
                               prune_xpath=SCREEN_READER_ONLY_XPATH) or ""
    metadata = trafilatura.extract_metadata(html)
    title = (metadata.title if metadata and metadata.title else url)
    return {"title": title, "text": text[:MAX_EXCERPT_CHARS]}


def fetch_page(conn, url):
    """One page, cached. Used when the professor adds a source and by the seed."""
    key = f"page:{url}"
    cached = cache_get(conn, key)
    if cached is not None:
        return cached
    page = download_page(url)
    cache_put(conn, key, page)
    return page


def fetch_pages(conn, urls):
    """Several pages at once, so one slow site doesn't hold up the rest.

    Returns {url: page}, where page is {title, text}, or the httpx.HTTPError the site raised.
    Downloads run in threads; the cache is read and written here, on this thread, because
    a SQLite connection can't be shared across threads.
    """
    pages = {}
    to_download = []
    for url in urls:
        cached = cache_get(conn, f"page:{url}")
        if cached is not None:
            pages[url] = cached
        else:
            to_download.append(url)
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {url: pool.submit(download_page, url) for url in to_download}
    for url, future in futures.items():
        try:
            pages[url] = future.result()
        except httpx.HTTPError as e:
            pages[url] = e
            continue
        cache_put(conn, f"page:{url}", pages[url])
    return pages
