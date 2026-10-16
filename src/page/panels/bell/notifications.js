// The notification centre (the toolbar bell): one list for everything the app tells you about, newest first.
// Used by the app page (as SmvNotes) and by the tests. It only works on plain arrays:
// the page keeps the list in localStorage (kickMultiview.notifications) and draws it.
//   kind: mention / reply / word (chat mentions), spam (likely spam), live (a saved channel went live),
//         raid (a raid was followed), app (the app's own messages, with a subject)
const SmvNotes = (() => {
  // The bell's tabs, and which tab each kind is in. Each tab keeps its own latest MAX, so a busy spam day
  // can't push your mentions out.
  const TABS = ['all', 'mentions', 'spam', 'live', 'app'];
  const TAB_OF = { mention: 'mentions', reply: 'mentions', word: 'mentions', spam: 'spam', live: 'live', raid: 'live', app: 'app' };
  const MAX = 500;
  const SUBJECTS = ['accounts', 'layouts', 'windows', 'downloads', 'updates'];
  // The sub-filters each tab has ('all' first).
  const SUBS = {
    all: ['all', 'mentions', 'spam', 'live', 'app'],
    mentions: ['all', 'mention', 'reply', 'word'],
    spam: ['all'],
    live: ['all', 'live', 'raid', 'auto'],
    app: ['all', ...SUBJECTS]
  };
  const tabOf = n => TAB_OF[n && n.kind] || 'mentions';   // mentions saved before kinds were kept are mentions

  let seq = 0;
  const newId = t => `${(t || Date.now()).toString(36)}-${(++seq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  // Only the latest MAX of each tab (the list is newest first).
  function cap(list, max = MAX) {
    const per = {};
    return list.filter(n => (per[tabOf(n)] = (per[tabOf(n)] || 0) + 1) <= max);
  }
  // A new one at the front: it gets an id and a time if it has none, and is unread unless it says otherwise.
  function add(list, n, now = Date.now()) {
    const item = { unread: true, ...n, id: n.id || newId(now), t: n.t || now };
    return cap([item, ...list]);
  }
  // Whether it's new to the red number on the bell: 'ms' mentions and spam, 'all' everything but the app's
  // own messages, 'off' nothing.
  function counts(n, mode) {
    if (!n.unread || mode === 'off') return false;
    const tab = tabOf(n);
    return mode === 'all' ? tab !== 'app' : tab === 'mentions' || tab === 'spam';
  }
  const badge = (list, mode = 'ms') => list.filter(n => counts(n, mode)).length;

  // Which sub-filter chip it's under, in its tab ('auto': a live one that opened by itself).
  function inSub(n, tab, sub) {
    if (!sub || sub === 'all') return true;
    if (tab === 'all') return tabOf(n) === sub;
    if (tab === 'mentions') return (n.kind || 'mention') === sub;
    if (tab === 'live') return sub === 'auto' ? !!n.auto : n.kind === sub;
    if (tab === 'app') return n.subject === sub;
    return true;
  }
  const PLAT = ch => /^tw:/i.test(ch) ? 'twitch' : /^yt:/i.test(ch) ? 'youtube' : 'kick';
  // The words search looks in.
  const words = (n, label) => [n.sender, n.body, n.quoted, n.word, n.title, n.category, n.text, n.detail, n.from,
    n.channel && label ? label(n.channel) : n.label || n.channel];
  // f: { tab, sub, chan (a channel), site (kick / twitch / youtube), unread, q (search), label(channel) }
  function filter(list, f = {}) {
    const tab = f.tab || 'all', q = String(f.q || '').trim().toLowerCase();
    return list.filter(n => (tab === 'all' || tabOf(n) === tab) && inSub(n, tab, f.sub)
      && (!f.chan || n.channel === f.chan) && (!f.site || (n.channel && PLAT(n.channel) === f.site))
      && (!f.unread || n.unread)
      && (!q || words(n, f.label).some(x => x != null && String(x).toLowerCase().includes(q))));
  }
  // The number on each sub-filter chip of a tab: { all, mention, ... } (the other filters still apply).
  function subCounts(list, f = {}) {
    const tab = f.tab || 'all', out = {};
    SUBS[tab].forEach(s => { out[s] = filter(list, { ...f, sub: s }).length; });
    return out;
  }
  // The chats in a list, busiest first: [[channel, how many]].
  function chats(list) {
    const per = new Map();
    list.forEach(n => { if (n.channel) per.set(n.channel, (per.get(n.channel) || 0) + 1); });
    return [...per].sort((a, b) => b[1] - a[1]);
  }
  // "Today", "Yesterday" or the date.
  function dayLabel(t, now = Date.now()) {
    const d = new Date(t), today = new Date(now); today.setHours(0, 0, 0, 0);
    const days = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    return days === 0 ? 'Today' : days === 1 ? 'Yesterday'
      : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
  }
  // [{ day, items }], in the list's order.
  function byDay(list, now = Date.now()) {
    const out = [];
    list.forEach(n => {
      const day = dayLabel(n.t, now);
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(n);
    });
    return out;
  }

  // From before the bell: the mentions history (already in this shape) and spam alerts' history (seen, with
  // no unread mark), into one list, newest first. Anything that isn't an object is left out.
  function migrate(mentions, spamHist) {
    const ok = x => x && typeof x === 'object' && !Array.isArray(x);
    const m = (Array.isArray(mentions) ? mentions : []).filter(ok).map(x => ({ ...x, kind: x.kind || 'mention', id: x.id || newId(x.t) }));
    const s = (Array.isArray(spamHist) ? spamHist : []).filter(ok).map(x => ({ ...x, kind: 'spam', unread: false, id: x.id || newId(x.t) }));
    return cap([...m, ...s].sort((a, b) => (b.t || 0) - (a.t || 0)));
  }

  return { add, cap, badge, counts, filter, subCounts, chats, dayLabel, byDay, migrate, tabOf, TABS, SUBS, SUBJECTS, MAX };
})();

export { SmvNotes };
