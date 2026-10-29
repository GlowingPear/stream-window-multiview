// What's new in 0.4.0: ALL, a linked streamer's Kick and Twitch chats as one list, and what it can do.
// A made-up streamer (pixelpear) on Kick and Twitch, both stand-ins (stage.js); ALL is fed made-up lines in each
// site's own format (setup.js), as its readers hand them over in the real app.
const sc = require('./0.4.0-chat');
const V = '0.4.0';

module.exports = {
  name: 'stream-multiview-0.4.0',
  poster: { v: V, h: "What's new", p: 'ALL: every site\'s chat in one list, and everything you do in a chat, done from it' },
  features: 9,
  stage: { mod: 'pixelpear' },
  prepare: m => sc.prepare(m),
  async run(t) {
    const { m, wait, card, uncard, feature, cap, uncap, click, moveTo, ring, unring, type, glide } = t;
    const quiet = on => m.evaluate(on => { window.__quiet = on; }, on);
    const feed = x => sc.say(m, x);
    const ALL = '#stage .win.chat:not(.tab-hidden) ';
    const line = text => `${ALL}.all-list .al-m:has-text("${text}")`;

    // ---- Opening (the streamer linked, the window open, ALL reading, behind it)
    await card({ h: 'Stream Multiview', odo: ['0.3.30', V], items: ['ALL: Kick, Twitch and YouTube chats in one list', 'Send, reply and moderate from it', 'Pins, chat modes, emotes and alerts that follow', 'Spelling suggestions · chat actions in the search box'] });
    await sc.setup(m);
    await m.evaluate(() => { const b = document.querySelector('#stage .win.chat:not(.tab-hidden) .ptab.kick'); b && b.click(); });   // starts on Kick's own chat
    await sc.chatter(m);
    // captions in the space left of the chat window, so they never cover ALL
    await m.evaluate(() => { const r = document.querySelector('#stage .win.chat:not(.tab-hidden)').getBoundingClientRect();
      const st = document.createElement('style'); st.textContent = `#tr-cap{left:${Math.round(r.left / 2)}px;max-width:${Math.round(r.left - 48)}px}`; document.head.appendChild(st); });
    await wait(6500);
    await uncard(); await wait(700);

    // ---- 1. ALL
    await feature(V, 'ALL: every site\'s chat in one list', 'A linked streamer\'s Kick, Twitch and YouTube chats together, each line with its site', '0.3.30');
    await click(ALL + '.ptab.all'); await wait(2600);
    await feed(sc.T(sc.tmsg('ByteBun', '@pearfan are you running it tonight?', { color: '#1E90FF', badges: 'subscriber/12' }))); await wait(900);
    await feed(sc.K(sc.kmsg('mossyrock', 'pearfan you called it [emote:9100001:pearHype]', { color: '#9ACD32', badges: [{ type: 'subscriber', count: 8 }] }))); await wait(500);
    await quiet(true);
    await ring(line('are you running it tonight')); await wait(2200); await unring();
    await quiet(false); await wait(1200);

    // ---- 2. Events
    await feature(V, 'Subs, gifts and raids at a glance', 'One short line in the site\'s colour, with See it on … to jump to it');
    await feed(sc.K(sc.KF('GiftedSubscriptionsEvent', { gifter_username: 'glowmoth', gifted_usernames: ['sundew', 'paperboat', 'lowtide', 'ferngully', 'zestyplum'] }))); await wait(1300);
    await feed(sc.T(sc.TW({ 'display-name': 'TinyComet', login: 'tinycomet', 'msg-id': 'resub', id: 'e1', 'msg-param-sub-plan': '1000', 'msg-param-cumulative-months': '14', 'system-msg': 'TinyComet\\ssubscribed\\sfor\\s14\\smonths!' }, ':tmi.twitch.tv USERNOTICE #pixelpear :14 months of pears'))); await wait(1300);
    await feed(sc.T(sc.TW({ 'display-name': 'nightowl', login: 'nightowl', 'msg-id': 'raid', id: 'e2', 'msg-param-displayName': 'nightowl', 'msg-param-viewerCount': '214', 'system-msg': '214\\sraiders' }, ':tmi.twitch.tv USERNOTICE #pixelpear'))); await wait(1500);
    await quiet(true);
    await ring(`${ALL}.all-list .al-evt >> nth=-1`); await wait(2000); await unring();
    await quiet(false); await wait(600);

    // ---- 3. Send
    await feature(V, 'Send on any site from one box', 'Pick where it goes; the send button takes the site\'s colour, and :name finds its emotes');
    await quiet(true);
    await click(ALL + '.all-pick'); await wait(1100);
    await click(`${ALL}.all-menu [data-cmd="all.sendOn"] >> nth=1`); await wait(1000);
    await click(ALL + '.all-pick'); await wait(700);
    await click(`${ALL}.all-menu [data-cmd="all.sendOn"] >> nth=0`); await wait(700);
    await type(ALL + '.all-in', 'gg :pea'); await wait(1600);
    await m.fill(ALL + '.all-in', ''); await wait(300);
    await click(ALL + '.all-emo-b'); await wait(1800);
    await m.keyboard.press('Escape'); await wait(400);
    await quiet(false);

    // ---- 4. Reply
    await feature(V, 'Reply, @ and cards from ALL', 'Right-click a line: Reply threads on its own site; a name opens their card');
    await quiet(true);
    await moveTo(line('are you running it tonight'), { fx: .5 }); await wait(400);
    await m.mouse.click(...(await (async () => { const b = await m.locator(line('are you running it tonight')).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; })()), { button: 'right' }); await wait(1300);
    await click(`${ALL}.all-lm [data-cmd="all.menuReply"]`); await wait(900);
    await m.locator(ALL + '.all-in').pressSequentially('yes! 8pm', { delay: 60 }); await wait(1500);
    await m.keyboard.press('Escape'); await m.fill(ALL + '.all-in', ''); await wait(300);
    await quiet(false); await wait(500);

    // ---- 5. Mod
    await feature(V, 'Moderate from ALL', 'Where you\'re a mod: delete, timeout, ban and pin, on the right site, struck through with who did it');
    await feed(sc.K(sc.kmsg('spammy_steve', 'FREE FOLLOWERS at totally-real.example', { color: '#FF4500' }))); await wait(1200);
    await quiet(true);
    await moveTo(line('FREE FOLLOWERS')); await wait(300);
    { const b = await m.locator(line('FREE FOLLOWERS')).first().boundingBox(); await m.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: 'right' }); }
    await wait(1800);
    await moveTo(`${ALL}.all-lm [data-cmd="all.menuTimeout"]`); await wait(1400);
    await m.keyboard.press('Escape'); await wait(300);
    // what a mod sees when it's done (Kick says who did it)
    const id = await m.evaluate(() => { const f = [...window.allChat.feeds.values()][0]; return f.msgs.filter(x => /FREE FOLLOWERS/.test(x.parts.map(p => p.text || '').join(''))).pop().id; });
    await feed(sc.K(sc.KF('MessageDeletedEvent', { id: 'd1', message: { id }, aiModerated: false })));
    await wait(400); await ring(line('FREE FOLLOWERS')); await wait(2000); await unring();
    await quiet(false); await wait(400);

    // ---- 6. Pins
    await feature(V, 'Pins wait in a pill', 'A new pin makes it ping; open it for a compact strip of every site\'s pin');
    await feed(sc.K(sc.KF('PinnedMessageCreatedEvent', { message: { id: 'p1', content: 'Race starts at 8pm, be there! [emote:9100001:pearHype]', type: 'message', sender: { username: 'pixelpear', slug: 'pixelpear', identity: { color: '#7CFF4F', badges: [{ type: 'broadcaster' }] } } }, pinned_by: { username: 'pixelpear' } })));
    await wait(400); await ring(ALL + '.all-pinchip', 8); await wait(2000); await unring();
    await click(ALL + '.all-pinchip'); await wait(2200);
    await click(ALL + '.all-pinchip'); await wait(500);

    // ---- 7. Modes
    await feature(V, 'Each chat\'s modes, above the box', 'Slow mode counts down; followers- or subscribers-only closes the box and says why');
    await m.evaluate(() => {
      window.allChat.setModes('pixelpear', { modes: { slow: 30, emotes: true }, me: { signedIn: true, follower: true, followedAt: 1 } });
      window.allChat.setModes('tw:pixelpear', { modes: { followers: 10 }, me: { signedIn: true, follower: false } });
    });
    await wait(500); await ring(ALL + '.all-modes', 6); await wait(2000); await unring();
    await quiet(true);
    await click(ALL + '.all-pick'); await wait(800);
    await click(`${ALL}.all-menu [data-cmd="all.sendOn"] >> nth=1`); await wait(900);
    await ring(ALL + '.all-box', 6); await wait(2400); await unring();
    await click(ALL + '.all-pick'); await wait(600);
    await click(`${ALL}.all-menu [data-cmd="all.sendOn"] >> nth=0`); await wait(500);
    await quiet(false);

    // ---- 8. Filter
    await feature(V, 'Bots and events, your way', 'The filter pill: bots hidden or shown, events short, full or hidden');
    await click(ALL + '.all-filt'); await wait(1200);
    await click(`${ALL}.all-fm [data-cmd="all.events"] >> nth=1`); await wait(1600);
    await click(`${ALL}.all-fm [data-cmd="all.events"] >> nth=0`); await wait(600);
    await m.keyboard.press('Escape'); await wait(400);

    // ---- 9. Health
    await feature(V, 'It says when a site breaks', 'If Kick or Twitch changes their chat, ALL tells you, with Report for a fix');
    await m.evaluate(() => window.allHealth.broke('tw:pixelpear', 'read', 'Twitch\'s chat lines aren\'t reaching ALL'));
    await wait(700); await ring(ALL + '.all-health', 6); await wait(2600); await unring();
    await m.evaluate(() => window.allHealth.healed('tw:pixelpear')); await wait(500);

    // ---- And more: spelling, the search box
    await cap(V, 'Spelling suggestions in the app\'s boxes', 'Right-click a misspelled word: suggestions, Add to dictionary, Undo … Select all');
    await quiet(true);
    await type(ALL + '.all-in', 'that was amazng');
    await wait(600);
    { const b = await m.locator(ALL + '.all-in').boundingBox(); await glide(b.x + 95, b.y + b.height / 2); await m.mouse.click(b.x + 95, b.y + b.height / 2, { button: 'right' }); }
    await wait(1800);
    await click('.edit-menu .edit-mi.sug >> nth=0'); await wait(1400);
    await m.fill(ALL + '.all-in', ''); await quiet(false);
    await cap(V, 'Chat actions in the search box', 'Ctrl/⌘ K, Tab on a chat: translate it, per site in ALL');
    await m.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k'); await wait(600);
    await m.keyboard.type('pixelpear chat', { delay: 60 }); await wait(500);
    await m.keyboard.press('Tab'); await wait(500);
    await m.keyboard.type('translat', { delay: 60 }); await wait(2200);
    await m.keyboard.press('Escape'); await m.keyboard.press('Escape'); await m.keyboard.press('Escape');
    await uncap(); await wait(400);

    // ---- Outro
    await card({ h: `Get ${V}`, p: 'Settings › Updates › Check now', items: ['ALL: every site\'s chat in one list · send, reply, moderate', 'Pins · chat modes · emotes · events · health', 'Spelling suggestions · chat actions in the search box'] });
    await wait(4200);
  }
};
