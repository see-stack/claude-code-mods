import { describe, expect, test } from 'claude-code/testing'

import { controlsWidth, fill, flowing, joinRun, lastReply, listsVoice, looksNorwegian, parseProgress, readOptions, sentenceStart, speakable, step, widestFit } from '../hooks/register'

const row = (role: 'user' | 'assistant', text: string) => ({ role, text, toolUses: [] }) as any
/** A transport control, as the row measures and draws it. */
const c = (key: string, label: string, hotkey?: string) => ({ key, label, hotkey, onPress: () => {} })
/** A speech state at `at` of `items` replies, playing or not. */
const state = (isSpeaking: boolean, items: string[] = [], at = 0) =>
  ({ isSpeaking, isPaused: false, startedAt: 0, run: { items, at } }) as any

const run = (at: number, ...items: string[]) => ({ items, at })

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100 } }
const mountBand = ($: any) => $.ui.mount({ plugin: 'read-aloud', surface: 'terminal', ...BAND })


describe('read-aloud', () => {
  test('speakable strips what reads badly out loud', () => {
    const text = speakable(
      [
        '# Heading',
        '',
        'A **bold** word and a [link](https://example.com/x) and `code`.',
        '',
        '```js',
        'const x = 1',
        '```',
        '',
        '| name | tokens |',
        '| --- | --- |',
        '| context | 204k |',
        '',
        '> a quote',
        '',
        '- a bullet',
        '',
        '---',
      ].join('\n'),
      6000,
    )
    expect(text).toContain('Heading')
    expect(text).not.toContain('#')
    expect(text).not.toContain('**')
    expect(text).not.toContain('`')
    expect(text).not.toContain('const x = 1') // a fenced block is never read out
    expect(text).toContain('A bold word and a link and code.')
    expect(text).toContain('name, tokens') // the header row, and the rule row dropped
    expect(text).toContain('context, 204k')
    expect(text).not.toContain('---')
    expect(text).toContain('a quote')
    expect(text).toContain('a bullet')
    expect(text).not.toMatch(/\n{2,}/)
  })

  test('speakable caps the length at a word', () => {
    const text = speakable('word '.repeat(2000), 100)
    expect(text.length).toBeLessThan(130)
    expect(text.endsWith('. Output truncated.')).toBe(true)
    expect(text).not.toContain('  ')
  })

  test('lastReply reads the last turn, not the command that asked for it', () => {
    // The command's own record lands as a user row after the reply.
    const messages = [row('user', 'what changed?'), row('assistant', 'The hook moved.'), row('user', '/read-aloud')]
    expect(lastReply(messages)).toBe('The hook moved.')
  })

  test('lastReply joins a turn and stops at the prompt before it', () => {
    const messages = [
      row('user', 'first question'),
      row('assistant', 'An older answer.'),
      row('user', 'second question'),
      row('assistant', 'Part one.'),
      row('assistant', ''), // a tool-only or thinking-only step joins nothing
      row('assistant', 'Part two.'),
    ]
    expect(lastReply(messages)).toBe('Part one.\nPart two.')
  })

  test('lastReply reads past a turn full of tool calls', () => {
    // The shape that broke it: a turn that only called tools, then the command's
    // own record. The reply to read is the one before all of it.
    const messages = [
      row('user', 'what changed?'),
      row('assistant', 'The hook moved.'),
      row('user', 'do it'),
      row('assistant', ''), // a step that only called tools
      row('user', ''), // its tool result
      row('assistant', ''), // and another
      row('user', ''),
      row('user', '/read-aloud'),
    ]
    expect(lastReply(messages)).toBe('The hook moved.')
  })

  test('lastReply has nothing to read before the first answer', () => {
    expect(lastReply([])).toBe('')
    expect(lastReply([row('user', 'hello')])).toBe('')
    expect(lastReply([row('user', 'hello'), row('assistant', ''), row('user', '')])).toBe('')
  })

  test('looksNorwegian votes, and English wins near-ties', () => {
    expect(looksNorwegian('Dette er en fil som ikke virker')).toBe(true)
    expect(looksNorwegian('Filen ble endret, men jeg finner ikke feilen')).toBe(true)
    expect(looksNorwegian('The file is not there, and I did not find it')).toBe(false)
    expect(looksNorwegian('er og')).toBe(false) // too short to vote on
  })

  test('sentenceStart steps to the sentence either side of the offset', () => {
    const text = 'One. Two! Three?\nFour.' // sentence starts: 0, 5, 10, 17
    expect(sentenceStart(text, 0, 1)).toBe(5)
    expect(sentenceStart(text, 6, 1)).toBe(10)
    expect(sentenceStart(text, 12, 1)).toBe(17)
    expect(sentenceStart(text, 15, -1)).toBe(10) // inside a sentence: its own start
    expect(sentenceStart(text, 10, -1)).toBe(5) // already on a start: the one before
    expect(sentenceStart(text, 17, -1)).toBe(10) // a line break ends a sentence too
    expect(sentenceStart(text, 99, 1)).toBe(text.length) // nothing after the last one
  })

  test('readOptions takes what is set and falls back on what makes no sense', () => {
    const plain = readOptions({})
    expect(plain.voice).toBe('Ember')
    expect(plain.norwegianVoice).toBe('Nora')
    expect(plain.rates).toEqual([1, 1.25, 1.5, 2, 0.75])
    expect(plain.maxChars).toBe(6000)
    expect(plain.speaker).toContain('EmberSpeak')

    expect(readOptions({ voice: '  Tom (Enhanced) ', norwegianVoice: 'Henrik (Enhanced)' })).toMatchObject({
      voice: 'Tom (Enhanced)',
      norwegianVoice: 'Henrik (Enhanced)',
    })
    expect(readOptions({ rates: '1, 1.5 ,2' }).rates).toEqual([1, 1.5, 2])
    expect(readOptions({ rates: 'fast, faster' }).rates).toEqual([1]) // an unusable list costs the rate button, not the mod
    expect(readOptions({ rates: '' }).rates).toEqual([1, 1.25, 1.5, 2, 0.75]) // blank counts as unset, not as no rates
    expect(readOptions({ voice: '   ' }).voice).toBe('Ember')
    expect(readOptions({ maxChars: 'lots' }).maxChars).toBe(6000)
    expect(readOptions({ maxChars: 999_999 }).maxChars).toBe(20_000) // clamped, not refused
    expect(readOptions({ maxChars: 5 }).maxChars).toBe(200)
  })

  test('fill turns a share of the reply into cells of the bar', () => {
    expect(fill(0, 12)).toBe(0)
    expect(fill(50, 12)).toBe(6)
    expect(fill(100, 12)).toBe(12)
    expect(fill(2, 12)).toBe(0) // barely started still reads as a bar, not as a stub
    expect(fill(104, 12)).toBe(12) // the app can report an offset at the end of the text
    expect(fill(-1, 12)).toBe(0)
  })

  test('controlsWidth counts what the engine draws, hotkey and all', () => {
    const pause = c('pause', 'pause', 'p')
    expect(controlsWidth([pause])).toBe(8) // "p: pause", not the five of its label
    expect(controlsWidth([c('prev', 'prev')])).toBe(4) // no hotkey: the label alone
    expect(controlsWidth([pause, c('prev', 'prev')])).toBe(8 + 1 + 4) // and one space between
  })

  test('controlsWidth counts a glyph at the cells it may draw in', () => {
    const play = { key: 'pause', label: '⏸', cells: 2, onPress: () => {} }
    expect(controlsWidth([play])).toBe(2) // one code point, two cells, measured as two
    expect(controlsWidth([play, play, play])).toBe(2 + 1 + 2 + 1 + 2)
  })

  test('widestFit takes the widest set that fits, and nothing when none does', () => {
    const full = [c('pause', 'pause', 'p'), c('prev', 'prev'), c('stop', 'stop', 's')] // 8+1+4+1+7
    const floor = [c('pause', 'pause', 'p'), c('stop', 'stop', 's')] // 8+1+7
    const sets = [full, floor]
    expect(widestFit(sets, 21).map(x => x.key)).toEqual(['pause', 'prev', 'stop'])
    expect(widestFit(sets, 20).map(x => x.key)).toEqual(['pause', 'stop'])
    expect(widestFit(sets, 15)).toEqual([]) // too narrow for even the floor
  })

  test('joinRun adds the reply at the end and moves the cursor back with the cap', () => {
    expect(joinRun(run(0, 'a'), 'b')).toEqual({ items: ['a', 'b'], at: 0 })
    expect(joinRun(run(4, 'a', 'b', 'c', 'd', 'e'), 'f')).toEqual({ items: ['a', 'b', 'c', 'd', 'e', 'f'], at: 4 })
    // Six is the cap, so the seventh is what pushes the oldest off - and the cursor
    // comes back with it rather than pointing one reply past where it was reading.
    const six = run(4, 'a', 'b', 'c', 'd', 'e', 'f')
    expect(joinRun(six, 'g')).toEqual({ items: ['b', 'c', 'd', 'e', 'f', 'g'], at: 3 })
    expect(joinRun(run(0, 'a', 'b', 'c', 'd', 'e', 'f'), 'g')).toEqual({ items: ['b', 'c', 'd', 'e', 'f', 'g'], at: 0 })
  })

  test('step walks the reading and stops at either end', () => {
    const three = run(0, 'a', 'b', 'c')
    expect(step(three, 1)).toBe(1)
    expect(step(run(2, 'a', 'b', 'c'), 1)).toBeNull() // the last reply: nothing after it
    expect(step(run(0, 'a', 'b', 'c'), -1)).toBeNull() // the first: nothing before it
    expect(step(run(1, 'a', 'b', 'c'), -1)).toBe(0)
  })

  test('a reading flows while it plays or has a reply left to read', () => {
    expect(flowing(null)).toBe(false) // nothing asked for yet
    expect(flowing(state(false))).toBe(false) // an offer waiting to be asked for is not a reading
    expect(flowing(state(true))).toBe(true)
    expect(flowing(state(true, ['a', 'b'], 0))).toBe(true)
    expect(flowing(state(false, ['a', 'b'], 0))).toBe(true) // between two replies of a reading
    // The last reply read, and the list kept behind it for `prev`: not flowing, so
    // the next reply that arrives goes back to being an offer rather than joining.
    expect(flowing(state(false, ['a', 'b'], 1))).toBe(false)
  })

  test('parseProgress reads the app position file, and refuses anything else', () => {
    expect(parseProgress('1234 speaking\n')).toEqual({ offset: 1234, state: 'speaking' })
    expect(parseProgress('0 paused')).toEqual({ offset: 0, state: 'paused' })
    expect(parseProgress('164 done\n')).toEqual({ offset: 164, state: 'done' })
    expect(parseProgress('')).toBeNull() // not launched with -p yet
    expect(parseProgress('speaking')).toBeNull()
    expect(parseProgress('12 humming')).toBeNull()
  })

  test('the band offers to read once a turn has answered, and draws nothing before', async ($: any, on: any) => {
    // The bottom a band needs: what the engine draws where no mod draws. It answers
    // both events the plugin asks beneath it.
    on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: 'band below' }))
    on('turn.complete', () => ({ text: '' }))

    const nothing = await mountBand($)
    expect(await nothing.find({ key: 'read' })).toBeUndefined() // nothing answered: no row
    await nothing.unmount()

    await $.turn.complete({ answer: 'Everything checks out.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    const band = await mountBand($)
    expect(await band.find({ key: 'read' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /ready/ })).toBeDefined()
    await band.unmount()
  })

  test('listsVoice reads a say -v ? listing by name', () => {
    const listing = ['Nora                nb_NO    # Hei! Jeg heter Nora.', 'Ember               en_US    # This is Ember.'].join('\n')
    expect(listsVoice(listing, 'Nora')).toBe(true)
    expect(listsVoice(listing, 'norA')).toBe(true)
    expect(listsVoice(listing, 'Henrik (Enhanced)')).toBe(false)
    expect(listsVoice(listing, '')).toBe(false)
  })
})
