/* ---- Runs inside YouTube's chat page (turned into text: see src/page/README.md) ----
   signedOut's part (toolbar/login-lost.js): whether its chat shows you signed out. Its chat box: signed in (false).
   Its "Sign in to chat" where the box would be (a link to Google's sign-in), or its page saying nobody's signed in
   (ytcfg's LOGGED_IN): signed out (true). Neither yet (still loading, or a chat with no box for you, like members
   only): null. */
const youtubeSignedOut = () => {
  if (document.querySelector('yt-live-chat-text-input-field-renderer #input')) return false;
  if (document.querySelector('yt-live-chat-message-renderer a[href*="ServiceLogin"], yt-live-chat-restricted-participation-renderer a[href*="ServiceLogin"], #input-panel a[href*="accounts.google."]')) return true;
  return window.ytcfg && window.ytcfg.get && window.ytcfg.get('LOGGED_IN') === false ? true : null;
};

export { youtubeSignedOut };
