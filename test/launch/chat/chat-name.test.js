// Channel name in chat boxes in the real app: switched on in Settings, an open chat's box says the channel's name,
// then your text as you type it, also after the chat loads again; switched off, the site's own text is back.
const test = require('node:test');
const { launchApp, viewLoaded, assert, openChannel, inView } = require('../app');

// Kick's chat box as its popout chat has it: the editor, and the element after it with the empty box's text
const KICK_BOX = '<div class="relative w-full"><div data-testid="chat-input" contenteditable="true" class="editor-input"><p class="editor-paragraph"><br></p></div><div class="pointer-events-none absolute">Send a message</div></div>';
let a;
test.before(async () => {
  a = await launchApp();
  await openChannel(a.win, 'alpha');
  await viewLoaded(a.win, 'alpha', 'chat', /popout\/alpha\/chat/);
});
test.after(async () => { if (a) { assert.deepEqual(a.errors, [], 'the page had no errors'); await a.close(); } });

const addBox = () => inView(a.win, 'alpha', 'chat', html => { const d = document.createElement('div'); d.innerHTML = html; document.body.append(d); }, KICK_BOX);
const says = () => inView(a.win, 'alpha', 'chat', () => { const h = document.querySelector('[data-testid="chat-input"] ~ div'); return h ? h.textContent : null; });
async function until(want, what) {
  let last;
  for (const end = Date.now() + 10000; Date.now() < end; ) { last = await says().catch(() => null); if (last === want) return; await new Promise(r => setTimeout(r, 150)); }
  assert.fail(`${what}: wanted "${want}", the box says "${last}"`);
}

test('Channel name in chat boxes: on, the box says the channel; your text as you type it; off, the site\'s text', { timeout: 60000 }, async () => {
  await addBox();
  assert.equal(await says(), 'Send a message', 'off at first: the site\'s text');
  await a.win.evaluate(() => window.openSettings('chat'));
  await a.win.check('#chatNameSet');
  await until('alpha', 'switched on: the channel\'s name');
  await a.win.fill('#chatNameText', 'Chat in {channel}');
  await until('Chat in alpha', 'your text');
  // the chat loads again: its new page gets it too, once its box is there
  await a.win.evaluate(() => document.querySelector('#stage .win.chat .bar [data-a=reload]').click());
  await new Promise(r => setTimeout(r, 500));
  await viewLoaded(a.win, 'alpha', 'chat', /popout\/alpha\/chat/);
  await addBox();
  await until('Chat in alpha', 'after loading again');
  await a.win.uncheck('#chatNameSet');
  await until('Send a message', 'switched off');
});
