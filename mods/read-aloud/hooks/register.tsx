// Read Aloud: speaks the reply on screen when asked, in the voice the Stop hook
// already reads in, with transport.
//
// The hook this follows (claude-config/hooks/speak-output) finds the last turn by
// tailing the transcript after every reply. This one is handed the reply instead:
// `turn.complete` carries the turn's final visible text, so there is no transcript
// to tail, no flush to wait out, and nothing to walk back through when the band
// wants to know whether there is anything waiting to be read.
//
// Speech goes through EmberSpeak.app rather than $.audio.speak, because Ember is a
// Personal Voice: macOS offers those to AVSpeechSynthesizer alone, under an
// application identity, which is the whole reason that bundle exists. The built-in
// $.audio.speak (the platform's own `say`) is the fallback for when the bundle is
// gone - it cannot speak Ember, so it is handed Nora for a Norwegian reply and no
// voice at all otherwise, and it has no transport at all.
//
// Transport lives in two halves, because a running process can be told nothing but
// signals. Pause and resume are signals, and stop kills the process; speed and
// position are settled at launch, so the app is relaunched from the offset its
// progress file reports. That file is the only channel back from the app: one
// line, "<offset> <state>", in UTF-16 units of the whole text - which is what the
// mod seeks by, and what the app's own range callbacks count in too.
//
// A reading begins only when it is asked for, and flows as long as it has
// anything left to read: a reply that arrives while it is talking takes a place
// at the end of it rather than cutting in, and the reading stops flowing when the
// last reply has been read. Nothing here reaches for a turn's reply on its own -
// the Stop hook in settings.json is muted (CLAUDE_SPEAK_OFF) so that this mod is
// the only voice, which is what makes a list of replies possible in the first
// place.
//
// /read-aloud          speak the last reply, or add it to the reading
// /read-aloud stop     silence it: what was after this reply is dropped
// /read-aloud prev     the reply before this one (the `prev` button)
// /read-aloud forward  the reply after it - `skip`, from before the button
// /read-aloud clear    drop what is after this reply, leave this one talking
// /read-aloud back|next      a sentence back or on, inside this reply
// /read-aloud pause|resume|faster|slower
//
// The band above the prompt draws one row: the transport while something is
// playing, an offer to read while a reply is waiting, and nothing at all when
// there is neither. The transport names the voice, then draws one run of glyphs
// with the progress bar in the middle of them: the reply before this one, stop, a
// sentence back, the bar - filled and empty in the same two glyphs the context
// band above it draws with, and measuring the reply being read - a sentence on,
// play or pause, the rate, the reply after it, and how far into the reading it is.
// It measures what it is about to draw rather than trusting a threshold - the
// engine writes a plain Button's hotkey itself, and a glyph may draw two cells -
// and what does not fit beside the heading takes a second row, which is what a
// 54-column terminal needs. A reading that has ended leaves its list and the reply before
// the last one on the ready row, since that is when going back is wanted.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register, SessionMessage } from 'claude-code'

import type { Mine, Run, Speech } from '../types'

type Config = {
  voice: string
  norwegianVoice: string
  /** The multipliers the rate button walks, in order. */
  rates: number[]
  maxChars: number
  speaker: string
}

/** The manifest's options as the engine hands them over: whatever is set over the
 *  defaults, with anything that makes no sense falling back rather than refusing
 *  to load - a bad rate list should cost the rate button, not the whole mod. */
export function readOptions(options: PluginOptions): Config {
  const text = (value: unknown, fallback: string) =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
  const rates = String(text(options.rates, DEFAULTS.rates))
    .split(',')
    .map(part => Number(part.trim()))
    .filter(rate => Number.isFinite(rate) && rate > 0)
  const asked = Number(options.maxChars)
  return {
    voice: text(options.voice, DEFAULTS.voice),
    norwegianVoice: text(options.norwegianVoice, DEFAULTS.norwegianVoice),
    rates: rates.length > 0 ? rates : [1],
    maxChars: Number.isFinite(asked) ? Math.min(20000, Math.max(200, Math.round(asked))) : DEFAULTS.maxChars,
    speaker: text(options.speaker, DEFAULTS.speaker),
  }
}

// What the manifest's userConfig offers, with the value used when nothing is set.
// Every one of these can be changed in /config, which stores what is chosen in
// settings.json under pluginConfigs.
const DEFAULTS = {
  voice: 'Ember',
  norwegianVoice: 'Nora',
  rates: '1,1.25,1.5,2,0.75',
  maxChars: 6000,
  speaker: '~/Control-Panel/tools/ember-speak/EmberSpeak.app/Contents/MacOS/EmberSpeak',
}
// Both under the home directory read at session.start: a hooks module has no
// environment of its own, and this keeps its runtime files where the hook keeps
// its own (~/Control-Panel/local-config).
const SCRATCH = '/Control-Panel/local-config/hooks/read-aloud/speak.txt' // the text being read
const PROGRESS = '/Control-Panel/local-config/hooks/read-aloud/speak.state' // where the app is
// $.audio.speak speaks the first 4096 characters and says so; cut it here instead,
// so the truncation is ours and lands at a word.
const MAX_CHARS_FALLBACK = 4096
const POLL_MS = 1000
const IDLE_EVERY = 5 // idle, look every fifth tick rather than every tick
const GRACE_MS = 3000 // a launch is not up this soon: never read that as "done"
const KILL_SETTLE_MS = 150 // a killed speaker needs a moment to let go of the audio
const GAP = 2 // cells between the bar and the first control on its row
// The transport as glyphs rather than words: at 54 columns the words for seven
// controls do not fit on one row, and a plain Button whose label is one glyph
// draws as that glyph and nothing else. Bare, so the engine prints no hotkey in
// front of them - the words are still there as /read-aloud arguments.
const GLYPH = { play: '▶', pause: '⏸', stop: '⏹', prev: '⏮', forward: '⏭', back: '‹', next: '›' } as const
// What the media glyphs are counted at, and what they may draw in: counting one
// cell for a glyph a font gives two would overflow the row it was chosen to fit.
const GLYPH_CELLS = 2
const RUN_MAX = 6 // replies a reading holds; past this the oldest falls off the front
const BAR = 12 // cells in the progress bar
// The context band's own two: the accent it marks this conversation with, and the
// grey it leaves empty room in. Filled and empty cells are its glyphs too.
const ACCENT = '#d97757'
const FREE = '#808080'

// What the person has set, read again whenever the module loads.
let config = readOptions({})

// Held by the host, so the band survives a hot reload of this file.
const speech = atom({ plugin: 'read-aloud', key: 'speech' } as const, null as Speech | null)

let home = ''
let ticks = 0

export const register: Register = (on, options) => {
  config = readOptions(options)
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // A name Claude Code already has is refused: start anyway.
    await $.command
      .register({ name: 'read-aloud', description: 'Speak the last reply aloud', argumentHint: '[stop|prev|forward|back|next|clear|pause|resume|faster|slower]' })
      .catch(() => {})
    home = await homeDir($)
    $.clock.every(POLL_MS, () => void poll($))
    return r
  })

  // The reply, kept for the band to offer and for the command to read out. A
  // subagent's turn is not this conversation's, and a turn that answered nothing
  // leaves whatever was waiting before it still waiting.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    const answer = e.reason === 'answer' ? speakable(e.answer, config.maxChars) : ''
    if (answer === '') return r
    const s = await read($, speech)
    const run = s?.run
    // Inside a reading the reply takes a place at its end, and stops being what
    // the band offers: it is not waiting to be asked for any more, it is going to
    // be read. Speech with no list behind it - the fallback voice - leaves it on
    // offer instead, since there is no reading for it to join.
    if (run && flowing(s)) {
      await merge($, { run: joinRun(run, answer), answer: undefined })
      return r
    }
    // A reply arriving after a reading has ended ends that reading: the band is
    // back to offering one reply, and `prev` no longer walks through the old one.
    await merge($, { answer, run: undefined })
    return r
  })

  on('command.run', { command: 'read-aloud' }, async ($, e) => {
    switch (e.args.trim().toLowerCase()) {
      case 'stop':
        await stop($)
        return { text: 'Speech stopped.' }
      case 'pause':
        return { text: (await setPaused($, true)) ? 'Paused.' : 'Nothing is playing.' }
      case 'resume':
        return { text: (await setPaused($, false)) ? 'Resumed.' : 'Nothing is paused.' }
      // Replies: prev and forward walk the reading, as the buttons of those names
      // do. skip is forward's other name, from before there was a button.
      case 'prev':
        return { text: await prevReply($) }
      case 'forward':
      case 'skip':
        return { text: await forwardReply($) }
      case 'clear':
        return { text: await clearAhead($) }
      // Sentences, inside whichever reply is playing.
      case 'back':
        return { text: await seek($, -1) }
      case 'next':
        return { text: await seek($, 1) }
      case 'faster':
        return { text: await cycleRate($, 1) }
      case 'slower':
        return { text: await cycleRate($, -1) }
    }
    return { text: await readLast($) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e) // what other mods and Claude Code draw here stays
    const s = await read($, speech)
    const playing = s?.isSpeaking === true
    const waiting = s?.answer ?? ''
    if (e.props.hasSurvey || (!playing && waiting === '')) return rest
    const { Box, Text, Button } = $.ui.resolve(e)

    if (!playing) {
      // A reading that has ended leaves its list behind, so the reply before the
      // one on offer is still one press away rather than gone.
      const behind = (s?.run?.at ?? 0) > 0
      return (
        <Box flexDirection="column">
          {rest}
          <Box flexDirection="row" paddingX={1}>
            <Text color={ACCENT}>{'♪ '}</Text>
            <Text dimColor>{`${looksNorwegian(waiting) ? config.norwegianVoice : config.voice} · ready`}</Text>
            <Text>{'  '}</Text>
            {/* The same two glyphs the transport uses, for the same two things:
                play this reply, or go back to the one before it. */}
            <Button key="read" plain label={GLYPH.play} onPress={() => readLast($)} />
            {behind && <Text>{' '}</Text>}
            {behind && <Button key="prev" plain label={GLYPH.prev} onPress={() => prevReply($)} />}
          </Box>
        </Box>
      )
    }

    const mine = s.mine
    const run = s.run
    const filled = mine ? fill(share(mine), BAR) : 0
    // What the head says, and how wide it is. Speech with no text behind it - the
    // fallback voice - has no bar and no count, which is why this is a number and
    // not a constant.
    const voice = mine ? mine.voice : s.isPaused ? 'speaking · paused' : 'speaking'
    const count = run && run.items.length > 1 ? `· ${run.at + 1} of ${run.items.length}` : ''
    const head = 2 + voice.length

    // The controls, and the sets of them to try in turn: the sentences inside one
    // reply go before the rate, and both before the reply pair the row is for.
    // Pause and stop are the floor - pause is the only control that reaches speech
    // with no text behind it, and stop is the only way out.
    //
    // The bar is one of the row's items rather than something the head draws, so
    // that it sits in the middle of the glyphs - between the sentence steps it is
    // measuring the distance within - and so that the row is measured with it.
    // Its onPress is never called: no Button is made of it, it draws two Texts.
    const bar: Control = { key: 'bar', label: '', cells: BAR, onPress: () => {} }
    // How far into the reading it is, as the row's last item rather than something
    // the heading carries: it belongs with the transport it counts.
    const counter: Control = { key: 'count', label: count, cells: count.length, onPress: () => {} }
    const pause: Control = {
      key: 'pause',
      label: s.isPaused ? GLYPH.play : GLYPH.pause,
      cells: GLYPH_CELLS,
      onPress: () => setPaused($, !s.isPaused),
    }
    const prev: Control = { key: 'prev', label: GLYPH.prev, cells: GLYPH_CELLS, onPress: () => prevReply($) }
    const stopIt: Control = { key: 'stop', label: GLYPH.stop, cells: GLYPH_CELLS, onPress: () => stop($) }
    // Not `next`: that is the hook's own third argument.
    const stepBack: Control = { key: 'back', label: GLYPH.back, onPress: () => seek($, -1) }
    const stepOn: Control = { key: 'next', label: GLYPH.next, onPress: () => seek($, 1) }
    // The rate keeps its number: a glyph for it would say nothing about which rate,
    // and the number is what the button is for.
    const rate: Control = { key: 'rate', label: `${mine?.rate ?? 1}×`, onPress: () => cycleRate($, 1) }
    const forward: Control = { key: 'forward', label: GLYPH.forward, cells: GLYPH_CELLS, onPress: () => forwardReply($) }

    // Left to right, the order the row draws: back a reply and stop it, the two
    // sentence steps with the bar between them, then the toggle, the rate, and on
    // to the next reply.
    const controls: Control[] = [
      ...(run ? [prev] : []),
      stopIt,
      ...(mine ? [stepBack, bar, stepOn] : []),
      pause,
      ...(mine ? [rate] : []),
      ...(run ? [forward] : []),
      ...(count === '' ? [] : [counter]),
    ]
    const withoutSteps = controls.filter(c => c.key !== 'back' && c.key !== 'next')
    const withoutRate = withoutSteps.filter(c => c.key !== 'rate')
    const floor = controls.filter(c => c.key === 'pause' || c.key === 'stop' || c.key === 'bar')
    const sets = [controls, withoutSteps, withoutRate, floor]
    // Measured, never guessed: a plain Button is drawn by the engine as "p: pause",
    // so a row of five is about ten cells wider than its labels look. Beside the bar
    // if that fits what the row is for, and otherwise the bar keeps its own row and
    // the controls take the next one - but only when that buys more of them, since a
    // narrow terminal pays for the second row in prompt space.
    const room = (e.props.bodyColumns ?? 0) - 2 // the row's own padding, one cell either side
    const beside = widestFit(sets, room - head - GAP)
    const below = widestFit(sets, room)
    const split = below.length > beside.length
    const chosen = split ? below : beside
    const buttons = chosen.flatMap((c, i) => {
      const gap = i === 0 ? [] : [<Text key={`gap-${c.key}`}>{' '}</Text>]
      // The bar is the one item that is drawn rather than pressed: where the app
      // says it is, in the accent, and the room left in the grey.
      if (c.key === 'bar') {
        return [
          ...gap,
          <Text key="bar-played" color={ACCENT}>{'█'.repeat(filled)}</Text>,
          <Text key="bar-left" color={FREE}>{'─'.repeat(BAR - filled)}</Text>,
        ]
      }
      if (c.key === 'count') return [...gap, <Text key="count" dimColor>{count}</Text>]
      return [...gap, <Button key={c.key} plain hotkey={c.hotkey} label={c.label} onPress={c.onPress} />]
    })

    // Drawn after `rest` rather than before it, so this row is the band's last
    // one whichever way the engine nests the two: outermost, it follows what the
    // other mods drew; innermost, this whole box is already placed beneath them.
    return (
      <Box flexDirection="column">
        {rest}
        <Box flexDirection="row" paddingX={1}>
          <Text color={ACCENT}>{'♪ '}</Text>
          {/* Which voice, and how far into the reading: the bar itself is in the
              middle of the glyphs, so the row repeats no percentage. */}
          <Text dimColor>{voice}</Text>
          {count !== '' && <Text dimColor>{count}</Text>}
          {!split && chosen.length > 0 && <Text>{'  '}</Text>}
          {!split && buttons}
        </Box>
        {split && <Box flexDirection="row" paddingX={1}>{buttons}</Box>}
      </Box>
    )
  })
}

/** How far into the text the app says it is, as a percentage. */
function share(mine: Mine) {
  return mine.chars > 0 ? (mine.offset / mine.chars) * 100 : 0
}

/** How many cells of a `width`-wide bar a percentage fills, clamped: the app can
 *  report an offset at or past the end of the text it was handed. */
export function fill(percent: number, width: number) {
  return Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)
}

/** One control of the transport, as the row draws it. */
export type Control = {
  key: string
  label: string
  /** The cells the label draws in, where that is not its length: a glyph may draw
   *  two, and a row measured by `length` would then be one that overflows. */
  cells?: number
  hotkey?: string
  onPress: () => void | Promise<unknown>
}

/** How wide a row of controls draws. A plain Button carrying a hotkey is written
 *  by the engine itself, as "p: pause" - the hotkey, a colon, the label - so the
 *  widths are not the labels' own, and a row that looks as if it fits may not. */
export function controlsWidth(controls: readonly Control[]) {
  const labels = controls.reduce((n, c) => n + (c.hotkey ? c.hotkey.length + 2 : 0) + (c.cells ?? c.label.length), 0)
  return labels + Math.max(0, controls.length - 1) // the single space between two of them
}

/** The first of `sets` that fits in `columns` - widest first - or nothing when
 *  none of them does, which is a row too narrow for any control at all. */
export function widestFit(sets: readonly (readonly Control[])[], columns: number) {
  return sets.find(set => controlsWidth(set) <= columns) ?? []
}

// One place the state changes, so the band is asked to draw again from one place.
async function merge($: EngineInterface, patch: Partial<Speech>) {
  await update($, speech, prev => ({
    isSpeaking: false,
    isPaused: false,
    startedAt: 0,
    ...prev,
    ...patch,
  })).catch(() => {})
  $.ui.invalidate('ui.render')
}

// ---- the reading -----------------------------------------------------------
//
// A reading is a list of replies and a cursor into it, not a queue: `prev` needs
// somewhere to go back to, and the reply it goes back to has to still be there.
// Whatever is after the cursor is still to be read, in order; whatever is before
// it has been read and can be read again.

/** Whether a reading is going on by itself: something is playing, or a reply is
 *  still to be read after the one at the cursor. Inside one a new reply joins the
 *  list; outside one nothing is read until it is asked for, which is what keeps
 *  this mod from speaking over a session the person is reading themselves. */
export function flowing(s: Speech | null) {
  const run = s?.run
  if (s?.isSpeaking === true) return true
  return run ? run.at + 1 < run.items.length : false
}

/** Where a step lands in a reading, or null at either end of it. */
export function step(run: Run, direction: 1 | -1) {
  const at = run.at + direction
  return at >= 0 && at < run.items.length ? at : null
}

/** A reading with one more reply at its end, and the cursor moved back by however
 *  many fell off the front to keep the list at `max`. */
export function joinRun(run: Run, text: string, max = RUN_MAX): Run {
  const items = [...run.items, text].slice(-max)
  return { items, at: Math.max(0, run.at - (run.items.length + 1 - items.length)) }
}

/** Moves the cursor back one reply and reads it. The reply it is leaving stays in
 *  the list, so `forward` walks straight back to it. */
async function prevReply($: EngineInterface) {
  const s = await read($, speech)
  const run = s?.run
  const at = run ? step(run, -1) : null
  if (!run || at === null) return 'This is the first reply of the reading.'
  return (await playAt($, s, run, at)) ? 'Reading the reply before this one.' : 'Could not reach EmberSpeak.'
}

/** The other way: on to the reply after this one, whether it is waiting mid-reading
 *  or reached from the row that a finished reading leaves behind. */
async function forwardReply($: EngineInterface) {
  const s = await read($, speech)
  const run = s?.run
  const at = run ? step(run, 1) : null
  if (!run || at === null) return 'This is the last reply of the reading.'
  return (await playAt($, s, run, at)) ? 'Reading the next reply.' : 'Could not reach EmberSpeak.'
}

/** Drops everything after the cursor and leaves what is playing alone: the reading
 *  then ends with the reply that is talking instead of going on to the rest. */
async function clearAhead($: EngineInterface) {
  const run = (await read($, speech))?.run
  const n = run ? run.items.length - run.at - 1 : 0
  if (!run || n === 0) return 'Nothing is waiting to be read.'
  await merge($, { run: { items: run.items.slice(0, run.at + 1), at: run.at } })
  return `Cleared ${n} ${n === 1 ? 'reply' : 'replies'} from the reading.`
}

// Puts the cursor on `at` and starts reading that reply, at the rate the reading
// is already at - a rate chosen mid-reply is a choice about the reading, not about
// that one reply.
//
// The handoff is stamped as a launch: between here and the app being up, the poll
// has to read the state as "starting", not as "finished, go on to the next one".
//
// When the app cannot be reached the reading is dropped rather than left standing:
// a list nothing is playing is a reading that never ends, and every reply after it
// would be filed behind a voice that is not coming.
async function playAt($: EngineInterface, s: Speech | null, run: Run, at: number) {
  const text = run.items[at]
  if (text === undefined) return false
  await merge($, { run: { items: run.items, at }, isSpeaking: false, isPaused: false, startedAt: Date.now(), mine: undefined })
  const voice = await voiceFor($, text)
  if (await start($, text, voice, s?.mine?.rate ?? 1, 0)) return true
  await merge($, { run: undefined, isSpeaking: false, isPaused: false, startedAt: 0, mine: undefined })
  $.ui.log('read-aloud: could not start the next reply')
  return false
}

// The end of a reading's last reply: the list stays and the cursor stays on it, so
// `prev` still walks back through it, and the reply just read goes back to being
// what the band offers. Nothing after the cursor means nothing starts on its own.
async function drained($: EngineInterface, run: Run) {
  await merge($, {
    isSpeaking: false,
    isPaused: false,
    startedAt: 0,
    mine: undefined,
    run,
    answer: run.items[run.at],
  })
}

async function homeDir($: EngineInterface) {
  try {
    const { exitCode, stdout } = await $.process.run(['/usr/bin/printenv', 'HOME'], { timeoutMs: 5000 })
    return exitCode === 0 ? stdout.trim() : ''
  } catch {
    return ''
  }
}

function path(under: string) {
  return home + under
}

// A configured path, with ~ standing for the home read at session.start.
function expand(configured: string) {
  return configured.startsWith('~/') ? home + configured.slice(1) : configured
}

// ---- reading it ------------------------------------------------------------

// The reply waiting to be read: what the last turn answered, or - when the session
// was resumed or this mod reloaded and holds none - the last reply in the
// conversation, which is what it would have been.
async function waiting($: EngineInterface) {
  const s = await read($, speech)
  if (s?.answer) return s.answer
  return speakable(lastReply(await $.session.messages().catch(() => [])), config.maxChars)
}

async function readLast($: EngineInterface) {
  const text = await waiting($)
  if (text === '') return 'Nothing to read: nothing has been answered in this conversation yet.'
  const s = await read($, speech)
  // Asked for inside a reading, the reply takes a place at its end rather than
  // cutting in. The reply already talking - or already in the list - is not added
  // a second time.
  const run = s?.run
  if (run && flowing(s)) {
    if (text === (await speakingText($)) || run.items.includes(text)) return 'Already reading that one.'
    const joined = joinRun(run, text)
    await merge($, { run: joined, answer: undefined })
    const waiting = joined.items.length - joined.at - 1
    return `Queued. ${waiting} ${waiting === 1 ? 'reply' : 'replies'} to come.`
  }
  // Nothing is playing, so this is a reading of one reply, from the start. The
  // cursor is the list's one entry; an answer already on offer stops being one.
  const voice = await voiceFor($, text)
  if (await start($, text, voice, 1, 0)) {
    await merge($, { run: { items: [text], at: 0 }, answer: undefined })
    return `Speaking ${text.length} characters with ${voice}.`
  }
  return await fallback($, text, voice)
}

// ---- transport ------------------------------------------------------------

// Pause and resume of the app's own voice, which keeps the synthesizer's place:
// the process is not frozen, so it stops at a word and picks up from there. It
// reaches whatever EmberSpeak is speaking, the hook's replies included - usefully
// so, since the hook reads every turn and this is the only way to stop it talking.
async function setPaused($: EngineInterface, paused: boolean) {
  const s = await read($, speech)
  if (!s?.isSpeaking) return false
  const signal = paused ? '-USR1' : '-USR2'
  try {
    await $.process.run(['/usr/bin/pkill', signal, '-x', 'EmberSpeak'], { timeoutMs: 5000 })
  } catch {
    return false
  }
  await merge($, { isPaused: paused })
  return true
}

// Speed and position cannot be changed in a running app, so the reply is read
// again from where it had got to, at the new rate. The progress file is what
// makes that exact: the app reports the offset every word.
async function cycleRate($: EngineInterface, direction: 1 | -1) {
  const s = await read($, speech)
  const mine = s?.mine
  if (!mine) return 'Nothing is playing.'
  const at = config.rates.indexOf(mine.rate)
  const next = config.rates[(at + direction + config.rates.length) % config.rates.length]!
  const text = await speakingText($)
  if (!(await start($, text, mine.voice, next, mine.offset))) return 'Could not reach EmberSpeak.'
  return `Reading again at ${next}×.`
}

async function seek($: EngineInterface, direction: 1 | -1) {
  const s = await read($, speech)
  const mine = s?.mine
  if (!mine) return 'Nothing is playing.'
  const text = await speakingText($)
  const offset = sentenceStart(text, mine.offset, direction)
  if (offset >= text.length) {
    // Past the end of this reply there is no sentence left to step to: it is over,
    // and the reply after it either starts now or the reading ends here.
    const run = s?.run
    const next = run ? step(run, 1) : null
    if (run && next !== null && (await playAt($, s, run, next))) return 'Reading the next reply.'
    await stop($)
    return 'End of the reply.'
  }
  await start($, text, mine.voice, mine.rate, offset)
  return direction === 1 ? 'Skipped a sentence forward.' : 'Skipped a sentence back.'
}

// The text being read, from the file the app is reading it out of - so a seek or
// a rate change hands back exactly what is playing, not a fresh reading of the
// conversation.
async function speakingText($: EngineInterface) {
  if (!home) return ''
  return await $.fs.read(path(SCRATCH)).catch(() => '')
}

// Stopping ends the reading, not the list. What was after the cursor is dropped,
// so nothing starts up again on its own; the reply it stopped on goes back to
// being what the band offers, and `prev` still has somewhere to walk back to.
async function stop($: EngineInterface) {
  const run = (await read($, speech))?.run
  await kill($)
  const patch: Partial<Speech> = { isSpeaking: false, isPaused: false, startedAt: 0, mine: undefined }
  if (run) {
    patch.run = { items: run.items.slice(0, run.at + 1), at: run.at }
    patch.answer = run.items[run.at]
  } else {
    patch.run = undefined
  }
  await merge($, patch)
}

// Kills by name, which is the only handle there is: neither $.process.run nor
// $.process.spawn reports a pid. It stops the hook's speech too, on purpose - the
// two of them reading at once is the thing to avoid.
async function kill($: EngineInterface) {
  try {
    await $.process.run(['/usr/bin/pkill', '-x', 'EmberSpeak'], { timeoutMs: 5000 })
  } catch {
    // Nothing to kill, or no pkill: whatever follows still runs.
  }
}

// ---- the app ---------------------------------------------------------------

// Writes `text` and reads it from the start, replacing anything already playing.
async function start($: EngineInterface, text: string, voice: string, rate: number, offset: number) {
  if (!home || text === '') return false
  await kill($)
  try {
    await $.fs.write(path(SCRATCH), text)
  } catch {
    return false
  }
  // A killed speaker takes a moment to let go of the audio device, and the one
  // launched into that moment is the one that comes out silent.
  await $.clock.sleep(KILL_SETTLE_MS).catch(() => {})
  return await launch($, voice, rate, offset, text.length)
}

// Launches the app detached, and returns as soon as it is away.
//
// $.process.run waits for its child, and EmberSpeak holds itself open for as long
// as the speech lasts - six minutes for a long reply - so the launch has to go
// through a shell that backgrounds it. Both streams and the child's stdin are
// redirected inside that command: run() reads the pipes until they close, and a
// grandchild still holding them would keep it waiting exactly as an awaited child
// does. The `-x` guard is what reports the bundle missing, which is the one case
// the built-in voice is used instead.
async function launch($: EngineInterface, voice: string, rate: number, offset: number, chars: number) {
  const speaker = expand(config.speaker)
  const scratch = path(SCRATCH)
  const progress = path(PROGRESS)
  const cmd = [
    `if [ -x ${q(speaker)} ]; then`,
    `nohup ${q(speaker)} -v ${q(voice)} -r ${rate} -s ${offset} -p ${q(progress)} -f ${q(scratch)}`,
    `</dev/null >/dev/null 2>&1 & else exit 3; fi`,
  ].join(' ')
  try {
    const { exitCode } = await $.process.run(['/bin/sh', '-c', cmd], { timeoutMs: 10_000 })
    if (exitCode !== 0) return false
  } catch {
    return false
  }
  await merge($, {
    isSpeaking: true,
    isPaused: false,
    startedAt: Date.now(),
    mine: { voice, chars, rate, offset },
  })
  return true
}

// The platform's own synthesizer, for when EmberSpeak is not there. Not awaited: it
// resolves when the utterance ends, which can be minutes, and nothing here waits on
// that. Ember is a Personal Voice that `say` cannot speak, so an English reply is
// left to the system default voice rather than naming one macOS would substitute.
// It has no transport, so it is not marked as this mod's own.
async function fallback($: EngineInterface, text: string, voice: string) {
  const spoken = speakable(text, MAX_CHARS_FALLBACK)
  void $.audio
    .speak(spoken, voice === config.voice ? {} : { voice })
    .catch((err: unknown) => $.ui.log(`read-aloud: could not speak: ${String(err)}`))
  await merge($, { isSpeaking: true, isPaused: false, startedAt: Date.now(), mine: undefined })
  const spokenWith = voice === config.voice ? 'the system voice' : voice
  return `EmberSpeak is not installed: spoke ${spoken.length} characters with ${spokenWith} instead.`
}

async function voiceFor($: EngineInterface, text: string) {
  if (!looksNorwegian(text)) return config.voice
  return (await listsVoiceNow($, config.norwegianVoice)) ? config.norwegianVoice : config.voice
}

// Asks `say` what it has, the way the hook does: EmberSpeak resolves a name it
// cannot find to the system default rather than failing, which would read Norwegian
// in an English voice. Only ever asked about a Norwegian reply.
async function listsVoiceNow($: EngineInterface, name: string) {
  try {
    const { stdout } = await $.process.run(['/usr/bin/say', '-v', '?'], { timeoutMs: 5000 })
    return listsVoice(stdout, name)
  } catch {
    return false
  }
}

// ---- watching it -----------------------------------------------------------

async function poll($: EngineInterface) {
  const s = await read($, speech)
  const was = s?.isSpeaking === true
  // While something is playing, look every tick, so the position keeps up and the
  // band leaves as soon as the voice does; idle, every fifth, so a quiet session is
  // not spawning a process a second to learn nothing.
  if (ticks++ % (was ? 1 : IDLE_EVERY) !== 0) return
  const playing = await isPlaying($)
  // The progress file belongs to this mod's own launches. Speech the hook started
  // has none, and what is left in the file from the last reading is not about it:
  // read then, a stale "done" would take the band down while a voice is talking.
  const progress = playing && s?.mine ? await readProgress($) : null
  // A speaker that has said everything is finished, whether or not its process has
  // gone yet.
  const live = playing && progress?.state !== 'done'
  const moved = progress !== null && progress.offset !== s?.mine?.offset
  // With no progress file there is nothing to say what the voice is doing, so the
  // pause this mod was asked for stands until this mod is asked to lift it.
  const paused = progress ? progress.state === 'paused' : s?.isPaused === true
  // A reply still to be read keeps the poll interested even with nothing playing:
  // that is the handoff between two of them, and the case where the speaker never
  // came up at all.
  const run = s?.run
  const next = run ? step(run, 1) : null
  if (live === was && !moved && paused === (s?.isPaused === true) && next === null) return
  // Right after a launch EmberSpeak is not up yet - and the handoff to the next
  // reply is a launch too - so a reading taken in that window would take the band
  // down and start the reply after the one being started.
  if (!live && Date.now() - (s?.startedAt ?? 0) < GRACE_MS) return
  if (!live) {
    // The end of a reply is where the next one begins: the app has stopped and a
    // reply is still to be read, so the reading goes on without being asked for it
    // again. This is also how a list whose speaker never came up is read or
    // dropped, rather than left to hold every reply after it.
    if (run && next !== null) {
      await playAt($, s, run, next)
      return
    }
    // Nothing after the cursor is the last reply read: the list stays for `prev`,
    // and the reply just read goes back to being what the band offers.
    if (run && run.items.length > 0) {
      await drained($, run)
      return
    }
    await merge($, { isSpeaking: false, isPaused: false, startedAt: 0, mine: undefined, run: undefined })
    return
  }
  await merge($, {
    isSpeaking: true,
    isPaused: paused,
    startedAt: s?.mine ? (s.startedAt ?? Date.now()) : Date.now(),
    mine: s?.mine ? { ...s.mine, offset: progress?.offset ?? s.mine.offset } : undefined,
  })
}

/** The app's progress file: where it is, and whether it is speaking. */
export function parseProgress(raw: string) {
  const [offset, state] = raw.trim().split(/\s+/)
  const at = Number(offset)
  if (!Number.isFinite(at)) return null
  if (state !== 'speaking' && state !== 'paused' && state !== 'done') return null
  return { offset: at, state }
}

async function readProgress($: EngineInterface) {
  if (!home) return null
  const raw = await $.fs.read(path(PROGRESS)).catch(() => '')
  return parseProgress(raw)
}

async function isPlaying($: EngineInterface) {
  try {
    const { exitCode } = await $.process.run(['/usr/bin/pgrep', '-x', 'EmberSpeak'], { timeoutMs: 5000 })
    return exitCode === 0
  } catch {
    return false
  }
}

// ---- text ------------------------------------------------------------------

/** True when a `say -v '?'` listing carries a voice by that name. */
export function listsVoice(listing: string, name: string) {
  const wanted = name.trim().toLowerCase()
  if (wanted === '') return false
  return listing
    .split('\n')
    .some(line => (line.trim().split(/\s{2,}/)[0] ?? '').trim().toLowerCase() === wanted)
}

/** The assistant text of the last turn: what is on screen as the last reply. */
export function lastReply(messages: readonly SessionMessage[]) {
  const turn: string[] = []
  let started = false
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    // A user row is the command's own record, a notice, or a tool result: the turn
    // has not begun until some assistant text has been read, and a row before that
    // is walked past rather than stopped at.
    if (m.role === 'user') {
      if (started) break
      continue
    }
    // An assistant row with no text is a step that only called tools. It joins
    // nothing and marks nothing: taken as the turn's start, it would make the walk
    // stop at the next tool result and read out an empty reply.
    const text = m.text.trim()
    if (text === '') continue
    turn.unshift(text)
    started = true
  }
  return turn.join('\n').trim()
}

/** Where the sentence one step away from `offset` begins, in UTF-16 units. */
export function sentenceStart(text: string, offset: number, direction: 1 | -1) {
  const starts = [0]
  const ends = /[.!?\n]+[ \t]*/g
  let m: RegExpExecArray | null
  while ((m = ends.exec(text)) !== null) starts.push(m.index + m[0].length)
  let i = 0
  while (i + 1 < starts.length && starts[i + 1]! <= offset) i++
  if (direction === 1) return i + 1 < starts.length ? starts[i + 1]! : text.length
  // Back: the start of the sentence being read, and the one before it when the
  // offset is already sitting on that start.
  return offset > starts[i]! ? starts[i]! : starts[i - 1] ?? 0
}

/** Norwegian rather than English, by word vote; English wins ties and near-ties. */
export function looksNorwegian(text: string) {
  const lowered = text.toLowerCase()
  const words = lowered.match(/[a-zæøå]+/g) ?? []
  if (words.length < 3) return false
  let nb = 0
  let en = 0
  for (const w of words) {
    if (NORWEGIAN_WORDS.has(w)) nb++
    else if (ENGLISH_WORDS.has(w)) en++
  }
  // æ and ø are Norwegian/Danish only, so they count for more than the words.
  // å is shared with Swedish and Danish, so on its own it proves nothing.
  const marks = (lowered.match(/[æø]/g) ?? []).length
  return 2 * nb + 3 * marks > 2 * en && nb + marks >= 2
}

/** Strips the markdown that reads badly out loud, and caps the length. */
export function speakable(text: string, max: number) {
  return truncate(
    text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/~~~[\s\S]*?~~~/g, ' ')
      .replace(/^[ \t]*\|.*\|[ \t]*$/gm, tableRow)
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^ {0,3}#{1,6}[ \t]*/gm, '')
      .replace(/^ {0,3}>[ \t]?/gm, '')
      .replace(/^ {0,3}[-*+][ \t]+/gm, '')
      .replace(/^[ \t]*([-*_])\1{2,}[ \t]*$/gm, '')
      .replace(/\*\*|__|`|~~/g, '')
      .replace(/(?<!\w)[*_](\S[^*_]*?)[*_](?!\w)/g, '$1')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim(),
    max,
  )
}

// A table row as it is read out: its cells, and nothing at all for a rule.
function tableRow(row: string) {
  const cells = row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => c.trim())
  if (cells.every(c => /^[-: ]*$/.test(c))) return ''
  return cells.filter(c => c !== '').join(', ')
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return `${at > 0 ? cut.slice(0, at) : cut}. Output truncated.`
}

// One argument, quoted for the shell this app is launched through. Only ever our
// own paths, voice names and numbers: the reply text travels through the scratch
// file, so nothing a reply contains can reach a command line.
function q(argument: string | number) {
  return `'${String(argument).replace(/'/g, `'\\''`)}'`
}

// Function words that are Norwegian and not English. Every entry has to be a word
// English does not also use, because a false positive here means an English reply
// read out in Norwegian, which is worse than the reverse.
const NORWEGIAN_WORDS = new Set(
  `er og å et en så ikke jeg det som til på med av den han hun fra om når hva
    hvordan hvorfor også skal kan har hadde blir ble vært gjør gjorde ser får
    fikk kommer kom tok gir ga sier sa vet tror tenker trenger bruker brukte
    lager lagde finner fant sjekker kjører virker fungerer feil ting dag tid sted
    fil filen filer kode jobb måte litt mer mest alle noen ingen ingenting
    der nå da jo nok kanskje selv sammen tilbake igjen fortsatt allerede
    snart nesten godt dårlig stor liten ny gammel første siste neste samme annen
    hver hvilken hvem hvor denne dette disse vil må være oss dere dem seg
    sitt våre kun helt veldig mye
    endret endrer endre endring stemme språk norsk norske prøv prøve prøver
    tekst teksten linje linjen svar svare svarte ord ordet navn navnet verdi
    verdien lese leser skrive skriver skrevet bruk bruke brukt lage laget
    kjør kjøre kjørt bygge bygget feilen eksempel eksempler mål målet hjelp
    hjelpe hjelper sjekk sjekke vise viser viste gå går gikk finne
    fordi derfor hvis etter før mens ganske rundt gjennom mellom opp videre
    egen eget egne hele halv ganger tusen hundre klokka klokken uke uken
    måned år`.split(/\s+/),
)

const ENGLISH_WORDS = new Set(
  `the is are was were and of to in that it you we they this with for on have
    has had be been not but from at as by or so if then than there their them
    what when where which who how why all any some more most very just only also
    into out up down over under`.split(/\s+/),
)
