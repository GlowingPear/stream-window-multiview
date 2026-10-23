// Run inside a Kick chat page (turned into text, given what it needs): Kick's own requests, the way its channel page makes
// them, with the chat's login (chat/kick-prediction.js, chat/kick-clip.js).

// One request to Kick's API: kick.com/api/... or web.kick.com/api/... (the clips). Answers { ok, status, message, data }:
// status 0 when it didn't get an answer, 401 without a login; message Kick's own when it gave one; data what it sent back
// (its "data" when it has one). Kick can say no with a 200 and { status: { error: true } }.
async function kickApi(url, method = 'GET', body){
  const ck = n => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
  const t = ck('session_token'), x = ck('XSRF-TOKEN');
  if (!t) return { ok: false, status: 401, message: '', data: null };
  const h = { Accept: 'application/json', Authorization: 'Bearer ' + t };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (/^https:\/\/web\.kick\.com\//.test(url)) h['x-app-platform'] = 'web';   // (web.kick.com refuses an X-XSRF-TOKEN header)
  else if (x) h['X-XSRF-TOKEN'] = x;
  try {
    const r = await fetch(url, { method, credentials: 'include', headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    let d = null; try { d = await r.json(); } catch {}
    const st = d && typeof d.status === 'object' ? d.status : null;
    const message = (d && typeof d.message === 'string' && d.message) || (st && typeof st.message === 'string' && st.message) || '';
    const status = st && st.error && typeof st.code === 'number' ? st.code : r.status;
    return { ok: r.ok && !(st && st.error), status, message: message.slice(0, 200), data: d && typeof d === 'object' && 'data' in d ? d.data : d };
  } catch { return { ok: false, status: 0, message: '', data: null }; }
}

export { kickApi };
