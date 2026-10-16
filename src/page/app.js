// The page's code: the main window, and the streams window (index.html?role=streams).
// It's split by feature into the files in this folder, which run in the order listed below, the order the code
// had when it was one script: each file first imports the one before it, so importing the last one loads them
// all, first to last. So code that runs as a file loads can use what the files before it set up. Files also
// import what they need from later files: their functions can be called at any time, but their other values
// are only ready once that file has run (as before, when they were further down the one script).
//    1. core.js
//    2. shared/icons.js
//    3. shared/env.js
//    4. in-site/mentions.js
//    5. in-site/emote-preview.js
//    6. in-site/new-emotes.js
//    7. in-site/translate.js
//    8. in-site/kick-commands.js
//    9. in-site/volume.js
//   10. platforms/platforms.js
//   11. layout/geometry.js
//   12. windows/window-bar.js
//   13. windows/windows.js
//   14. windows/views.js
//   15. chat/translate.js
//   16. chat/view-menu.js
//   17. windows/raids.js
//   18. layout/lock.js
//   19. panels/channels/channels.js
//   20. panels/channels/follow-suggestions.js
//   21. panels/channels/open-box.js
//   22. panels/bell/bell.js
//   23. panels/bell/all-notifications.js
//   24. alerts/alerts.js
//   25. alerts/spam-alerts.js
//   26. layout/placement.js
//   27. shared/flash.js
//   28. panels/settings/notifications.js
//   29. layout/layouts.js
//   30. layout/sideways-scroll.js
//   31. windows/channel-picker.js
//   32. layout/columns.js
//   33. layout/switcher.js
//   34. layout/switch-control.js
//   35. windows/pause.js
//   36. platforms/youtube-options.js
//   37. layout/focus-only.js
//   38. layout/column-drag.js
//   39. layout/saved-layouts.js
//   40. layout/chat-focus.js
//   41. layout/spotlight.js
//   42. windows/popout.js
//   43. chat/chat-zoom.js
//   44. persistence.js
//   45. panels/empty-stage/empty-stage.js
//   46. toolbar/header.js
//   47. toolbar/toolbar.js
//   48. toolbar/layout-menu.js
//   49. toolbar/accounts-menu.js
//   50. layout/undo.js
//   51. windows/capture.js
//   52. panels/help/help.js
//   53. panels/updates/updates.js
//   54. shortcuts.js
//   55. layout/game-focus.js
//   56. panels/settings/themes.js
//   57. panels/settings/settings.js
//   58. panels/settings/general.js
//   59. panels/settings/alerts.js
//   60. start.js
//   61. panels/profiles/profiles.js
//   62. toolbar/toolbar-fit.js
//   63. panels/extensions/extensions.js
//   64. shared/ask.js
//   65. shared/tooltips.js
import './shared/tooltips.js';
