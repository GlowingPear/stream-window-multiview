// The page's code: the main window, and the streams window (index.html?role=streams).
// It's split by part of the app into the modules in this folder. Loading them only defines things; what each
// part does as the page starts is in its init(), and they run here in a fixed order: the order the code had
// when it was one script, so each part can rely on what the parts before it set up.
import { init as core } from './core.js';
import { init as sharedIcons } from './shared/icons.js';
import { init as inSiteMentions } from './in-site/mentions.js';
import { init as inSiteEmotePreview } from './in-site/emote-preview.js';
import { init as inSiteNewEmotes } from './in-site/new-emotes.js';
import { init as inSiteTranslate } from './in-site/translate.js';
import { init as inSiteChatMessage } from './in-site/chat-message.js';
import { init as inSiteKickCommands } from './in-site/kick-commands.js';
import { init as chatKickClip } from './chat/kick-clip.js';
import { init as chatKickPoll } from './chat/kick-poll.js';
import { init as chatKickPrediction } from './chat/kick-prediction.js';
import { init as inSiteVolume } from './in-site/volume.js';
import { init as platformsPlatforms } from './platforms/platforms.js';
import { init as platformsPearDrops } from './platforms/pear-drops.js';
import { init as layoutGeometry } from './layout/geometry.js';
import { init as windowsWindowBar } from './windows/window-bar.js';
import { init as windowsWindows } from './windows/windows.js';
import { init as windowsViews } from './windows/views.js';
import { init as chatTranslate } from './chat/translate.js';
import { init as chatViewMenu } from './chat/view-menu.js';
import { init as windowsRaids } from './windows/raids.js';
import { init as windowsStuck } from './windows/stuck.js';
import { init as layoutLock } from './layout/lock.js';
import { init as panelsChannelsChannels } from './panels/channels/channels.js';
import { init as panelsChannelsOpenBox } from './panels/channels/open-box.js';
import { init as panelsBellBell } from './panels/bell/bell.js';
import { init as panelsBellAllNotifications } from './panels/bell/all-notifications.js';
import { init as alertsAlerts } from './alerts/alerts.js';
import { init as alertsSpamAlerts } from './alerts/spam-alerts.js';
import { init as sharedFlash } from './shared/flash.js';
import { init as panelsSettingsNotifications } from './panels/settings/notifications.js';
import { init as layoutLayouts } from './layout/layouts.js';
import { init as layoutSidewaysScroll } from './layout/sideways-scroll.js';
import { init as windowsChannelPicker } from './windows/channel-picker.js';
import { init as layoutColumns } from './layout/columns.js';
import { init as layoutSwitcher } from './layout/switcher.js';
import { init as layoutSwitchControl } from './layout/switch-control.js';
import { init as windowsPause } from './windows/pause.js';
import { init as platformsYoutubeOptions } from './platforms/youtube-options.js';
import { init as layoutFocusOnly } from './layout/focus-only.js';
import { init as layoutColumnDrag } from './layout/column-drag.js';
import { init as layoutSavedLayouts } from './layout/saved-layouts.js';
import { init as layoutChatFocus } from './layout/chat-focus.js';
import { init as chatNewMessages } from './chat/new-messages.js';
import { init as layoutChatStage } from './layout/chat-stage.js';
import { init as layoutChatRail } from './layout/chat-rail.js';
import { init as windowsPopout } from './windows/popout.js';
import { init as chatChatZoom } from './chat/chat-zoom.js';
import { init as chatBlowUp } from './chat/blow-up.js';
import { init as chatChatName } from './chat/chat-name.js';
import { init as chatChatOverlay } from './chat/chat-overlay.js';
import { init as chatStickBottom } from './chat/stick-bottom.js';
import { init as alertsSupportBanner } from './alerts/support-banner.js';
import { init as panelsEmptyStageEmptyStage } from './panels/empty-stage/empty-stage.js';
import { init as toolbarHeader } from './toolbar/header.js';
import { init as toolbarToolbar } from './toolbar/toolbar.js';
import { init as toolbarLayoutMenu } from './toolbar/layout-menu.js';
import { init as toolbarAccountsMenu } from './toolbar/accounts-menu.js';
import { init as toolbarFarming } from './toolbar/farming.js';
import { init as toolbarDailyReward } from './toolbar/daily-reward.js';
import { init as layoutUndo } from './layout/undo.js';
import { init as windowsCapture } from './windows/capture.js';
import { init as panelsHelpHelp } from './panels/help/help.js';
import { init as panelsHelpGuide } from './panels/help/guide.js';
import { init as panelsUpdatesUpdates } from './panels/updates/updates.js';
import { init as shortcuts } from './shortcuts.js';
import { init as layoutGameFocus } from './layout/game-focus.js';
import { init as panelsSettingsThemes } from './panels/settings/themes.js';
import { init as panelsSettingsSettings } from './panels/settings/settings.js';
import { init as panelsSettingsGeneral } from './panels/settings/general.js';
import { init as panelsSettingsAlerts } from './panels/settings/alerts.js';
import { init as panelsSettingsConnected } from './panels/settings/connected.js';
import { init as panelsSettingsActivity } from './panels/settings/activity.js';
import { init as panelsDeveloperDeveloper } from './panels/developer/developer.js';
import { init as chatWhyAlert } from './chat/why-alert.js';
import { init as start } from './start.js';
import { init as layoutMonitors } from './layout/monitors.js';
import { init as panelsSettingsMonitors } from './panels/settings/monitors.js';
import { init as panelsProfilesProfiles } from './panels/profiles/profiles.js';
import { init as toolbarToolbarFit } from './toolbar/toolbar-fit.js';
import { init as panelsExtensionsExtensions } from './panels/extensions/extensions.js';
import { init as sharedAsk } from './shared/ask.js';
import { init as sharedTooltips } from './shared/tooltips.js';
import { init as windowsWindowCommands } from './windows/window-commands.js';
import { init as panelsChannelsChannelCommands } from './panels/channels/channel-commands.js';
import { init as panelsSettingsSettingsCommands } from './panels/settings/settings-commands.js';
import { init as palettePalette } from './palette/palette.js';

[
  core,
  sharedIcons,
  inSiteMentions,
  inSiteEmotePreview,
  inSiteNewEmotes,
  inSiteTranslate,
  inSiteChatMessage,
  inSiteKickCommands,
  chatKickPoll,
  chatKickPrediction,
  chatKickClip,
  inSiteVolume,
  platformsPlatforms,
  platformsPearDrops,
  layoutGeometry,
  windowsWindowBar,
  windowsWindows,
  windowsViews,
  chatTranslate,
  chatViewMenu,
  windowsRaids,
  windowsStuck,
  layoutLock,
  panelsChannelsChannels,
  panelsChannelsOpenBox,
  panelsBellBell,
  panelsBellAllNotifications,
  alertsAlerts,
  alertsSpamAlerts,
  sharedFlash,
  panelsSettingsNotifications,
  layoutLayouts,
  layoutSidewaysScroll,
  windowsChannelPicker,
  layoutColumns,
  layoutSwitcher,
  layoutSwitchControl,
  windowsPause,
  platformsYoutubeOptions,
  layoutFocusOnly,
  layoutColumnDrag,
  layoutSavedLayouts,
  layoutChatFocus,
  chatNewMessages,
  layoutChatStage,
  layoutChatRail,
  windowsPopout,
  chatChatZoom,
  chatBlowUp,
  chatChatName,
  chatChatOverlay,
  chatStickBottom,
  alertsSupportBanner,
  panelsEmptyStageEmptyStage,
  toolbarHeader,
  toolbarToolbar,
  toolbarLayoutMenu,
  toolbarAccountsMenu,
  toolbarFarming,
  toolbarDailyReward,
  layoutUndo,
  windowsCapture,
  panelsHelpHelp,
  panelsUpdatesUpdates,
  shortcuts,
  layoutGameFocus,
  panelsSettingsThemes,
  panelsSettingsSettings,
  panelsHelpGuide,
  panelsSettingsGeneral,
  panelsSettingsAlerts,
  panelsSettingsConnected,
  panelsSettingsActivity,
  panelsDeveloperDeveloper,
  chatWhyAlert,
  start,
  layoutMonitors,
  panelsSettingsMonitors,
  panelsProfilesProfiles,
  toolbarToolbarFit,
  panelsExtensionsExtensions,
  sharedAsk,
  sharedTooltips,
  windowsWindowCommands,
  panelsChannelsChannelCommands,
  panelsSettingsSettingsCommands,
  palettePalette
].forEach(init => init());
