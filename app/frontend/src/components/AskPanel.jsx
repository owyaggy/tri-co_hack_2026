import { useState } from 'react';
import { me } from '../api.js';
import Avatar from './Avatar.jsx';
import ErrorNotice from './ErrorNotice.jsx';
import ReplyBox from './ReplyBox.jsx';
import { CheckIcon, ChevronIcon, ClockIcon, CloseIcon, ScaleIcon } from './Icons.jsx';

// The Ask answer card (S07–S11, S20), anchored under the asked passage. Sections are
// always in this order, each only if it has content: From your class → Sources → AI
// explanation (SPEC §3.5). Events from the streamed ask fill their own slot, so nothing
// jumps around while it loads.

const AI_BUTTON = 'Still stuck? Show the AI explanation';
const WAIT_HINT = "Usually 10–25 seconds. Classmates' answers are already above.";

// ---------- state: a new answer, and how each stream event changes it ----------

export function newAnswer({ page, rects, question }) {
  return {
    page, rects, question,
    questionId: null,
    statuses: [],       // status labels seen so far, for the checklist
    peer: null,         // null = not arrived yet
    sources: null,
    skipped: [],
    aiAnswer: undefined, // undefined = not arrived; null = none
    blocked: [],
    done: false,
    error: null,        // the whole request failed
  };
}

// A saved answer (GET /questions/{id}/answer) is exactly a `done` result.
export function savedAnswer({ page, rects, question, questionId, result }) {
  return applyEvent({ ...newAnswer({ page, rects, question }), questionId }, { event: 'done', result });
}

export function applyEvent(answer, event) {
  switch (event.event) {
    case 'question':
      return { ...answer, questionId: event.question_id };
    case 'status':
      return { ...answer, statuses: [...answer.statuses, event.label] };
    case 'peer':
      return { ...answer, peer: event.peer };
    case 'blocked':
      return { ...answer, blocked: [...answer.blocked, ...event.blocked] };
    case 'sources':
      return { ...answer, sources: event.sources, skipped: event.skipped_sources };
    case 'ai_answer':
      return { ...answer, aiAnswer: event.ai_answer };
    case 'done': {
      const r = event.result;
      return {
        ...answer, questionId: r.question_id, peer: r.peer, sources: r.sources, skipped: r.skipped_sources,
        aiAnswer: r.ai_answer, blocked: r.blocked, done: true,
      };
    }
    case 'error':
      return { ...answer, error: new Error(event.detail), done: true };
    default:
      return answer; // e.g. `located`, only sent to the Mac hotkey
  }
}

// ---------- pieces ----------

function site(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// "[1]" and "[2]" in the AI's text become the numbered source chips, linked.
function WithCitations({ text, sources }) {
  const parts = text.split(/\[(\d+)\]/);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    const source = sources?.[Number(part) - 1];
    return source
      ? <a key={i} className="cite" href={source.url} target="_blank" rel="noreferrer" title={source.title} onClick={() => copyQuote(source)}>{part}</a>
      : <span key={i} className="cite">{part}</span>;
  });
}

function CharterNotice({ block }) {
  if (block.by === 'error') {
    return (
      <div className="notice error">
        <span className="notice-icon" aria-hidden="true">!</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <strong>{block.layer === 'sources_ai' ? 'Web search failed, so these come from the course library' : block.label}</strong>
          <code>{block.reason}</code>
        </div>
      </div>
    );
  }
  if (block.by === 'limit') {
    // A spending limit (SPEC §9.1: this device's hourly Asks, the copy's budget, or AI
    // switched off on this copy). The server writes the whole notice; the charter didn't
    // cause it, so no charter link.
    return (
      <div className="notice">
        <span className="notice-icon" aria-hidden="true"><ClockIcon /></span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>{block.label}</strong>
        </div>
      </div>
    );
  }
  let title = block.label;
  let body = null;
  if (block.by === 'toggle') {
    title = block.layer === 'ai_answer' ? "Your class charter doesn't allow AI explanations." : "Your class charter doesn't let AI find sources.";
    body = <>{block.label}. <a href="/charter">Read the charter</a></>;
  } else if (block.by === 'rule') {
    title = block.layer === 'ai_answer' ? 'No AI explanation for this question' : 'No AI source search for this question';
    body = <><span style={{ fontWeight: 600 }}>{block.label}</span>{block.reason && <><br />{block.reason}</>}</>;
  }
  return (
    <div className="notice">
      <span className="notice-icon" aria-hidden="true"><ScaleIcon /></span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <strong>{title}</strong>
        {body && <span>{body}</span>}
      </div>
    </div>
  );
}

function PeerList({ peer, onPeerClick }) {
  return peer.map((p) => (
    <button key={p.annotation_id} type="button" className="peer-item" onClick={() => onPeerClick(p)}>
      <Avatar person={{ name: p.author }} size="small" />
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>
          <strong>{p.author}</strong>{' '}
          {p.cohort !== me().cohort && <span className="pill">{p.cohort}</span>}
        </span>
        <span>{p.body}</span>
      </span>
      <span className="muted small">p. {p.page}</span>
    </button>
  ));
}

// Links open at the quoted sentence, but some sites ignore that and open at the top (#5:
// Cambridge Core). So opening a source also copies its sentence, ready for the browser's Find.
const COPY_HINT = "Opening a source copies its sentence: if the page doesn't jump to it, press ⌘F (Ctrl+F) and paste.";

function copyQuote(source) {
  if (!source.quote || !navigator.clipboard) return; // TODO(edge): plain http has no clipboard API
  navigator.clipboard.writeText(source.quote);
}

function SourceList({ sources }) {
  return (
    <>
      {sources.map((s, i) => (
        <div key={s.source_id ?? s.url} className="source-item">
          <span className="source-num">{i + 1}</span>
          <div className="content">
            <span>
              <a href={s.url} target="_blank" rel="noreferrer" onClick={() => copyQuote(s)}>{s.title}</a>
              <span className="muted"> · {site(s.url)}</span>
            </span>
            {s.quote && <span className="source-quote">“{s.quote}”</span>}
          </div>
        </div>
      ))}
      {sources.some((s) => s.quote) && <span className="muted small">{COPY_HINT}</span>}
    </>
  );
}

// Shown in place of the source list when the search found results but skipped every one.
const NO_SOURCES_TITLE = 'No usable sources this time';
const NO_SOURCES_CHARTER = "Every web result was a kind of source your class charter doesn't allow, so none are shown. See which below.";
const NO_SOURCES_OTHER = "Every web result was skipped (blocked by the charter, unreachable, or no passage that answers the question). See why below.";

function NoSources({ skipped }) {
  const allCharter = skipped.every((s) => s.why === 'not_permitted' || s.why === 'not_covered');
  return (
    <div className="notice">
      <span className="notice-icon" aria-hidden="true">{allCharter ? <ScaleIcon /> : '!'}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <strong>{NO_SOURCES_TITLE}</strong>
        <span>{allCharter ? <>{NO_SOURCES_CHARTER} <a href="/charter">Read the charter</a></> : NO_SOURCES_OTHER}</span>
      </div>
    </div>
  );
}

// Ruled-out and not-covered results are shown WITHOUT a link (the charter excludes them);
// unreachable and no-answer ones are linked so the student can read them themselves.
function Skipped({ skipped, open }) {
  if (!skipped.length) return null;
  return (
    <details className="skipped" open={open}>
      <summary>{plural(skipped.length, 'result')} skipped</summary>
      <ul>
        {skipped.map((s) => (
          <li key={s.url}>
            {s.why === 'unreachable' || s.why === 'no_answer'
              ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
              : <span>{s.title}</span>}
            <span className="muted">: {s.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Progress({ answer }) {
  if (answer.done) return null;
  const labels = answer.statuses.length ? answer.statuses : ['Posting your question…'];
  return (
    <div>
      <ul className="progress" aria-live="polite">
        {labels.map((label, i) => {
          const current = i === labels.length - 1;
          return (
            <li key={i} className={current ? 'current' : ''}>
              {current ? <span className="spinner" aria-hidden="true" /> : <CheckIcon />}
              {label}
            </li>
          );
        })}
      </ul>
      <p className="muted small" style={{ margin: '-6px 18px 14px' }}>{WAIT_HINT}</p>
    </div>
  );
}

// ---------- the card ----------

export default function AnswerCard({ answer, aiReplies, onClose, onAskAgain, onPeerClick, onReplyToAi }) {
  const [aiOpen, setAiOpen] = useState(Boolean(answer.showAi)); // showAi: opened from the margin's AI button
  const [reply, setReply] = useState('');

  const sourceBlocks = answer.blocked.filter((b) => b.layer === 'sources_ai');
  const aiBlocks = answer.blocked.filter((b) => b.layer === 'ai_answer');
  // In the Sources slot only an error or a spending limit needs saying; a toggle or rule
  // there just means the library was searched instead, which isn't news to show.
  const sourceErrors = sourceBlocks.filter((b) => b.by === 'error' || b.by === 'limit');
  const hasPeer = answer.peer?.length > 0;
  const hasSources = answer.sources?.length > 0 || answer.skipped.length > 0 || sourceErrors.length > 0;
  const allSkipped = answer.sources !== null && answer.sources.length === 0 && answer.skipped.length > 0;
  const ai = answer.aiAnswer;
  const wordCount = ai ? ai.body.split(/\s+/).filter(Boolean).length : 0;
  const collapsed = aiOpen && ai; // with the explanation open, peers and sources shrink to a row each
  let n = 0; // section numbers, counting only the sections shown

  async function sendReply(event) {
    event.preventDefault();
    if (!reply.trim()) return;
    await onReplyToAi(ai.annotation_id, reply.trim());
    setReply('');
  }

  return (
    <div className="answer-card" role="dialog" aria-label="Answer">
      <div className="pointer" />
      <div className="answer-head">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h3>{answer.question}</h3>
          <span className="muted small">You · posted to the class margin</span>
        </div>
        <button type="button" className="close-button" aria-label="Close" onClick={onClose}><CloseIcon /></button>
      </div>

      {hasPeer && (
        <section className="answer-section">
          {collapsed ? (
            <button type="button" className="summary-row" onClick={() => setAiOpen(false)}>
              <strong>{++n} · From your class</strong>
              <span className="muted">{[...new Set(answer.peer.map((p) => p.author))].join(', ')}</span>
            </button>
          ) : (
            <>
              <h4>{++n} · From your class</h4>
              <PeerList peer={answer.peer} onPeerClick={onPeerClick} />
            </>
          )}
        </section>
      )}

      {hasSources && (
        <section className="answer-section">
          {collapsed ? (
            <button type="button" className="summary-row" onClick={() => setAiOpen(false)}>
              <strong>{++n} · Sources</strong>
              <span className="muted">{allSkipped ? NO_SOURCES_TITLE : answer.sources.map((s, i) => `${i + 1} · ${site(s.url)}`).join('   ')}</span>
            </button>
          ) : (
            <>
              <h4>{++n} · Sources</h4>
              {sourceErrors.map((b, i) => <CharterNotice key={i} block={b} />)}
              {allSkipped && <NoSources skipped={answer.skipped} />}
              <SourceList sources={answer.sources || []} />
              <Skipped skipped={answer.skipped} open={allSkipped} />
            </>
          )}
        </section>
      )}

      {(ai || aiBlocks.length > 0) && (
        <section className="answer-section">
          {aiOpen && ai && <h4>{++n} · AI explanation</h4>}
          {aiBlocks.map((b, i) => <CharterNotice key={i} block={b} />)}
          {ai && !aiOpen && (
            <button type="button" className="ai-button" onClick={() => setAiOpen(true)}>
              <span className="pill ai">AI</span>
              <span style={{ flex: 1 }}>{AI_BUTTON}</span>
              <ChevronIcon open={false} />
            </button>
          )}
          {ai && aiOpen && (
            <>
              <span className="small muted"><span className="pill ai">AI</span> Dialectic AI · public · {wordCount} words</span>
              <div className="ai-explanation"><WithCitations text={ai.body} sources={answer.sources} /></div>
              {aiReplies.map((r) => (
                <div key={r.id} className="reply">
                  <Avatar person={r.author} size="tiny" />
                  <span className="body"><strong>{r.author.name}</strong> {r.body}</span>
                </div>
              ))}
              <form className="reply-form" onSubmit={sendReply}>
                <label htmlFor="ai-reply" className="visually-hidden">Reply to the AI explanation</label>
                <ReplyBox id="ai-reply" placeholder="Reply to the AI explanation…" value={reply} onChange={setReply} onSend={sendReply} />
                <button type="submit" className="btn small" disabled={!reply.trim()}>Reply</button>
              </form>
            </>
          )}
        </section>
      )}

      {answer.done && !answer.error && !hasPeer && !hasSources && !ai && aiBlocks.length === 0 && (
        <section className="answer-section">
          <span className="muted">Nothing from your class or the sources yet. Your question is in the margin, so classmates can answer it.</span>
        </section>
      )}

      <Progress answer={answer} />

      {answer.error && !answer.error.sessionEnded && (
        <section className="answer-section">
          <ErrorNotice error={answer.error} title="Couldn't answer this question">
            <span className="small">Anything already shown stays.</span>
            <button type="button" className="btn small" style={{ alignSelf: 'flex-start' }} onClick={onAskAgain}>Ask again</button>
          </ErrorNotice>
        </section>
      )}
    </div>
  );
}
