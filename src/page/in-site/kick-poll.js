// Run inside a Kick chat page (turned into text, given what it needs): the poll form's request (chat/kick-poll.js).

// Starts a poll the way Kick's own "Create a new poll" form does (on the channel page), with the chat's login.
// Answers { ok, status, message }: status 0 when the request didn't get an answer, message Kick's own when it gave one.
// Kick can say no with a 200 and { status: { error: true } } (its "no poll right now" does).
async function kickPollPost(slug, poll){
  const ck = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
  const t = ck('session_token'), x = ck('XSRF-TOKEN');
  if (!t) return { ok: false, status: 401, message: '' };
  const h = { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + t };
  if (x) h['X-XSRF-TOKEN'] = x;
  try {
    const r = await fetch('/api/v2/channels/' + encodeURIComponent(slug) + '/polls', { method: 'POST', credentials: 'include', headers: h, body: JSON.stringify(poll) });
    let d = null; try { d = await r.json(); } catch {}
    const st = d && typeof d.status === 'object' ? d.status : null;
    const message = (d && typeof d.message === 'string' && d.message) || (st && typeof st.message === 'string' && st.message) || '';
    const status = st && st.error && typeof st.code === 'number' ? st.code : r.status;
    return { ok: r.ok && !(st && st.error), status, message: message.slice(0, 200) };
  } catch { return { ok: false, status: 0, message: '' }; }
}

export { kickPollPost };
