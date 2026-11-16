import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Document, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import { askStream, del, get, patch, pdfFile, post } from '../api.js';
import PdfPage, { hits, overlayStyle, rangeToRects } from '../components/PdfPage.jsx';
import Margin from '../components/Margin.jsx';
import Composer from '../components/Composer.jsx';
import AnswerCard, { applyEvent, newAnswer, savedAnswer } from '../components/AskPanel.jsx';
import UserMenu from '../components/UserMenu.jsx';
import ErrorNotice from '../components/ErrorNotice.jsx';
import { AreaIcon, TextCursorIcon } from '../components/Icons.jsx';

// The core screen (S03–S11): the PDF on the left, the margin on the right. Owns the
// annotations, polling, the current selection and the open answer card.

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
// No eval in pdf.js: the server's CSP forbids it anyway, and it keeps a malicious PDF's fonts from
// running code (explainers/security.md). One object, so react-pdf doesn't reload the document.
const PDF_OPTIONS = { isEvalSupported: false };

const POLL_MS = 5000;           // how often the margin refreshes while the tab is visible (SPEC §3.3)
const START_SCALE = 1.3;
const ZOOM_STEP = 0.1;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.4;
const POPOVER_WIDTH = 440;
const ANSWER_WIDTH = 560;
const MIN_BOX = 0.01;           // a drag smaller than this (page fraction) is a click, not a box

// Every annotation and reply, flattened, so a card can be found by id.
function flatten(annotations) {
  return annotations.flatMap((a) => [a, ...(a.replies || [])]);
}

export default function Reader() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [reading, setReading] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [annotations, setAnnotations] = useState([]);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(true);
  const [scale, setScale] = useState(START_SCALE);
  const [currentPage, setCurrentPage] = useState(Number(params.get('page')) || 1);
  const [activeId, setActiveId] = useState(Number(params.get('annotation')) || null);
  const [selection, setSelection] = useState(null); // {page, quote, rects}
  const [tab, setTab] = useState('annotate');
  // Box selection (SPEC §3.3): for pictures and scans whose text won't select. One box per click
  // of "Select area"; draftBox is the box being dragged: {page, startX, startY, rect}.
  const [boxMode, setBoxMode] = useState(false);
  const [draftBox, setDraftBox] = useState(null);
  const [answer, setAnswer] = useState(null);       // the open answer card, see AskPanel.jsx

  const columnRef = useRef(null);
  const pageRefs = useRef({});
  const cardRefs = useRef({});
  const scrolledToStart = useRef(false);

  // The PDF request needs our X-User-Id; keep the same object so react-pdf doesn't reload.
  const file = useMemo(() => pdfFile(id), [id]);

  // ---------- data ----------

  const loadAnnotations = useCallback(() => {
    return get(`/readings/${id}/annotations`)
      .then((list) => { setAnnotations(list); setError(null); })
      .catch(setError);
  }, [id]);

  useEffect(() => {
    get(`/readings/${id}`).then(setReading).catch(setError);
    loadAnnotations();
  }, [id, loadAnnotations]);

  // Live updates: poll while the tab is visible, and refresh on focus.
  useEffect(() => {
    function tick() {
      const visible = document.visibilityState === 'visible';
      setLive(visible);
      if (visible) loadAnnotations();
    }
    const timer = setInterval(tick, POLL_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [loadAnnotations]);

  // ---------- scrolling: which page is current ----------

  function onScroll() {
    const column = columnRef.current;
    const line = column.getBoundingClientRect().top + column.clientHeight / 3;
    let page = 1;
    for (let n = 1; n <= pageCount; n++) {
      const el = pageRefs.current[n];
      if (el && el.getBoundingClientRect().top <= line) page = n;
    }
    if (page !== currentPage) setCurrentPage(page);
  }

  function scrollToPage(page) {
    pageRefs.current[page]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrentPage(page);
  }

  // Opened from a link with ?page=&annotation= (search results, the Mac hotkey's "Open in reader").
  function onPageRendered(page) {
    if (scrolledToStart.current || page !== Number(params.get('page'))) return;
    scrolledToStart.current = true;
    pageRefs.current[page]?.scrollIntoView({ block: 'start' });
  }

  // Selecting a card or highlight: ring both, and scroll the card into view.
  function focusAnnotation(annotationId) {
    setActiveId(annotationId);
    setTimeout(() => cardRefs.current[annotationId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
  }

  // ---------- drawing a box ----------

  // Page fractions of a mouse event on a .pdf-page, kept inside the page.
  function pagePoint(event, pageEl) {
    const box = pageEl.querySelector('.react-pdf__Page').getBoundingClientRect();
    const clamp = (v) => Math.min(Math.max(v, 0), 1);
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) };
  }

  function onMouseDown(event) {
    if (!boxMode || event.target.closest('.page-overlay')) return;
    const pageEl = event.target.closest('.pdf-page');
    if (!pageEl) return;
    event.preventDefault(); // no text selection while dragging
    const { x, y } = pagePoint(event, pageEl);
    setDraftBox({ page: Number(pageEl.dataset.page), startX: x, startY: y, rect: { x, y, w: 0, h: 0 } });
  }

  // The box from where the drag started to where the mouse is now.
  function boxTo(event) {
    const { x, y } = pagePoint(event, pageRefs.current[draftBox.page]);
    return {
      x: Math.min(x, draftBox.startX), y: Math.min(y, draftBox.startY),
      w: Math.abs(x - draftBox.startX), h: Math.abs(y - draftBox.startY),
    };
  }

  function onMouseMove(event) {
    if (draftBox) setDraftBox({ ...draftBox, rect: boxTo(event) });
  }

  async function finishBox(page, rect) {
    setDraftBox(null);
    const round = (v) => Math.round(v * 10000) / 10000;
    const rects = [{ x: round(rect.x), y: round(rect.y), w: round(rect.w), h: round(rect.h) }];
    setBoxMode(false);
    setSelection({ page, rects, quote: '', box: true, readingBox: true });
    setTab('annotate');
    setCurrentPage(page);
    try {
      const { text } = await post(`/readings/${id}/box-text`, { page, rect: rects[0] });
      // Only fill in the box it was for: the student may have drawn another one meanwhile.
      setSelection((s) => (s && s.rects === rects ? { ...s, quote: s.quote || text, readingBox: false } : s));
    } catch (e) {
      setSelection((s) => (s && s.rects === rects ? { ...s, readingBox: false } : s));
      setError(e);
    }
  }

  // Esc cancels "Select area".
  useEffect(() => {
    if (!boxMode) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') { setBoxMode(false); setDraftBox(null); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [boxMode]);

  // ---------- selecting text, clicking highlights ----------

  function onMouseUp(event) {
    if (event.target.closest('.page-overlay')) return; // typing in a popover or card
    if (draftBox) {
      // From the mouse-up itself: the last mouse move may not have re-rendered yet.
      const rect = boxTo(event);
      if (rect.w >= MIN_BOX && rect.h >= MIN_BOX) {
        finishBox(draftBox.page, rect);
        return;
      }
      setDraftBox(null); // too small to be a box: treat it as a click
    }
    const browserSelection = window.getSelection();
    const pageEl = event.target.closest('.pdf-page');

    if (browserSelection.isCollapsed || !browserSelection.rangeCount) {
      // A plain click: on a highlight, select its card; elsewhere, drop the popover.
      setSelection(null);
      if (!pageEl) return;
      const box = pageEl.querySelector('.react-pdf__Page').getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      const page = Number(pageEl.dataset.page);
      const hit = annotations.find((a) => !a.locked && a.page === page && hits(a.rects, x, y));
      if (hit) focusAnnotation(hit.id);
      return;
    }

    const range = browserSelection.getRangeAt(0);
    const startPage = range.startContainer.parentElement?.closest('.pdf-page');
    if (!startPage) return;
    const quote = browserSelection.toString().replace(/\s+/g, ' ').trim();
    const rects = rangeToRects(range, startPage);
    if (!quote || rects.length === 0) return;
    const page = Number(startPage.dataset.page);
    setSelection({ page, quote, rects });
    setTab('annotate');
    setCurrentPage(page);
  }

  // ---------- notes and replies ----------

  async function saveNote(body, shareWithFuture) {
    await post(`/readings/${id}/annotations`, {
      page: selection.page, quote: selection.quote, rects: selection.rects, body, share_with_future: shareWithFuture,
    });
    window.getSelection().removeAllRanges();
    setSelection(null);
    // The server now sends nearby classmates' notes in full: the lock cards open (S05).
    await loadAnnotations();
  }

  async function reply(parent, body) {
    try {
      await post(`/readings/${id}/annotations`, { parent_id: parent.id, body });
      await loadAnnotations();
    } catch (e) {
      setError(e);
    }
  }

  async function remove(annotation) {
    if (!window.confirm('Delete this for everyone? Its replies go too.')) return;
    try {
      await del(`/annotations/${annotation.id}`);
      await loadAnnotations();
    } catch (e) {
      setError(e);
    }
  }

  async function share(annotation, shareWithFuture) {
    try {
      await patch(`/annotations/${annotation.id}`, { share_with_future: shareWithFuture });
      await loadAnnotations();
    } catch (e) {
      setError(e);
    }
  }

  // ---------- asking ----------

  async function ask(question, where = selection) {
    const asked = { page: where.page, rects: where.rects, quote: where.quote, question };
    window.getSelection().removeAllRanges();
    setSelection(null);
    setAnswer(newAnswer(asked));
    try {
      await askStream(`/readings/${id}/ask/stream`, { page: asked.page, quote: asked.quote, rects: asked.rects, question }, (event) => {
        setAnswer((current) => (current ? applyEvent(current, event) : current));
        // The question is saved before anything else runs: show it in the margin now.
        // 'peer' too: classmates' answers shown here unlock their threads in the margin (SPEC §3.5).
        if (event.event === 'question' || event.event === 'peer' || event.event === 'done') loadAnnotations();
      });
    } catch (e) {
      setAnswer((current) => (current ? { ...current, error: e, done: true } : current));
    }
  }

  async function openSavedAnswer(question, { showAi = false } = {}) {
    try {
      const result = await get(`/questions/${question.id}/answer`);
      setAnswer({ ...savedAnswer({ page: question.page, rects: question.rects, question: question.body, questionId: question.id, result }), showAi });
      scrollToPage(question.page);
    } catch (e) {
      setError(e);
    }
  }

  function goToPeer(peer) {
    // Seeing a peer here unlocks its thread in the margin (SPEC §3.5), so this lands on its card.
    scrollToPage(peer.page);
    focusAnnotation(peer.parent_id || peer.annotation_id);
  }

  // Replies to the open AI explanation sit flattened under its question.
  const aiReplies = useMemo(() => {
    const aiId = answer?.aiAnswer?.annotation_id;
    if (!aiId) return [];
    return flatten(annotations).filter((a) => a.parent_id === aiId);
  }, [answer, annotations]);

  // ---------- render ----------

  // Still being OCR'd, or failed (SPEC §3.11): nothing to annotate yet. The course page shows progress.
  if (reading && reading.status !== 'ready') {
    return (
      <div className="page-body">
        <ErrorNotice
          error={new Error(reading.status === 'processing' ? 'Still reading the scan. Try again in a minute.' : reading.error)}
          title={reading.status === 'processing' ? 'Not ready yet' : "Couldn't read this file"}
        />
        <p><Link to="/">Back to readings</Link></p>
      </div>
    );
  }

  const fullAnnotations = annotations.filter((a) => !a.locked);

  return (
    <div className="reader">
      <header className="reader-header">
        <Link to="/" className="wordmark">Dialectic</Link>
        <span className="breadcrumb"><Link to="/">Readings</Link> › {reading?.title || '…'}</span>
        <div className="spacer" />
        <span className="live" title={`Refreshes every ${POLL_MS / 1000} s while this tab is open`}>
          <span className={`live-dot${live ? '' : ' paused'}`} />Live
        </span>
        <div className="zoom">
          <button type="button" aria-label="Zoom out" onClick={() => setScale((s) => Math.max(MIN_SCALE, s - ZOOM_STEP))}>−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => setScale((s) => Math.min(MAX_SCALE, s + ZOOM_STEP))}>+</button>
        </div>
        <Link to="/charter" className="charter-pill">Class charter</Link>
        <UserMenu showName={false} />
      </header>

      {error && <div style={{ padding: '12px 28px 0' }}><ErrorNotice error={error} /></div>}

      <div className="reader-body">
        <div className="pdf-wrap">
        {/* Sits over the PDF column's corner and doesn't scroll with it. Area mode is one box per
            click (SPEC §3.3), so it flips back to Select text after a box is drawn. */}
        <div className="select-toggle" role="radiogroup" aria-label="Selection mode">
          <button
            type="button"
            role="radio"
            aria-checked={!boxMode}
            title="Select words in the reading"
            onClick={() => { setBoxMode(false); setDraftBox(null); }}
          >
            <TextCursorIcon />Select text
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={boxMode}
            title="For pictures, or pages where the text won't select: drag a box around the part you mean (Esc cancels)"
            onClick={() => { setBoxMode(true); setDraftBox(null); }}
          >
            <AreaIcon />Select area
          </button>
        </div>
        <div
          className={`pdf-column${boxMode ? ' box-mode' : ''}`}
          ref={columnRef}
          onScroll={onScroll}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
        >
          <Document
            file={file}
            options={PDF_OPTIONS}
            onLoadSuccess={(pdf) => setPageCount(pdf.numPages)}
            onLoadError={setError}
            loading={<div className="pdf-status">Loading the reading…</div>}
            error={<div className="pdf-status">Couldn't load the PDF.</div>}
          >
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <PdfPage
                key={n}
                pageNumber={n}
                scale={scale}
                annotations={fullAnnotations.filter((a) => a.page === n)}
                activeId={activeId}
                pendingRects={
                  draftBox?.page === n ? [draftBox.rect]
                    : selection?.page === n ? selection.rects
                      : answer?.page === n && !answer.questionId ? answer.rects : null
                }
                pageRef={(el) => { pageRefs.current[n] = el; }}
                onRendered={() => onPageRendered(n)}
              >
                {selection?.page === n && (
                  <div className="page-overlay" style={overlayStyle(selection.rects, POPOVER_WIDTH)}>
                    <Composer
                      // A box's quote changes as it's read and edited; don't reset the composer for that.
                      key={selection.box ? `box-${selection.rects[0].x}-${selection.rects[0].y}` : selection.quote}
                      selection={selection}
                      tab={tab}
                      onTab={setTab}
                      onSaveNote={saveNote}
                      onAsk={ask}
                      onQuoteChange={(quote) => setSelection((s) => ({ ...s, quote }))}
                    />
                  </div>
                )}
                {!selection && answer?.page === n && (
                  <div className="page-overlay" style={overlayStyle(answer.rects, ANSWER_WIDTH)}>
                    <AnswerCard
                      key={`${answer.page}-${answer.question}-${answer.showAi ? 'ai' : ''}`}
                      answer={answer}
                      aiReplies={aiReplies}
                      onClose={() => setAnswer(null)}
                      onAskAgain={() => ask(answer.question, answer)}
                      onPeerClick={goToPeer}
                      onReplyToAi={(aiId, body) => reply({ id: aiId }, body)}
                    />
                  </div>
                )}
              </PdfPage>
            ))}
          </Document>
        </div>
        </div>

        <Margin
          page={currentPage}
          annotations={annotations}
          activeId={activeId}
          selection={selection}
          cardRefs={cardRefs}
          onSelect={(a) => setActiveId(a.id)}
          onReply={reply}
          onDelete={remove}
          onShare={share}
          onOpenAnswer={openSavedAnswer}
        />
      </div>
    </div>
  );
}
