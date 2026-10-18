// Building the page's elements in code.
//   element('div', { class: 'row', title: 'Open it', onclick: open }, icon, element('b', null, name), ' live')
//   element('span', 'nm', name)                     props can be just the class name
// Children are elements, or text: text is always text, so a channel's name or a chat message can never be read
// as HTML; null, false and '' are left out. Props: class, dataset ({ ch } becomes data-ch), style (text, or an
// object, '--custom' properties too), on… (an event handler, like el.onclick = …), html (fixed markup only,
// such as an icon), true for an attribute that's just there, null / false to leave it out; anything else is set
// as the element's property where it has one (title, hidden, disabled, value, tabIndex, …), else as an attribute.
function element(tag, props, ...children){
  const el = document.createElement(tag);
  if (typeof props === 'string'){ if (props) el.className = props; }
  else if (props) for (const [k, v] of Object.entries(props)){
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) el.style.setProperty(p.startsWith('--') ? p : p.replace(/[A-Z]/g, c => '-' + c.toLowerCase()), x);
    else if (k === 'html') el.innerHTML = v;
    else if (/^on[a-z]+$/.test(k)) el[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else if (k in el && !k.includes('-')) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false && c !== '') el.append(c instanceof Node ? c : String(c));
  return el;
}

// Text for markup that has to be a string (innerHTML of fixed markup with a value in it, a title="…")
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export { element, esc };
