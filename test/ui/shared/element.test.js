// Building elements in code (src/page/shared/element.js), in the page itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../app');

const { openApp } = setup();

test('element(): text stays text, props become classes, data, styles, handlers and attributes', async t => {
  const page = await openApp(t);
  const r = await page.evaluate(async () => {
    const { element, esc } = await import('/src/page/shared/element.js');
    let clicked = 0;
    const row = element('div', { class: 'sv live', title: 'Open it', dataset: { ch: 'tw:owl' }, style: { '--c': 'red', marginTop: '3px' },
      hidden: false, role: 'button', tabIndex: 0, onclick: () => clicked++ },
      element('span', 'nm', '<img src=x onerror=alert(1)>'), null, false, '', ' live', element('i', { html: '<b>icon</b>' }));
    row.click();
    const box = element('input', { type: 'checkbox', disabled: true });
    const attrs = Object.fromEntries([...row.attributes].map(a => [a.name, a.value]));
    return { html: row.innerHTML, attrs, clicked, text: row.querySelector('.nm').textContent, imgs: row.querySelectorAll('img').length,
      box: [box.type, box.disabled], esc: esc('<a href="x">&</a>'), esc1: esc("it's") };
  });
  assert.equal(r.imgs, 0, 'a name with markup in it is only text');
  assert.equal(r.text, '<img src=x onerror=alert(1)>');
  assert.equal(r.clicked, 1);
  assert.deepEqual(r.attrs, { class: 'sv live', title: 'Open it', 'data-ch': 'tw:owl', style: '--c: red; margin-top: 3px;', role: 'button', tabindex: '0' },
    'hidden: false leaves it out');
  assert.equal(r.html, '<span class="nm">&lt;img src=x onerror=alert(1)&gt;</span> live<i><b>icon</b></i>', 'null, false and empty text left out');
  assert.deepEqual(r.box, ['checkbox', true]);
  assert.equal(r.esc, '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  assert.equal(r.esc1, 'it&#39;s', 'single quotes too (an attribute in \'…\')');
});
