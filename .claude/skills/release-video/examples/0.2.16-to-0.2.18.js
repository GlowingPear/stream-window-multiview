// What's new from 0.2.16 to 0.2.18: three releases, eleven features. Shows the usual moves: features
// added behind the opening card, a chip that flips to the next version, a spotlight ring, the hidden bar
// coming back at the top edge, a user card in a chat, and mention and spam alerts from stand-in chatters.
// Written for the app as it was in 0.2.18 (later versions moved some settings), so record it from that version:
//   git worktree add .worktrees/v0.2.18 v0.2.18 && (cd .worktrees/v0.2.18 && npm install)
//   node .claude/skills/release-video/video.js .claude/skills/release-video/examples/0.2.16-to-0.2.18.js --dir .worktrees/v0.2.18
module.exports = {
  name: 'stream-multiview-0.2.16-to-0.2.18',
  poster: { v: '0.2.16 → 0.2.18', h: "What's new", p: 'Settings window, mention and spam alerts, Auto layout, mod view and more' },
  features: 11,
  stage: { mod: 'nightowl' },
  async run(t) {
    const { m, wait, card, uncard, feature, cap, uncap, ring, unring, glide, moveTo, click, type, chatSay, inChat, clickInChat } = t;

    // ---- Opening (channels are added and tiled behind it)
    await card({ h: 'Stream Multiview', odo: ['0.2.16', '0.2.17', '0.2.18'], items: ['Mod view button · user cards that fit · formatted release notes', 'Auto layout · tooltips · in-app dialogs · faster live checks', 'A Settings window · mention alerts · spam alerts'] });
    await t.add(t.stage.CHANNELS.slice(0, 3));
    await m.evaluate(() => document.querySelector('#tile').click());   // Tile sits in the More menu at this width
    await wait(5200);
    await uncard(); await wait(900);

    // ---- 0.2.16
    await feature('0.2.16', 'Mod view button', "A shield on channels you moderate opens the site's mod dashboard. Only where you're a mod");
    await ring('#stage .win.stream:has(.title:text-is("nightowl")) [data-a="mod"]', 5); await wait(400);
    await moveTo('#stage .win.stream:has(.title:text-is("nightowl")) [data-a="mod"]'); await wait(2400);
    await ring('#stage .win.chat:has(.title:text-is("nightowl")) [data-a="mod"]', 5); await moveTo('#stage .win.chat:has(.title:text-is("nightowl")) [data-a="mod"]'); await wait(2000);
    await ring('#stage .win.stream:has(.title:text-is("pixelpear")) .btns', 6); await moveTo('#stage .win.stream:has(.title:text-is("pixelpear")) .btns', { fx: .8 }); await wait(2000);
    await unring();

    await feature('0.2.16', 'User cards that fit the chat', 'Click a name: Kick and Twitch cards stay inside the chat window instead of off its edge');
    await clickInChat('arcadia', `[...document.querySelectorAll('.row b')].at(-3)`); await wait(3600);
    await inChat('arcadia', `document.getElementById('user-identity')?.remove()`); await wait(500);

    await feature('0.2.16', 'Release notes, formatted', 'New installs check for updates again, and the notes look the way GitHub shows them');
    await click('#settingsBtn'); await wait(400);
    await click('#settingsDlg .st-rail [data-s="updates"]'); await wait(1400);
    await moveTo('#settingsDlg .upd-notes'); await wait(1600);
    for (let i = 0; i < 9; i++) { await m.mouse.wheel(0, 40); await wait(70); } await wait(2800);
    await m.keyboard.press('Escape'); await wait(400);

    // ---- 0.2.17 (the chip flips from 0.2.16)
    await feature('0.2.17', 'Auto layout fills the space', 'Any number of streams and chats: streams in a grid, chats beside them', '0.2.16');
    await type('#url', 'tidepool'); await m.keyboard.press('Enter'); await wait(900);
    await m.fill('#url', 'emberfox'); await m.keyboard.press('Enter'); await wait(900);
    await click('#layoutBtn'); await wait(600);
    await click('#layoutMenu [data-l="auto"]'); await wait(2400);
    await type('#url', 'lofilane'); await m.keyboard.press('Enter'); await wait(800);
    await click('#layoutBtn'); await wait(400); await click('#layoutMenu [data-l="auto"]'); await wait(2600);

    await feature('0.2.17', "The app's own tooltips, everywhere", 'Short names on icon buttons, with the longer explanation underneath');
    await moveTo('#settingsBtn'); await wait(1500);
    await moveTo('#undoBtn'); await wait(1400);
    await moveTo('#stage .win.stream [data-a="star"]'); await wait(1400);
    await moveTo('#stage .win.stream [data-a="mod"]:not([hidden])'); await wait(1500);

    await feature('0.2.17', 'An in-app confirm dialog', "Matches your theme instead of the browser's pop-up");
    await click('#clear'); await wait(2300);
    await click('#askDlg .ask-no'); await wait(600);

    // the bar hides once the pointer leaves it, and comes back at the top edge
    await feature('0.2.17', 'Hide bar fix', 'While the bar is hidden the button says Show bar, and brings it back');
    await click('#focusBtn'); await wait(500);
    await glide(760, 380, { steps: 24, linear: true }); await wait(2200);
    await glide(1150, 2, { steps: 24 }); await wait(1200);
    await click('#focusBtn'); await wait(500);
    await moveTo('#stage'); await wait(1200);

    await feature('0.2.17', 'Faster live checks', 'Many channels checked at once, plus an optional YouTube API key');
    await click('#settingsBtn'); await wait(500);
    await click('#settingsDlg .st-rail [data-s="accounts"]'); await wait(500);
    await moveTo('#settingsDlg .am-yk-in'); await wait(2600);
    await m.keyboard.press('Escape'); await uncap(); await wait(400);

    // ---- 0.2.18
    await feature('0.2.18', 'One Settings window', "Gear button, Ctrl+, / Cmd+, or the menu bar. Help and What's new live here too", '0.2.17');
    await click('#settingsBtn'); await wait(700);
    for (const s of ['general', 'accounts', 'mentions', 'spam', 'themes', 'updates', 'keys']) { await click(`#settingsDlg .st-rail [data-s="${s}"]`); await wait(900); }
    await m.keyboard.press('Escape'); await wait(300);

    await feature('0.2.18', 'Mention alerts', 'Someone @s you: that chat window lights up until you look at it');
    await click('#settingsBtn'); await wait(400);
    await click('#settingsDlg .st-rail [data-s="accounts"]'); await wait(300);
    await type('#mentUser', 'pearfan'); await m.keyboard.press('Enter'); await wait(600);
    await click('#settingsDlg .st-rail [data-s="mentions"]'); await wait(500);
    if (!(await m.isChecked('#mentOn'))) await click('#settingsDlg label:has(#mentOn)', { fx: .95 });
    await m.selectOption('[data-al="mention.hl"]', 'until'); await m.selectOption('[data-al="mention.esc"]', '10'); await m.selectOption('[data-al="mention.max"]', 'pulse');
    await moveTo('[data-al="mention.hl"]'); await wait(1600);
    await m.keyboard.press('Escape'); await wait(3200);   // the chat reader treats what's already there as old
    await chatSay('arcadia', 'bytebun', '@pearfan are you joining the race later?');
    await wait(4500);
    await click('#mentBtn'); await wait(2600);
    await m.keyboard.press('Escape'); await wait(400);
    await click('#stage .win.chat:has(.title:text-is("arcadia")) .bar', { fx: .55 }); await wait(1200);

    await feature('0.2.18', 'Spam alerts for moderators (Beta)', 'Scores messages in chats you moderate. Never hides, deletes or reports anything');
    await click('#settingsBtn'); await wait(400);
    await click('#settingsDlg .st-rail [data-s="spam"]'); await wait(600);
    if (!(await m.isChecked('#spamOn'))) await click('#settingsDlg label:has(#spamOn)', { fx: .95 });
    await wait(800);
    await click('#spamTabs [data-t="how"]'); await wait(2400);
    await click('#spamTabs [data-t="try"]'); await wait(400);
    await type('#spamTry', 'free stream upgrades at boostr dot com zero cost viewers'); await wait(300);
    await click('#spamTryBtn'); await wait(3000);
    await m.keyboard.press('Escape'); await wait(3200);
    await cap('0.2.18', 'Likely spam is tagged, and the window lights up', "Only in chats where you're a moderator");
    await chatSay('nightowl', 'newacct77', 'hq stream upgrades at boostr com zero cost viewers');
    await wait(5200);

    // ---- Outro
    await uncap();
    await card({ h: 'Get 0.2.18', p: 'Settings › Updates › Check now', items: ['Settings window · Mention alerts · Spam alerts (Beta)', 'Auto layout · Faster live checks · Tooltips · In-app dialogs', 'Mod view · User cards that fit · Formatted release notes'] });
    await wait(3800);
  }
};
