// Run inside a Kick chat page (turned into text, given what they need): the poll form's request and tidying up after it
// (chat/kick-poll.js).

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

// Empties Kick's chat box (it still says "/poll …"), as Kick's channel page does once the form opens. The box is a Lexical
// editor: changing its text directly would leave the editor out of step, so it's given an empty state instead.
function kickClearBox(){
  const b = document.querySelector('[data-testid="chat-input"]'), ed = b && b.__lexicalEditor;
  if (!ed) return false;
  try {
    ed.setEditorState(ed.parseEditorState('{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'));
    return true;
  } catch { return false; }
}

export { kickClearBox, kickPollPost };
