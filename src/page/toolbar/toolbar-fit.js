import '../panels/profiles/profiles.js';   // runs after it (see app.js)
import { closeOnOutside } from '../shared/popover.js';
import { $ } from '../core.js';
import { placeMenu } from './toolbar.js';

/* ---- The toolbar fits any window. On top: the brand's name goes and the gaps get tighter (c1), then Layout loses
   its name (c2), then the least-used buttons move into the ⋯ More menu (in this order) until everything fits, and
   last Logins, Channels and Profiles lose theirs (c3). On the left the same buttons move into ⋯ when the column is
   too short. Logins, Channels, Layout, Notifications and Settings never go into ⋯. ---- */
(() => {
  const hdr = document.querySelector('header'), moreBtn = $('#moreBtn'), moreMenu = $('#moreMenu');
  const ORDER = ['#clear', '#popBtn', '#capBtn', '#swBtn', '#redoBtn', '#undoBtn', '#focusBtn', '#profBtn', '#tile', '#spotBtn'];
  const items = ORDER.map(sel => $(sel)).filter(Boolean).map(el => {
    const mark = document.createComment(' ' + el.id + ' ');        // where it goes back in the toolbar
    el.before(mark);
    return { el, mark };
  });
  const shown = el => !el.hidden && getComputedStyle(el).display !== 'none';
  const left = () => document.body.classList.contains('bar-left');
  const fits = () => left() ? hdr.scrollHeight <= hdr.clientHeight + 1 : hdr.scrollWidth <= hdr.clientWidth + 1;
  // a divider only between two groups that both have something showing
  function tidySeps(){
    for (const sp of hdr.querySelectorAll(':scope > .sep')){
      sp.hidden = false;
      let before = false, after = false;
      for (let n = sp.previousElementSibling; n && !n.matches('.spacer') && !(n.matches('.sep') && !n.hidden); n = n.previousElementSibling)
        if (n.matches('.btn') && shown(n)){ before = true; break; }
      for (let n = sp.nextElementSibling; n && !n.matches('.sep'); n = n.nextElementSibling)
        if (n.matches('.btn') && n !== moreBtn && n.id !== 'barFold' && shown(n)){ after = true; break; }
      sp.hidden = !(before && after);
    }
  }
  let fitting = false, queued = false;
  function fitHeader(){
    queued = false; fitting = true;
    hdr.classList.add('measuring');                      // buttons at full size while measuring, so squashed ones count as not fitting
    // start from the full toolbar
    items.forEach(({ el, mark }) => { if (el.parentNode !== hdr) mark.after(el); });
    hdr.classList.remove('c1', 'c2', 'c3');
    moreBtn.hidden = true;
    tidySeps();
    if (!left()) for (const c of ['c1', 'c2']){ if (fits()) break; hdr.classList.add(c); }
    if (!fits()){
      moreBtn.hidden = false;
      for (const { el } of items){
        if (fits()) break;
        if (!shown(el)) continue;
        moreMenu.appendChild(el);
        tidySeps();
      }
    }
    if (!left() && !fits()) hdr.classList.add('c3');
    // the More button only shows when something visible is in it
    moreBtn.hidden = ![...moreMenu.children].some(el => !el.hidden);
    if (moreBtn.hidden) moreMenu.hidden = true;
    tidySeps();
    hdr.classList.remove('measuring');
    obs.takeRecords();                                   // ignore our own changes
    fitting = false;
  }
  const refit = () => { if (fitting || queued) return; queued = true; requestAnimationFrame(fitHeader); };
  const obs = new MutationObserver(refit);
  obs.observe(hdr, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  obs.observe(moreMenu, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(refit).observe(document.body, { attributes: true, attributeFilter: ['class'] });   // toolbar moved to the left or back
  new ResizeObserver(refit).observe(hdr);
  window.addEventListener('resize', refit);
  if (document.fonts) document.fonts.ready.then(refit);

  moreBtn.onclick = () => {
    moreMenu.hidden = !moreMenu.hidden;
    if (!moreMenu.hidden) placeMenu(moreMenu, moreBtn, true);
  };
  // a button in the menu does its job and closes the menu
  moreMenu.addEventListener('click', e => {
    const b = e.target.closest('.btn');
    if (b) moreMenu.hidden = true;     // runs after the button's own click
  });
  closeOnOutside(moreMenu, { button: moreBtn });
  fitHeader();
})();
