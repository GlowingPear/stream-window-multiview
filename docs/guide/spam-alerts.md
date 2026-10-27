---
title: Spam alerts
group: alerts
icon: mod
lede: Spots promo-bot messages in chats you moderate, tags them and lights up the window. It never hides, deletes or reports anything.
settings: spam
words: [spam, bot, promo, scam, mod, moderator, flag, abusive]
related: [mentions, bell]
order: 21
---

- Settings > Spam alerts. Off until you turn it on.
- It only checks Kick and Twitch chats where you're a moderator (the ones with the mod view button). When it spots a promo-bot message, it tags it "LIKELY SPAM" in the chat and lights up that chat window, so you can deal with it. It never hides, deletes or reports anything.
- A message is only flagged when several signs add up, so normal links and clip links aren't flagged. The signs: a link written so the chat doesn't make it a link (`site com`, `site[.]com`, `site dot com`), promo words like "upgrades" or "zero cost", emotes breaking up the words, the same message in another open chat, and someone who just started chatting. Hover the tag to see which signs it found.
- Lists: sites that never count (Kick, Twitch, YouTube, Discord and so on) and the promo words. Add your own or reset them.
- Sensitivity: Strict flags more, Relaxed fewer.
- Try it: paste a message to see whether it would be flagged, and why.
- History: the flagged messages (the same as the bell's Spam tab), with their score and the signs found. Click one to show that chat.
- The alert options are the same as for mentions, with their own colour and sound.

> **Tip:** Not flagging something it should? With [Developer tools](developer-tools.md) on, right-click the message and choose **Why didn't this alert?** to see its score.
