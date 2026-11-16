// A failed request, shown with the server's real message (CLAUDE.md: fail loudly).
// Not when the demo pass ran out: ServerBanner says that once, instead of on every card.
export default function ErrorNotice({ error, title = 'Something went wrong', children }) {
  if (!error || error.sessionEnded) return null;
  return (
    <div className="notice error" role="alert">
      <span className="notice-icon" aria-hidden="true">!</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <strong>{title}</strong>
        <span className="error-text">{String(error.message || error)}</span>
        {children}
      </div>
    </div>
  );
}
