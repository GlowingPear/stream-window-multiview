---
title: YouTube
group: sites
icon: ytPlay
lede: Skipping ads, YouTube's cookie question, liking streams and the optional API key.
settings: youtube
words: [youtube, ads, skip, cookie, consent, like, api key, quota, google]
related: [logging-in]
order: 25
---

## YouTube ads and the cookie question (Settings > YouTube)
- **Skip ads** (on to start with): when an ad shows its Skip button, the app presses it for you. Ads without a Skip button still play.
- **Answer the cookie question** (on to start with, "Reject all"): in some countries YouTube asks about cookies before a stream plays, and keeps it paused until you answer. The app answers for you with the choice you pick. Each stream remembers the answer, so it's asked once per channel. Turn it off to answer it yourself in the player.
- If YouTube changes the question so the app can't find the button, the app answers "Reject all" by itself and starts the stream again.

## Liking YouTube streams
- YouTube streams have a 👍 button in their title bar: click it to like the stream with your YouTube login, and again to remove the like. It's filled in when you already like it, also when you liked it on youtube.com.
- It needs "Watch signed in" for YouTube (Settings > Accounts) and a YouTube login. Until then it's greyed out, and clicking it says what to do.
- **Like streams automatically** (Settings > YouTube, off to start with): each YouTube stream you open is liked once it's playing, after the cookie question and any ads. Each video is liked once: remove a like and it isn't liked again.

## YouTube API key (optional)
Live alerts check your saved channels while the app is running. Kick (when you're logged in) and Twitch answer for many channels at once, so they're checked every 30 seconds. YouTube is checked one channel at a time by reading its page, which is slower and can break when YouTube changes its pages. A free YouTube API key from Google makes YouTube's checks faster and more reliable. You don't need one: without it, everything still works.
- Getting one (about 5 minutes, needs a Google account):
  - Go to console.cloud.google.com and create a project (any name, e.g. "Stream Multiview").
  - In "APIs & Services" > "Library", find **YouTube Data API v3** and click **Enable**.
  - In "APIs & Services" > "Credentials", click **Create credentials** > **API key** and copy it.
  - Recommended: click the key, and under "API restrictions" choose **Restrict key** and tick only YouTube Data API v3, so the key can't be used for anything else.
- Google's own guide, with pictures: developers.google.com/youtube/v3/getting-started
- Add it in Settings > YouTube, under YouTube API key: paste the key and click **Add**. The app tests it once with Google.
- It's free: Google gives each key 10,000 "units" a day. With the key, YouTube is checked every 30 seconds too, using 1 unit per 50 videos it asks about (about 3,000 a day for 30 channels), plus 1 the first time for each @handle channel.
- The key is stored encrypted on this computer (like your logins) and only used to ask YouTube which videos are live. Remove it from the same place.
- If the key runs out of today's units, Google is busy, or the key stops working, the app goes back to reading pages by itself and Settings says why. Out of units: it tries the key again when Google resets them (midnight Pacific time). Too many requests: after 15 minutes, then longer.
