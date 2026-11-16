import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, isProfessor, post } from '../api.js';
import NavHeader from '../components/NavHeader.jsx';
import ErrorNotice from '../components/ErrorNotice.jsx';

// S02: course home. Reading cards, the professor's upload card, the charter and library cards.

// While a reading's scan is being OCR'd (SPEC §3.11), refresh the course this often.
const PROCESSING_POLL_MS = 3000;

// The charter switches shown as pills on the charter card, in this order.
const CHARTER_PILLS = [
  { key: 'ai_find_sources', on: 'AI finds sources', off: 'AI finds no sources' },
  { key: 'ai_explanations', on: 'AI explains', off: 'No AI explanations' },
  { key: 'annotate_before_peers', on: 'Notes before peers', off: 'Peers shown at once', color: 'lavender' },
];

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function uploadedWhen(createdAt) {
  const date = new Date(createdAt);
  const minutes = (Date.now() - date) / 60000;
  if (minutes < 2) return 'uploaded just now';
  if (minutes < 60 * 12) return `uploaded at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return `uploaded ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

function UploadCard({ onUploaded }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function upload(event) {
    event.preventDefault();
    const form = new FormData();
    form.append('title', title);
    form.append('file', file);
    setBusy(true);
    setError(null);
    try {
      await post('/readings', form);
      setTitle('');
      setFile(null);
      onUploaded();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="upload-card" onSubmit={upload}>
      <strong>Upload a reading</strong>
      <div className="upload-row">
        <label htmlFor="title" className="visually-hidden">Title</label>
        <input id="title" className="input" type="text" placeholder="Title" value={title} required onChange={(e) => setTitle(e.target.value)} />
        <label htmlFor="file" className="file-label">{file ? file.name : 'Choose PDF'}</label>
        <input id="file" className="visually-hidden" type="file" accept="application/pdf" required onChange={(e) => setFile(e.target.files[0] || null)} />
        <button type="submit" className="btn dark" disabled={busy || !file || !title.trim()}>{busy ? 'Uploading…' : 'Upload'}</button>
      </div>
      <span className="muted small">We read the text of each page (scans too) so the class can search it and ask about it.</span>
      <ErrorNotice error={error} title="Upload failed" />
    </form>
  );
}

export default function Course() {
  const [course, setCourse] = useState(null);
  const [charter, setCharter] = useState(null);
  const [sources, setSources] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    get('/course').then(setCourse).catch(setError);
    get('/charter').then(setCharter).catch(setError);
    get('/sources').then(setSources).catch(setError);
  }
  useEffect(load, []);

  // Uploads come back "processing" while the server OCRs them; poll until they're ready or failed.
  const processing = course?.readings.some((r) => r.status === 'processing');
  useEffect(() => {
    if (!processing) return undefined;
    const timer = setInterval(() => get('/course').then(setCourse).catch(setError), PROCESSING_POLL_MS);
    return () => clearInterval(timer);
  }, [processing]);

  const professor = isProfessor();

  return (
    <>
      <NavHeader />
      <div className="page-body">
        <ErrorNotice error={error} title="Couldn't load the course" />
        {course && (
          <>
            <div className="page-title">
              <span className="pill mint">{course.course.current_cohort}</span>
              <h1>{course.course.title}</h1>
            </div>
            <div className="course-grid">
              <section>
                <h2 className="section-label">Readings</h2>
                {course.readings.length === 0 && (
                  <div className="empty">
                    <strong style={{ display: 'block', color: 'var(--ink)' }}>No readings yet</strong>
                    {professor ? 'Upload a PDF to start.' : "Your professor hasn't added a reading yet."}
                  </div>
                )}
                {course.readings.map((reading) => reading.status !== 'ready' ? (
                  // Not openable yet: still being OCR'd, or it failed (show the error; fail loudly).
                  <div key={reading.id} className="card reading-card">
                    <span className="pdf-thumb">PDF</span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <strong>{reading.title}</strong>
                      <span className="muted" style={{ fontSize: 13 }}>
                        {reading.filename} · {reading.status === 'processing'
                          ? 'Reading the scan… (about 5 s a page)'
                          : <span style={{ color: 'var(--danger)' }}>Couldn't read this file: {reading.error}</span>}
                      </span>
                    </span>
                  </div>
                ) : (
                  <Link key={reading.id} to={`/readings/${reading.id}`} className="card reading-card">
                    <span className="pdf-thumb">PDF</span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <strong>{reading.title}</strong>
                      <span className="muted" style={{ fontSize: 13 }}>
                        {reading.filename} · {plural(reading.page_count, 'page')} · {uploadedWhen(reading.created_at)}
                      </span>
                    </span>
                    <span className="muted" style={{ fontSize: 13, textAlign: 'right' }}>
                      {plural(reading.note_count, 'note')}<br />{plural(reading.question_count, 'question')}
                    </span>
                  </Link>
                ))}
                {/* uploads_enabled: off on the public copy (UPLOADS_ENABLED=0, explainers/security.md) */}
                {professor && course.uploads_enabled && <UploadCard onUploaded={load} />}
              </section>

              <aside>
                <h2 className="section-label">Class</h2>
                {charter && (
                  <Link to="/charter" className="card side-card">
                    <strong style={{ fontSize: 15 }}>Class charter</strong>
                    <span className="pill-row">
                      {!charter.ai_enabled && <span className="pill off">AI off</span>}
                      {charter.ai_enabled && CHARTER_PILLS.map((pill) => (
                        <span key={pill.key} className={`pill ${charter[pill.key] ? pill.color || 'mint' : 'off'}`}>
                          {charter[pill.key] ? pill.on : pill.off}
                        </span>
                      ))}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--soft-ink)' }}>
                      {charter.comments.length === 0 ? 'No proposals yet' : `${plural(charter.comments.length, 'proposal')} from the class`}
                    </span>
                  </Link>
                )}
                {sources && (
                  <Link to="/sources" className="card side-card">
                    <strong style={{ fontSize: 15 }}>Source library</strong>
                    <span style={{ fontSize: 13, color: 'var(--soft-ink)' }}>
                      {sources.length === 0 ? 'Empty. It fills up as the class asks questions.' : `${plural(sources.length, 'source')} found so far.`}
                    </span>
                  </Link>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </>
  );
}
