import { badgeKinds } from '../../chat/feed-badges.js';

/* ---- YouTube's chat data (its in-site/feed tap) as ALL's messages (chat/feed-parse.js says what a message is) ----
   The actions of its get_live_chat answers. Nothing here touches the page (the unit tests load it on its own). */
const ytText = runs => (runs || []).map(r => r.text || (r.emoji && (r.emoji.shortcuts || [])[0]) || '').join('');
function ytParts(runs){
  return (runs || []).map(r => {
    if (r.text) return { text: r.text };
    const e = r.emoji; if (!e) return null;
    const img = e.image && e.image.thumbnails && e.image.thumbnails[0];
    return e.isCustomEmoji && img ? { emote: img.url, name: (e.shortcuts || [])[0] || '' } : { text: (e.emojiId && !/^UC/.test(e.emojiId) ? e.emojiId : (e.shortcuts || [])[0]) || '' };
  }).filter(p => p && (p.text || p.emote));
}
function ytBadges(list){
  return badgeKinds((list || []).map(b => {
    const r = b.liveChatAuthorBadgeRenderer || {}, type = r.icon && r.icon.iconType;
    return type ? type.toLowerCase() : r.customThumbnail ? 'member' : '';
  }));
}
// YouTube's: a member's badge is the channel's own picture; its others (owner, moderator, verified) are its icons
function ytPics(list){
  return (list || []).map(b => {
    const r = b.liveChatAuthorBadgeRenderer || {}, type = r.icon && r.icon.iconType, th = r.customThumbnail && r.customThumbnail.thumbnails;
    if (type) return { set: type.toLowerCase(), v: '1' };
    const url = th && th.length && th[th.length - 1].url;
    return url ? { url, title: (r.tooltip || r.accessibility && r.accessibility.accessibilityData && r.accessibility.accessibilityData.label || 'Member') } : null;
  }).filter(Boolean);
}
// A YouTube poll: { kind: 'poll', state ('open', 'update'), id, question, meta (its "who · how many votes" line),
// choices: [{ text, ratio (0 to 1: of the votes, 0 before any) }] }
// An amount of money as a number ("$1,234.50", "1.234,50 €", "¥500"): the screen reader's own (in-site/mentions.js)
const moneyOf = t => { const c = String(t || '').replace(/[^\d.,]/g, ''); return +(/,\d{2}$/.test(c) ? c.replace(/\./g, '').replace(',', '.') : c.replace(/,/g, '')) || 0; };
const ytWords = t => (t && (t.simpleText || ytText(Array.isArray(t.runs) ? t.runs : []))) || '';   // (a text YouTube gives as simpleText or runs)
function ytPoll(p, state){
  const h = (p.header && p.header.pollHeaderRenderer) || {}, id = String(p.liveChatPollId || '');
  const choices = (Array.isArray(p.choices) ? p.choices : []).map(c => ({ text: ytWords(c && c.text).trim(), ratio: Math.min(1, Math.max(0, +(c && c.voteRatio) || 0)) })).filter(c => c.text);
  if (!id || !choices.length) return null;
  return { site: 'youtube', kind: 'poll', state, id, t: Date.now(), question: ytWords(h.pollQuestion).trim(), meta: ytWords(h.metadataText).replace(/\s+/g, ' ').trim(), choices };
}
function parseYouTube(action){
  if (!action || typeof action !== 'object') return null;
  // a message deleted: taken away, or marked deleted ("Message deleted" where it was)
  const del = action.removeChatItemAction || action.markChatItemAsDeletedAction;
  if (del) return del.targetItemId ? { site: 'youtube', kind: 'delete', target: del.targetItemId, t: Date.now() } : null;
  // a message pinned at the top of the chat (a banner), or taken down
  const banner = action.addBannerToLiveChatCommand && ((action.addBannerToLiveChatCommand.bannerRenderer || {}).liveChatBannerRenderer || {});
  if (banner){
    const r = banner.contents && banner.contents.liveChatTextMessageRenderer; if (!r || !banner.actionId) return null;
    const m = parseYouTube({ addChatItemAction: { item: { liveChatTextMessageRenderer: r } } });
    return m ? { site: 'youtube', kind: 'pin', id: banner.actionId, msg: m, t: Date.now() } : null;
  }
  if (action.removeBannerForLiveChatCommand) return { site: 'youtube', kind: 'unpin', id: action.removeBannerForLiveChatCommand.targetActionId || '', t: Date.now() };
  if (action.markChatItemsByAuthorAsDeletedAction) return { site: 'youtube', kind: 'clear', userId: action.markChatItemsByAuthorAsDeletedAction.externalChannelId, t: Date.now() };
  // all of someone's messages taken away (YouTube hides them, or a moderator removed them): as a ban here
  if (action.removeChatItemByAuthorAction) return action.removeChatItemByAuthorAction.externalChannelId ? { site: 'youtube', kind: 'clear', userId: String(action.removeChatItemByAuthorAction.externalChannelId), t: Date.now() } : null;
  // a poll: opened over the chat, its votes as they come, closed
  const poll = (action.showLiveChatActionPanelAction && (((action.showLiveChatActionPanelAction.panelToShow || {}).liveChatActionPanelRenderer || {}).contents || {}).pollRenderer)
    || (action.updateLiveChatPollAction && (action.updateLiveChatPollAction.pollToUpdate || {}).pollRenderer);
  if (poll) return ytPoll(poll, action.showLiveChatActionPanelAction ? 'open' : 'update');
  if (action.closeLiveChatActionPanelAction) return action.closeLiveChatActionPanelAction.targetPanelId ? { site: 'youtube', kind: 'poll', state: 'close', id: String(action.closeLiveChatActionPanelAction.targetPanelId), t: Date.now() } : null;
  // (a message YouTube held back, let through: it takes the place of its stand-in, which ALL leaves out; as the
  // stand-in's id, so one already here isn't shown twice)
  const put = action.replaceChatItemAction, item = (action.addChatItemAction && action.addChatItemAction.item) || (put && put.replacementItem); if (!item) return null;
  const [type] = Object.keys(item), r = put && put.targetItemId ? { ...item[type], id: put.targetItemId } : item[type] || {};
  if (!r.id) return null;
  // a gift (YouTube's Jewels gifts): its own words ("sent …"), the gift picked out
  if (type === 'giftMessageViewModel'){
    const who = String((r.authorName && r.authorName.content) || '').trim() || 'Someone', said = String((r.text && r.text.content) || '').trim() || 'sent a gift', what = /^sent (.+)$/i.exec(said);
    return { site: 'youtube', kind: 'event', event: 'gift', id: r.id, t: Math.round(+r.timestampUsec / 1000) || Date.now(), sender: who, login: who.replace(/^@/, '').toLowerCase(), color: '', userId: '',
      badges: [], pics: [], text: `${who} ${said}`, summary: [{ strong: who }, ...(what ? [{ text: ' sent ' }, { strong: what[1] }] : [{ text: ' ' + said }])], parts: [] };
  }
  // a message YouTube held for review, to moderators (Show lets it through: replaceChatItemAction on its id; Hide takes it away)
  if (type === 'liveChatAutoModMessageRenderer'){
    const inner = r.autoModeratedItem && r.autoModeratedItem.liveChatTextMessageRenderer;
    const msg = inner && parseYouTube({ addChatItemAction: { item: { liveChatTextMessageRenderer: { ...inner, id: r.id } } } });
    return msg ? { site: 'youtube', kind: 'held', id: r.id, msg, status: 'PENDING', why: '', note: ytWords(r.headerText).trim(), by: '', t: msg.t } : null;
  }
  // YouTube's note in the chat of a moderator's step (someone hidden or put in timeout, …): a line in its words, bold
  // where it's bold
  if (type === 'liveChatModerationMessageRenderer'){
    const summary = (r.message && Array.isArray(r.message.runs) ? r.message.runs : []).filter(x => x && x.text).map(x => (x.bold ? { strong: x.text } : { text: x.text }));
    if (!summary.length) return null;
    return { site: 'youtube', kind: 'event', event: 'modnote', id: r.id, t: Math.round(+r.timestampUsec / 1000) || Date.now(), sender: '', login: '', color: '', userId: '', badges: [], pics: [], parts: [],
      summary, text: summary.map(x => x.text || x.strong).join('') };
  }
  // memberships gifted to the chat: the gifter in its header, how many in its words ("Sent 5 … gift memberships"). Each one
  // given (…GiftRedemptionAnnouncementRenderer, "received a gift membership by …") is left out: part of this one
  if (type === 'liveChatSponsorshipsGiftPurchaseAnnouncementRenderer'){
    const h = (r.header && r.header.liveChatSponsorshipsHeaderRenderer) || {}, who = ytWords(h.authorName).trim() || 'Someone';
    const said = ytWords(h.primaryText).replace(/\s+/g, ' ').trim(), n = Math.max(1, +((/\d[\d,.]*/.exec(said) || [''])[0].replace(/[,.]/g, '')) || 1);
    const what = `${n.toLocaleString('en-US')} ${n === 1 ? 'membership' : 'memberships'}`;
    return { site: 'youtube', kind: 'event', event: 'giftmemberships', id: r.id, t: Math.round(+r.timestampUsec / 1000) || Date.now(), sender: who, login: who.replace(/^@/, '').toLowerCase(), color: '',
      userId: r.authorExternalChannelId || '', badges: ytBadges(h.authorBadges), pics: ytPics(h.authorBadges), text: `${who} gifted ${what}`, summary: [{ strong: who }, { text: ' gifted ' }, { strong: what }], parts: [],
      support: { kind: 'gifts', unit: 'memberships', who, n } };
  }
  const base = { site: 'youtube', id: r.id, t: Math.round(+r.timestampUsec / 1000) || Date.now(), sender: (r.authorName && r.authorName.simpleText) || '',
    login: ((r.authorName && r.authorName.simpleText) || '').replace(/^@/, '').toLowerCase(), color: '', userId: r.authorExternalChannelId || '', badges: ytBadges(r.authorBadges), pics: ytPics(r.authorBadges) };
  if (type === 'liveChatTextMessageRenderer') return { ...base, kind: 'message', parts: ytParts(r.message && r.message.runs) };
  if (type === 'liveChatPaidMessageRenderer' || type === 'liveChatPaidStickerRenderer'){
    const amount = (r.purchaseAmountText && r.purchaseAmountText.simpleText) || '';
    const what = type === 'liveChatPaidMessageRenderer' ? 'Chat' : 'Sticker';
    // (support: the amount as a number to set the smallest by, its text with its currency for the alert, as its chat's screen gave)
    return { ...base, kind: 'event', event: type === 'liveChatPaidMessageRenderer' ? 'superchat' : 'supersticker', amount, text: `${base.sender} sent a Super ${what}${amount ? ' · ' + amount : ''}`,
      summary: [{ strong: base.sender }, { text: ` Super ${what}` }, ...(amount ? [{ text: ' ' }, { strong: amount }] : [])], parts: ytParts(r.message && r.message.runs),
      support: { kind: 'superchat', who: base.sender || 'Someone', n: moneyOf(amount) || 1, ...(amount && /\D/.test(amount) ? { amt: amount } : {}) } };
  }
  if (type === 'liveChatMembershipItemRenderer'){
    const text = ytText((r.headerSubtext || {}).runs) || (r.headerSubtext && r.headerSubtext.simpleText) || `${base.sender} became a member`;
    // (a member for a while now, its headerPrimaryText "Member for 6 months": not someone becoming one, so not support)
    const milestone = !!ytWords(r.headerPrimaryText).trim();
    return { ...base, kind: 'event', event: 'membership', text, summary: [{ strong: base.sender }, { text: ' ' + (/^welcome/i.test(text) ? 'became a member' : text.replace(base.sender, '').trim() || 'became a member') }], parts: ytParts(r.message && r.message.runs),
      ...(milestone ? {} : { support: { kind: 'member', who: base.sender || 'Someone', n: 1 } }) };
  }
  return null;
}


// A YouTube action's kind, as its tap counts it (its in-site/feed.js's ytKind)
const ytKind = a => { const k = Object.keys(a || {}).find(x => x !== 'clickTrackingParams') || ''; const v = a && a[k] || {}, it = v.item || v.replacementItem || v.bannerRenderer;
  return k + (it ? ':' + (Object.keys(it)[0] || '') : ''); };
// What chat/feed-parse.js asks a site's reader (sites/twitch/feed.js says what each is). Its tap passes on every action,
// the ones ALL ignores too (kindOf: what kind each is, so ALL can leave those out on purpose)
const youtubeFeed = {
  parse: parseYouTube,
  known: { 'addChatItemAction:liveChatTextMessageRenderer': 'a message', 'addChatItemAction:liveChatPaidMessageRenderer': 'a Super Chat',
    'addChatItemAction:liveChatPaidStickerRenderer': 'a Super Sticker', 'addChatItemAction:liveChatMembershipItemRenderer': 'a membership',
    'addChatItemAction:giftMessageViewModel': 'a gift', 'addChatItemAction:liveChatSponsorshipsGiftPurchaseAnnouncementRenderer': 'memberships gifted to the chat', 'replaceChatItemAction:liveChatTextMessageRenderer': 'a held message let through', 'addChatItemAction:liveChatAutoModMessageRenderer': 'a message held for review, to moderators (its card: Allow, Deny)',
    removeChatItemAction: 'a message deleted', markChatItemAsDeletedAction: 'a message deleted (marked)', markChatItemsByAuthorAsDeletedAction: 'a ban or timeout',
    removeChatItemByAuthorAction: 'all of someone’s messages taken away (as a ban)', 'addChatItemAction:liveChatModerationMessageRenderer': 'YouTube’s note of a moderator’s step (its own words)', 'showLiveChatActionPanelAction': 'a poll opened (its card over ALL)', updateLiveChatPollAction: 'a poll’s votes (its card)',
    closeLiveChatActionPanelAction: 'a poll closed (its card goes)',
    'addBannerToLiveChatCommand:liveChatBannerRenderer': 'a pin', removeBannerForLiveChatCommand: 'a pin taken down' },
  ignored: { 'addChatItemAction:liveChatPlaceholderItemRenderer': 'an empty stand-in for a message YouTube holds back (for review; let through, replaceChatItemAction brings it)',
    'addChatItemAction:liveChatViewerEngagementMessageRenderer': 'YouTube’s own notice (welcome, guard your privacy)',
    'addChatItemAction:liveChatSponsorshipsGiftRedemptionAnnouncementRenderer': 'one of the memberships gifted to the chat, given (the gift is its own line)',
    liveChatReportPresenceCommand: 'YouTube’s own (that you’re in the chat)', liveChatReportModerationStateCommand: 'YouTube’s own (moderation state)', elementsCommand: 'YouTube’s own (parts of its page)',
    addInteractivityWidgetAction: 'YouTube’s floating note of who sent a gift (the gift is its own line)', updateOrAddInteractivityWidgetAction: 'YouTube’s floating note of who sent a gift (the gift is its own line)',
    'replaceChatItemAction:liveChatPlaceholderItemRenderer': 'a stand-in for a held message, replaced by another (the message, let through, comes on its own)' },
  ignoredMore: kind => /^addLiveChatTickerItemAction:/.test(kind) ? 'the ticker at the top (its Super Chat or membership is its own line)' : '',
  kindOf: ytKind,
  ytParts, ytPics
};

export { youtubeFeed };
