// Shared by the UI test files: opens a fresh copy of the app's page in a headless browser.
// Kick, Twitch and YouTube are blocked, so the windows stay empty and the tests work offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const { playwright, serve, startCoverage, saveCoverage } = require('../helpers');

function setup() {
  let browser, server;
  test.before(async () => {
    server = await serve();
    browser = await playwright().chromium.launch();
  });
  test.after(async () => { await browser?.close(); server?.close(); });

  // A fresh copy of the app (empty saved settings). Fails the test on any page error.
  async function openApp(t, { width = 1600, height = 900, query = '' } = {}) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(u => !u.href.startsWith(server.url), r => r.abort());
    await startCoverage(page);
    await page.goto(server.url + '/src/index.html' + query);
    t.after(async () => {
      await saveCoverage(page);
      await context.close();
      assert.deepEqual(errors, [], 'the page had no errors');
    });
    return page;
  }
  return { openApp, url: () => server.url };
}

const add = async (page, ...links) => { for (const l of links) { await page.fill('#url', l); await page.click('#add'); } };
const windows = page => page.$$eval('#stage .win', els => els.map(e => ({
  kind: ['stream', 'chat', 'web', 'capture'].find(k => e.classList.contains(k)),
  title: e.querySelector('.title').textContent,
  featured: e.classList.contains('featured'),
  x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight
})));
const win = (page, title, kind = 'stream') => page.locator(`#stage .win.${kind}:has(.title:text-is("${title}"))`);
const box = async loc => { const b = await loc.boundingBox(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
const press = async (page, key) => { await page.keyboard.press(key); await page.waitForTimeout(350); };
// Drags with the mouse from one point to another in a few steps.
async function drag(page, from, to, { steps = 8, shift = false } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(to.x, to.y, { steps });
  if (shift) await page.keyboard.up('Shift');
  await page.mouse.up();
}

module.exports = { setup, add, windows, win, box, press, drag };
