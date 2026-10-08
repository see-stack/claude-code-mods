import { describe, expect, test } from 'claude-code/testing'

import {
  barFill,
  blocks,
  cells,
  figures,
  frameWidth,
  legend,
  lists,
  messageItems,
  metrics,
  promptItems,
  share,
  toReading,
  tokens,
  toolItems,
} from '../hooks/register'

const BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 84 } }

// /context's breakdown as the engine hands it over, for a 1M window.
const BREAKDOWN = {
  categories: [
    { name: 'System prompt', tokens: 3_400, color: 'promptBorder', kind: 'used', isDeferred: false },
    { name: 'System tools', tokens: 12_000, color: 'inactive', kind: 'used', isDeferred: false },
    { name: 'MCP tools', tokens: 2_600, color: 'cyan_FOR_SUBAGENTS_ONLY', kind: 'used', isDeferred: false },
    { name: 'MCP tools (deferred)', tokens: 40_000, color: 'inactive', kind: 'deferred', isDeferred: true },
    { name: 'Memory files', tokens: 4_000, color: 'warning', kind: 'used', isDeferred: false },
    { name: 'Custom agents', tokens: 960, color: 'permission', kind: 'used', isDeferred: false },
    { name: 'Skills', tokens: 2_000, color: 'warning', kind: 'used', isDeferred: false },
    { name: 'Slash commands', tokens: 1_500, color: 'inactive', kind: 'used', isDeferred: false },
    { name: 'Messages', tokens: 186_000, color: 'purple_FOR_SUBAGENTS_ONLY', kind: 'used', isDeferred: false },
    { name: 'Autocompact buffer', tokens: 50_000, color: 'inactive', kind: 'buffer', isDeferred: false },
    { name: 'Free space', tokens: 746_000, color: 'promptBorder', kind: 'free', isDeferred: false },
  ],
  totalTokens: 204_000,
  maxTokens: 1_000_000,
  rawMaxTokens: 1_000_000,
  percentage: 20,
  autoCompactThreshold: 950_000,
  isAutoCompactEnabled: true,
  gridRows: [],
  memoryFiles: [
    { path: '/Users/me/CLAUDE.md', type: 'User', tokens: 3_100 },
    { path: '/work/proj/CLAUDE.md', type: 'Project', tokens: 900 },
  ],
  mcpTools: [
    { name: 'mcp__playwright__browser_navigate', serverName: 'playwright', tokens: 1_400, isLoaded: true },
    { name: 'mcp__playwright__browser_click', serverName: 'playwright', tokens: 600, isLoaded: false },
    { name: 'mcp__obsidian__search', serverName: 'obsidian', tokens: 1_200, isLoaded: true },
  ],
  agents: [
    { agentType: 'Explore', source: 'userSettings', tokens: 800 },
    { agentType: 'general-purpose', source: 'built-in', tokens: 160 },
  ],
  skills: {
    totalSkills: 40,
    includedSkills: 12,
    tokens: 2_000,
    skillFrontmatter: [{ name: 'brainstorm', source: 'userSettings', tokens: 300 }],
  },
  slashCommands: { totalCommands: 30, includedCommands: 25, tokens: 1_500 },
  model: 'opus',
  apiUsage: null,
  autocompactSource: 'model-default',
}

// The system prompt as the engine composes it: ids, the text sent, and the cache boundary each
// sits on. The breakdown has no list for the System prompt row — this call is where it comes from.
const SECTIONS = [
  { id: 'intro', text: 'x'.repeat(4_000), scope: 'shared' },
  { id: 'system', text: 'x'.repeat(12_000), scope: 'shared' },
  { id: 'doing_tasks', text: 'x'.repeat(8_000), scope: 'session' },
]

// The tools the model can call, as `$.tool.list()` answers: built-in and MCP alike, in the order
// the model sees them. The engine counts the row whole and hands over no count per tool.
const TOOLS = [
  { name: 'Bash', description: 'Run a shell command in the working directory. Use it for builds.', mcp: false },
  { name: 'Read', description: 'Read a file from the filesystem', mcp: false },
  { name: 'mcp__playwright__browser_navigate', description: 'Navigate to a URL', mcp: true },
]

// The conversation as `$.session.messages()` returns it. The third row carries the same tool
// result the second one's call does: the transcript holds a result on both sides, one fact.
const MESSAGES = [
  { role: 'user' as const, text: 'check whats inside system prompt', toolUses: [] },
  {
    role: 'assistant' as const,
    text: 'The typings run to 21,174 lines.',
    toolUses: [{ tool_use_id: 't1', tool: 'Read', input: { file_path: '/x' }, text: 'z'.repeat(8_000) }],
  },
  { role: 'user' as const, text: 'ok', toolUses: [], toolResults: [{ tool_use_id: 't1', text: 'z'.repeat(8_000) }] },
]

// Stands for the engine beneath the mod.
function engine(on: any, store: Record<string, unknown> = {}) {
  const asked: unknown[] = []
  on('session.start', (_$: any, e: any) => ({ sessionId: 's', cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.compose', () => ({ sections: SECTIONS }))
  on('tool.list', () => ({ value: TOOLS }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('store.get', (_$: any, e: any) => ({ value: store[e.key] }))
  on('store.set', (_$: any, e: any) => ((store[e.key] = e.value), { value: undefined }))
  on('session.usage', (_$: any, e: any) => {
    asked.push(e)
    return { value: { startedAt: 0, context: { tokens: 204_000, window: 1_000_000, percent: 20, breakdown: BREAKDOWN }, rateLimits: {}, cost: { usd: 0 } } }
  })
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: 'band below' }))
  return { asked, store }
}

const settle = () => new Promise(done => (globalThis as any).setTimeout(done, 20)) // the first refresh runs in the background
const mountBand = ($: any) => $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND } as any)

async function start($: any) {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' } as any)
  await settle()
}

// What the band draws: one instance, so `findAll` counts what is on screen rather than a merge.
const texts = async (band: any) => (await band.findAll({ type: 'Text' })).map((t: any) => t.text)
const framed = async (band: any) => (await band.findAll({ type: 'Box' })).filter((b: any) => b.props.borderStyle === 'round')

describe('context-bar', () => {
  test('helpers', () => {
    expect(tokens(3_400)).toBe('3.4k')
    expect(tokens(186_000)).toBe('186k')
    expect(tokens(1_000_000)).toBe('1M')
    expect(tokens(950)).toBe('950')
    expect(share(3_400, 1_000_000)).toBe('0.3%')
    expect(share(186_000, 1_000_000)).toBe('19%')
    expect(share(494, 1_000_000)).toBe('<0.1%')

    const r = toReading(BREAKDOWN)
    // Deferred and empty rows are left out; used first, then free, then the buffer.
    expect(r.slices.map(s => s.name)).toEqual([
      'system prompt',
      'system tools',
      'mcp tools',
      'memory files',
      'custom agents',
      'skills',
      'slash commands',
      'messages',
      'free space',
      'autocompact buffer',
    ])
    expect(r.compactsAt).toBe(950_000)
    // Every used row has its own color, and none matches free space or the buffer.
    const colors = r.slices.filter(s => s.kind === 'used').map(s => s.color)
    expect(new Set(colors).size).toBe(colors.length)
    expect(cells(r, 80).find(c => c.kind === 'buffer')?.text).toMatch(/^░+$/)
    expect(cells(r, 80).find(c => c.kind === 'free')?.text).toMatch(/^─+$/)

    for (const width of [20, 47, 80, 200]) {
      const bar = cells(r, width)
      expect(bar.reduce((n, c) => n + c.text.length, 0)).toBe(width) // always exactly the width
      expect(bar.filter(c => c.kind === 'used').every(c => c.text.length >= 1)).toBe(true) // a small used slice still shows
    }
    for (const line of legend(r, 40)) {
      const size = line.reduce((n, s, i) => n + (i ? 3 : 0) + 2 + s.name.length + 1 + tokens(s.tokens).length + (s.kind === 'used' ? 1 + share(s.tokens, r.window).length : 0), 0)
      expect(size <= 40 || line.length === 1).toBe(true)
    }
    expect(toReading({ ...BREAKDOWN, isAutoCompactEnabled: false }).compactsAt).toBeUndefined()
  })

  test('the drill-down groups MCP tools by server and shortens paths', () => {
    const d = toReading(BREAKDOWN).drilldown
    expect(d.memoryFiles).toEqual([
      { name: '~/CLAUDE.md', tokens: 3_100, note: 'User' },
      { name: '/work/proj/CLAUDE.md', tokens: 900, note: 'Project' },
    ])
    // Servers by tokens, each with its tools named; an on-demand schema is counted, not listed.
    expect(d.mcpServers).toEqual([
      { name: 'playwright', tokens: 2_000, note: 'browser_navigate · 1 on demand' },
      { name: 'obsidian', tokens: 1_200, note: 'search' },
    ])
    expect(d.agents.map(a => a.name)).toEqual(['Explore', 'general-purpose'])
    expect(d.skills).toEqual([{ name: 'brainstorm', tokens: 300, note: 'userSettings' }])
    expect(d.slashCommands).toEqual({ tokens: 1_500, included: 25, total: 30 })
    expect(d.model).toBe('opus')
  })

  test('draws the bar and legend above the prompt from a summary breakdown', async ($, on) => {
    const { asked } = engine(on)
    await start($)
    expect(asked).toEqual([{ breakdown: 'summary' }]) // estimated locally, never the token-count API

    const band = await mountBand($)
    expect(await band.find({ type: 'Text', text: /204k of 1M · compacts at 950k/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: / 20% / })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^messages $/ })).toBeDefined() // the legend, not the detail table
    expect(await band.find({ type: 'Text', text: /^186k$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /mcp tools \(deferred\)/ })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: 'band below' })).toBeDefined() // the band beneath stays
    await band.unmount()
  })

  test('the ▾ opens the same box in place: one frame, one header, the legend giving way', async ($, on) => {
    engine(on)
    await start($)
    const band = await mountBand($)

    expect(await band.find({ type: 'Text', text: /^detail$/ })).toBeUndefined() // folded: no detail yet
    expect(await framed(band)).toHaveLength(1) // one box, folded

    await band.press({ key: 'toggle' })

    // Still one box and one header: nothing popped in beside the bar.
    expect(await framed(band)).toHaveLength(1)
    expect((await texts(band)).filter((t: string) => t === 'context')).toHaveLength(1)
    expect(await band.find({ type: 'Text', text: /context window/ })).toBeUndefined() // the old second header is gone
    // The bar is still drawn once, and the header still reads the same figures.
    expect(await band.find({ type: 'Text', text: /204k of 1M · compacts at 950k/ })).toBeDefined()
    // The legend has given way to the detail table.
    expect(await band.find({ type: 'Text', text: /^messages $/ })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: /^detail$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^messages +$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^\s+186k$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^\s+19%$/ })).toBeDefined() // messages' share of the window
    expect(await band.find({ type: 'Text', text: /^\s+0\.3%$/ })).toBeDefined() // system prompt's
    // The rows that have detail behind them lead with a mark, and none of them is open yet.
    for (const row of ['memory', 'mcp', 'agents', 'skills']) {
      expect((await band.find({ type: 'Button', key: row }))?.props.label).toBe('▶')
    }
    // The command count and the window's line are figures: read at a glance, nothing to open.
    expect(await band.find({ type: 'Button', key: 'slash' })).toBeUndefined()
    expect(await band.find({ type: 'Button', key: 'window' })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: /^\s+25 of 30 · 1\.5k$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^\s+opus · compacts at 950k$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: '~/CLAUDE.md' })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: /^\s+browser_navigate · 1 on demand$/ })).toBeUndefined()
    // The lists are not laid out again below the rows: a row is where its detail is.
    expect(await band.find({ type: 'Text', text: /^memory files$/ })).toBeUndefined()
    const minimize = await band.find({ type: 'Button', key: 'minimize' })
    expect(minimize?.props).toMatchObject({ label: 'Minimize', hotkey: 'q' })
    // The opened content is one block, sized to its widest row and never over the room it has.
    const block = (await band.findAll({ type: 'Box' })).find((b: any) => typeof b.props.width === 'number')
    expect(block?.props.width).toBe(metrics(frameWidth(BAND.props.bodyColumns - 4)).total)
    expect(block!.props.width as number).toBeLessThanOrEqual(BAND.props.bodyColumns - 4)
    await band.unmount()
  })

  test('a row unfolds its own list under itself, and only one row is open at a time', async ($, on) => {
    engine(on)
    await start($)
    const band = await mountBand($)
    await band.press({ key: 'toggle' })

    expect(await band.find({ type: 'Text', text: /^brainstorm$/ })).toBeUndefined()

    await band.press({ key: 'skills' })
    expect((await band.find({ type: 'Button', key: 'skills' }))?.props.label).toBe('▼')
    expect(await band.find({ type: 'Text', text: /^brainstorm$/ })).toBeDefined()

    await band.press({ key: 'skills' }) // the ▶ it became: shut again
    expect((await band.find({ type: 'Button', key: 'skills' }))?.props.label).toBe('▶')
    expect(await band.find({ type: 'Text', text: /^brainstorm$/ })).toBeUndefined()

    // Opening another shuts the first: the box is the rows plus one list, never two.
    await band.press({ key: 'memory' })
    expect(await band.find({ type: 'Text', text: '~/CLAUDE.md' })).toBeDefined()
    await band.press({ key: 'mcp' })
    expect(await band.find({ type: 'Text', text: /^\s+browser_navigate · 1 on demand$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: '~/CLAUDE.md' })).toBeUndefined()
    expect((await band.find({ type: 'Button', key: 'memory' }))?.props.label).toBe('▶')
    await band.unmount()
  })

  test('the marks say which rows have detail, and no list is repeated below them', () => {
    const r = toReading(BREAKDOWN)
    const l = lists(r)
    expect(l.map(x => x.id)).toEqual(['memory', 'mcp', 'agents', 'skills'])
    expect(l.map(x => x.note)).toEqual(['4k', 'by server · 3.2k', '960', '1 of 12 · 2k'])
    // What /context counts with nothing under it is a figure, not a list: no mark, nothing to open.
    expect(figures(r)).toEqual([
      { text: 'slash commands', note: '25 of 30 · 1.5k' },
      { text: 'window', note: 'opus · compacts at 950k' },
    ])

    const shut = blocks(r)
    const rows = shut.filter(b => b.kind === 'row')
    expect(rows).toHaveLength(r.slices.length)
    // The rows /context counts a list for carry the mark; the rest of the breakdown does not.
    expect(rows.filter((b: any) => b.list).map((b: any) => b.list.id)).toEqual(['mcp', 'memory', 'agents', 'skills'])
    expect(rows.every((b: any) => !b.open)).toBe(true)
    expect(shut.filter(b => b.kind === 'item')).toHaveLength(0)
    // Every list has a row to open under, so nothing is left over to keep an entry.
    expect(shut.filter(b => b.kind === 'entry')).toHaveLength(0)
    expect(shut.filter(b => b.kind === 'figure').map((b: any) => b.text)).toEqual(['slash commands', 'window'])

    // Open one: its items follow its own row, and no other row opened with it.
    const open = blocks(r, 'skills')
    expect(open.filter(b => b.kind === 'item')).toHaveLength(1)
    expect(open.find((b: any) => b.list?.id === 'skills')).toMatchObject({ kind: 'row', open: true })
    expect(open.filter((b: any) => b.kind === 'row' && b.open)).toHaveLength(1)
  })

  test('the System prompt row reads off the composition, its figures marked as estimates', async ($, on) => {
    engine(on)
    await start($)
    // The engine fires this for every prompt it sends; the sections come free here. Each fact
    // left out is read off the session, so the model alone is enough to compose for.
    await $.prompt.compose({ model: 'opus', promptModel: 'opus', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as any)
    await settle()
    const band = await mountBand($)
    await band.press({ key: 'toggle' })

    // The row the breakdown carries no list for now has one, and the mark says so.
    expect((await band.find({ type: 'Button', key: 'prompt' }))?.props.label).toBe('▶')
    await band.press({ key: 'prompt' })
    for (const id of ['intro', 'system', 'doing_tasks']) {
      expect(await band.find({ type: 'Text', text: id })).toBeDefined()
    }
    // `~` on every figure this mod estimated, and none on the engine's own.
    expect(await band.find({ type: 'Text', text: /^\s+~3k$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^\s+shared$/ })).toBeDefined() // the cache boundary
    expect(await band.find({ type: 'Text', text: /^\s+session$/ })).toBeDefined()

    await band.press({ key: 'memory' }) // the engine's own counts keep no `~`
    expect(await band.find({ type: 'Text', text: /^\s+3\.1k$/ })).toBeDefined()
    await band.unmount()
  })

  test('the prompt sections are the engine\'s ids and text, and the tokens are the mod\'s guess', () => {
    expect(promptItems(SECTIONS)).toEqual([
      { name: 'intro', tokens: 1_000, note: 'shared', estimated: true },
      { name: 'system', tokens: 3_000, note: 'shared', estimated: true },
      { name: 'doing_tasks', tokens: 2_000, note: 'session', estimated: true },
    ])
    const r = toReading(BREAKDOWN)
    // The list hangs off the System prompt row, and is a count of sections rather than a total:
    // a total of this mod's estimates would sit against the engine's own figure for the row.
    const l = lists(r, promptItems(SECTIONS))
    expect(l.map(x => x.id)).toEqual(['prompt', 'memory', 'mcp', 'agents', 'skills'])
    expect(l[0]!.note).toBe('3 sections')
    expect(blocks(r, null, promptItems(SECTIONS)).find((b: any) => b.list?.id === 'prompt')).toMatchObject({
      kind: 'row',
      open: false,
    })
    // With no composition read yet, the row is a plain one again.
    expect(lists(r).map(x => x.id)).toEqual(['memory', 'mcp', 'agents', 'skills'])
  })

  test('the System tools row is a roll-call: names and their own words, with no figure to give', async ($, on) => {
    engine(on)
    await start($)
    await settle()
    const band = await mountBand($)
    await band.press({ key: 'toggle' })

    expect((await band.find({ type: 'Button', key: 'tools' }))?.props.label).toBe('▶')
    await band.press({ key: 'tools' })
    expect(await band.find({ type: 'Text', text: 'Bash' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^\s+Run a shell command in the working directory$/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: 'Read' })).toBeDefined()
    // The cells are bare rather than filled with a zero: the engine counts the row whole.
    expect(await band.find({ type: 'Text', text: /^\s+0$/ })).toBeUndefined()
    // An MCP tool is counted under its own row, so it is not listed here as well.
    expect(await band.find({ type: 'Text', text: 'mcp__playwright__browser_navigate' })).toBeUndefined()
    await band.unmount()
  })

  test('the built-in tools carry no figure and leave MCP to its own row', () => {
    expect(toolItems(TOOLS)).toEqual([
      { name: 'Bash', note: 'Run a shell command in the working directory' },
      { name: 'Read', note: 'Read a file from the filesystem' },
    ])
    expect(toolItems(TOOLS).every(i => i.tokens === undefined)).toBe(true) // nothing guessed off a description
    const long = toolItems([{ name: 'X', description: 'a'.repeat(90), mcp: false }])
    expect(long[0]!.note!.length).toBeLessThanOrEqual(44)
    expect(long[0]!.note!.endsWith('…')).toBe(true)

    const r = toReading(BREAKDOWN)
    const l = lists(r, [], toolItems(TOOLS))
    expect(l.map(x => x.id)).toEqual(['tools', 'memory', 'mcp', 'agents', 'skills'])
    expect(l[0]!.note).toBe('2 built-in')
    // The System tools row hangs off it, and reads as a plain row until the tools are read.
    expect(blocks(r, null, [], toolItems(TOOLS)).find((b: any) => b.list?.id === 'tools')).toMatchObject({ kind: 'row', open: false })
    expect(lists(r).map(x => x.id)).toEqual(['memory', 'mcp', 'agents', 'skills'])
  })

  test('the Messages row opens onto the biggest messages, ranked', async ($, on) => {
    engine(on)
    await start($)
    await settle()
    const band = await mountBand($)
    await band.press({ key: 'toggle' })

    expect((await band.find({ type: 'Button', key: 'messages' }))?.props.label).toBe('▶')
    await band.press({ key: 'messages' })
    expect(await band.find({ type: 'Text', text: 'assistant · 1 call' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^\s+~2k$/ })).toBeDefined() // an estimate, marked as one
    expect(await band.find({ type: 'Text', text: /^\s+check whats inside system prompt$/ })).toBeDefined()
    await band.unmount()
  })

  test('the conversation is ranked by what each message costs, and a tool result counted once', () => {
    const ranked = messageItems(MESSAGES)
    expect(ranked.map(i => i.name)).toEqual(['assistant · 1 call', 'you', 'you'])
    expect(ranked.map(i => i.note)).toEqual(['The typings run to 21,174 lines', 'check whats inside system prompt', 'ok'])
    expect(ranked.every(i => i.estimated)).toBe(true)
    // The result rides the call that made it; the user message carrying the same text is not charged again.
    expect(ranked[0]!.tokens).toBeGreaterThan(2_000)
    expect(ranked[2]!.tokens).toBe(1)
    expect(ranked[1]!.tokens).toBe(Math.round('check whats inside system prompt'.length / 4))
    // One call and more than one, told apart.
    const many = [{ role: 'assistant' as const, text: '', toolUses: [{ tool_use_id: 'a', tool: 'Bash', input: {} }, { tool_use_id: 'b', tool: 'Read', input: {} }] }]
    expect(messageItems(many)[0]!.name).toBe('assistant · 2 calls')

    const r = toReading(BREAKDOWN)
    const l = lists(r, [], [], messageItems(MESSAGES))
    expect(l.map(x => x.id)).toEqual(['memory', 'mcp', 'agents', 'skills', 'messages'])
    expect(l.find(x => x.id === 'messages')!.note).toBe('3 messages, biggest first')
    // With no transcript read yet, the row is a plain one again.
    expect(lists(r).map(x => x.id)).toEqual(['memory', 'mcp', 'agents', 'skills'])
  })

  test('a wide box centers the detail in it, rather than sprawling', async ($, on) => {
    engine(on)
    await start($)
    const wide = { ...BAND, props: { ...BAND.props, bodyColumns: 120 } }
    const band = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...wide } as any)
    await band.press({ key: 'toggle' })

    const room = 120 - 4
    const block = (await band.findAll({ type: 'Box' })).find((b: any) => typeof b.props.width === 'number')
    expect(block?.props.width).toBe(metrics(frameWidth(room)).total)
    expect(block!.props.width as number).toBeLessThan(room) // margins on both sides to center in
    const centering = (await band.findAll({ type: 'Box' })).find((b: any) => b.props.alignItems === 'center')
    expect(centering).toBeDefined() // and the box that centers it holds the block's column
    await band.unmount()
  })

  test('the ▴ and the Minimize button fold the one box back', async ($, on) => {
    engine(on)
    await start($)
    const band = await mountBand($)
    await band.press({ key: 'toggle' })
    expect(await band.find({ type: 'Text', text: /^detail$/ })).toBeDefined()

    await band.press({ key: 'toggle' }) // the ▴ it became
    expect(await band.find({ type: 'Text', text: /^detail$/ })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: /^messages $/ })).toBeDefined() // the legend is back
    expect(await framed(band)).toHaveLength(1)

    await band.press({ key: 'toggle' })
    await band.press({ key: 'minimize' })
    expect(await band.find({ type: 'Text', text: /^detail$/ })).toBeUndefined()
    await band.unmount()
  })

  test('the box stays open across a refresh, and hiding the bar folds it', async ($, on) => {
    engine(on)
    await start($)
    const band = await mountBand($)
    await band.press({ key: 'toggle' })
    await band.press({ key: 'agents' }) // one section left open across the refresh

    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1 } as any)
    await settle()
    expect(await band.find({ type: 'Text', text: /^detail$/ })).toBeDefined() // a turn redraws it open
    expect((await band.find({ type: 'Button', key: 'agents' }))?.props.label).toBe('▼') // and as it was left
    await band.unmount()

    await $.command.run({ command: 'context-bar', args: '' } as any) // hiding
    await $.command.run({ command: 'context-bar', args: '' } as any) // showing again
    const again = await mountBand($)
    expect(await again.find({ type: 'Text', text: /^detail$/ })).toBeUndefined() // folded, not left open
    await again.unmount()
  })

  test('refreshes after a main turn, not after a subagent turn', async ($, on) => {
    const { asked } = engine(on)
    await start($)
    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, agentId: 'a1' } as any)
    expect(asked.length).toBe(1)
    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1 } as any)
    expect(asked.length).toBe(2)
  })

  test('refreshes after a compaction', async ($, on) => {
    const { asked } = engine(on)
    on('session.compact', () => ({ messages: [{ role: 'user', text: 'summary', toolUses: [] }] }))
    await start($)
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] } as any)
    await settle()
    expect(asked.length).toBe(2)
  })

  test('/context-bar hides and shows it, and remembers the choice', async ($, on) => {
    const { store } = engine(on)
    await start($)
    expect((await $.command.run({ command: 'context-bar', args: '' } as any)).text).toMatch(/hidden/)
    expect(store.isHidden).toBe(true)
    let band = await mountBand($)
    expect(await band.find({ type: 'Text', text: /of 1M/ })).toBeUndefined()
    await band.unmount()

    expect((await $.command.run({ command: 'context-bar', args: '' } as any)).text).toBe('Context bar on')
    expect(store.isHidden).toBe(false)
    band = await mountBand($)
    expect(await band.find({ type: 'Text', text: /of 1M/ })).toBeDefined()
    await band.unmount()
  })

  test('a session that hid it starts hidden', async ($, on) => {
    engine(on, { isHidden: true })
    await start($)
    const band = await mountBand($)
    expect(await band.find({ type: 'Text', text: /of 1M/ })).toBeUndefined()
    await band.unmount()
  })

  test('the detail rows fit the cells they are given', () => {
    const r = toReading(BREAKDOWN)
    for (const width of [20, 40, 60, 96, 200]) {
      const m = metrics(width)
      const row = m.mark + m.swatch + m.name + (m.bar > 0 ? 1 + m.bar : 0) + 1 + m.num + 1 + m.pct
      expect(row).toBeLessThanOrEqual(width)
      expect(m.total).toBe(row) // what the block is sized to is what the widest row comes to
    }
    // The block never sprawls across a wide box, and never overflows a narrow one.
    expect(frameWidth(200)).toBe(84)
    expect(frameWidth(96)).toBe(84)
    expect(frameWidth(60)).toBe(60)
    expect(frameWidth(10)).toBe(20) // the floor, as the bar's own
    for (const room of [20, 40, 84, 120]) expect(metrics(frameWidth(room)).total).toBeLessThanOrEqual(frameWidth(room))

    expect(barFill(186_000, 186_000, 20)).toBe(20) // the largest row fills its meter
    expect(barFill(3_400, 186_000, 20)).toBe(1) // a small one still shows
    expect(barFill(746_000, 0, 20)).toBe(0) // nothing to scale against
    expect(blocks(r).filter(b => b.kind === 'row')).toHaveLength(r.slices.length)
    // A list longer than the cap is cut, with a count of what is left out.
    const many = { ...BREAKDOWN, memoryFiles: Array.from({ length: 20 }, (_, i) => ({ path: `/f/${i}.md`, type: 'User', tokens: 10 })) }
    const cut = blocks(toReading(many), 'memory')
    expect(cut.filter(b => b.kind === 'item' && b.item.note === 'User')).toHaveLength(12) // the memory files, capped
    expect(cut.some(b => b.kind === 'note' && b.text === '+8 more')).toBe(true)
    // A list with nothing in it is left out whole: its row keeps no mark to press.
    const bare = blocks(toReading({ ...BREAKDOWN, memoryFiles: [], mcpTools: [], agents: [], skills: undefined, slashCommands: undefined }))
    expect(bare.some(b => b.kind === 'row' && b.list !== undefined && b.list.id === 'mcp')).toBe(false)
    // The figures are drawn whatever else is, and one with no count behind it is not.
    expect(bare.filter(b => b.kind === 'figure').map((b: any) => b.text)).toEqual(['window'])
  })
})
