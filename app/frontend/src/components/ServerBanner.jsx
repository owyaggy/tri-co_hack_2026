import { useEffect, useState } from 'react';
import { onServerState } from '../api.js';

// A strip at the top of every page for the on-demand server's two states (api.js): waking up,
// and the demo pass having run out. "Start again" is a plain link, not a router Link: it needs a
// full page load so the Worker can show its Start page.
export default function ServerBanner() {
  const [state, setState] = useState('ok');
  useEffect(() => onServerState(setState), []);
  if (state === 'waking') {
    return <div className="server-banner" role="status">Waking the server… this can take up to a minute.</div>;
  }
  if (state === 'ended') {
    return (
      <div className="server-banner ended" role="alert">
        This demo session ended. <a href="/">Start again</a>
      </div>
    );
  }
  return null;
}
