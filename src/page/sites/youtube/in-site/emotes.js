// YouTube's emoji for the emote card (in-site/emote-preview.js), plugged into site.js as its inSite.emote.find. Runs
// inside its chat page, as text: self-contained.

// A picture in its chat that's one of its emoji (img; u: its address, name: what the card calls it) -> { big, text },
// else null. text: what to type (or paste) in its chat to get it: a standard emoji itself, or a YouTube or channel
// emoji's shortcode (":_name:").
function youtubeEmote(img, u, name){
  if (!(/(^|\.)ggpht\.com$|^www\.gstatic\.com$/.test(u.hostname) && img.closest('yt-live-chat-text-message-renderer, #message'))) return null;
  const alt = String(img.alt || '').trim(), tip = String(img.getAttribute('shared-tooltip-text') || '').trim();
  const text = alt && /\p{Extended_Pictographic}/u.test(alt) && !/[A-Za-z]/.test(alt) ? alt
    : /^:[^\s:]+:$/.test(tip) ? tip
    : /^:[^\s:]+:$/.test(alt) ? alt
    : ':' + name + ':';
  return { big: u.href.replace(/=w\d+-h\d+/, '=w128-h128'), text };
}

export { youtubeEmote };
