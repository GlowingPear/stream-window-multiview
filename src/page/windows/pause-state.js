// Why a stream is paused, and what each thing that pauses or plays it does to that.
// A stream can be paused for three separate reasons at once: you paused it, "Pause all except focus", or
// auto-pause while it's hidden. Each option only ever undoes its own pause. When you play a stream yourself
// (its play button, or its own player), every reason goes, and the two options leave it playing until focus
// moves onto it (focus) or it's shown again (auto).
// A state is { you, focus, auto, focusExempt, autoExempt }; each event gives the next state, and windows/pause.js
// sends the result to the player. Nothing here touches the page: the unit tests drive it on its own.
const PLAYING = Object.freeze({ you: false, focus: false, auto: false, focusExempt: false, autoExempt: false });

const pauseEvents = {
  // You paused it (its play / pause button), or its own player paused.
  youPause: s => ({ ...s, you: true }),
  // You played it, or its own player did: every reason goes, and the options leave it alone for now.
  youPlay: s => ({ ...s, you: false, focus: false, auto: false, focusExempt: true, autoExempt: true }),
  // "Pause all except focus" decided whether it should be paused (should: on, not the big stream, not exempt).
  focusPause: (s, should) => s.focus === should ? s : { ...s, focus: should },
  // It became the big stream, or "Pause all except focus" was switched: the option applies to it again.
  focusReset: s => s.focusExempt ? { ...s, focusExempt: false } : s,
  // Shown again (or auto-pause doesn't apply to it any more).
  shown: s => s.auto || s.autoExempt ? { ...s, auto: false, autoExempt: false } : s,
  // Hidden long enough for auto-pause.
  hiddenLong: s => s.auto || s.autoExempt ? s : { ...s, auto: true }
};

const isPausedBy = s => s.you || s.focus || s.auto;
// mini previews keep playing while only their stream is hidden
const miniPausedBy = s => s.you || s.focus;
// the first reason, as the switch control shows it
const pauseWhy = s => s.you ? 'you' : s.focus ? 'focus' : s.auto ? 'auto' : '';

export { isPausedBy, miniPausedBy, pauseEvents, pauseWhy, PLAYING };
