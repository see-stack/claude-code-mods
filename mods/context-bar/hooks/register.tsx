// Context Bar: what is filling my context window?
//   Above the prompt, the window as one stacked bar, a color per category as /context
//   draws them (system prompt, tools, MCP tools, memory files, skills, messages, free),
//   with a legend of tokens and shares and where auto-compaction runs. It refreshes after
//   each turn. The ▾ at the header's end opens the box up: the legend gives way to every row
//   with its tokens and share. The rows counted for something with a list behind them — the
//   system prompt, system tools, memory files, MCP tools, agents, skills, messages — lead with a ▶ that unfolds that list under the row
//   itself, the mark turning to a ▼. Only one is open at a time, so the box is the rows plus a
//   single list however long that list is. Nothing is repeated below the rows: a row is where
//   its detail is. What /context counts with nothing under it — the command listing, and the
//   window it measured against — is drawn as a figure, there to be read and with no mark to
//   press. One box throughout, growing away from the prompt — no second frame, no repeated
//   header. The ▴ it becomes, or the Minimize button, folds it back. /context-bar shows or
//   hides the bar, and the choice is kept across sessions.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Block, Drilldown, Item, List, Reading, Slice } from '../types'

const MIN_WIDTH = 20 // narrower than this, the bar is not drawn
const SPLIT = '   '
const MAX_ITEMS = 12 // a list longer than this is cut, with a count of what it left out
const INDENT = 4 // what a list's own rows are indented by, under the row they open from
const CONTENT_WIDTH = 84 // the widest the detail is laid out at, so it sits centered in a wider box
// /context's theme gives several rows the same grey, so each used row gets its own color, in order.
const PALETTE = ['#7aa2f7', '#7dcfff', '#bb9af7', '#9ece6a', '#e0af68', '#f7768e', '#73daca', '#ff9e64', '#c0caf5']
const MESSAGES = '#d97757' // the row that grows, in the accent color
const FREE = '#808080' // a mid grey thin line reads as empty on dark and light themes alike
const BUFFER = '#808080'
const SWATCH = { used: '■', free: '─', buffer: '░' } as const // what a legend and a detail row lead with
const GLYPH = { used: '█', free: '─', buffer: '░' } as const // what the bar and a share meter fill with
const REST = '·' // what a share meter fills the room it has left with

// Held by the host, so the bar survives a hot reload of this file.
const reading = atom({ plugin: 'context-bar', key: 'reading' } as const, null as Reading | null)
const isHidden = atom({ plugin: 'context-bar', key: 'isHidden' } as const, false)
const isOpen = atom({ plugin: 'context-bar', key: 'isOpen' } as const, false)
// The one list that is open under its row, if any. One at a time, so the box is the rows plus a
// single list however long the band is; nothing open, it is the rows alone.
const openRow = atom({ plugin: 'context-bar', key: 'openRow' } as const, null as string | null)
// The system prompt's own sections. The breakdown carries no list for the System prompt row, so
// these are read off the composition instead — the engine's ids and text, this mod's token guess.
const promptSections = atom({ plugin: 'context-bar', key: 'promptSections' } as const, [] as Item[])
// The built-in tools the model can call. The engine counts the System tools row whole and hands
// over no count per tool, so these rows are a roll-call with the tool's own words and no figure.
const toolList = atom({ plugin: 'context-bar', key: 'toolList' } as const, [] as Item[])
// The conversation, biggest message first. A transcript runs to hundreds of messages where the
// box shows twelve, so what it shows are the twelve that cost the most.
const messageList = atom({ plugin: 'context-bar', key: 'messageList' } as const, [] as Item[])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'context-bar', description: 'Show or hide the context window bar above the prompt' }).catch(() => {}) // a name Claude Code already has is refused: start anyway
    const hidden = (await $.store.get('isHidden').catch(() => undefined)) === true
    await update($, isHidden, () => hidden)
    void refresh($).catch(() => {})
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) await refresh($).catch(() => {}) // a subagent's turn fills its own window, not this one
    return r
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId && 'messages' in r) void refresh($).catch(() => {}) // a /compact empties the window without a turn ending
    return r
  })

  // The engine fires this for every prompt it sends, so the sections come free here; asking
  // `$.prompt.compose` instead would compose the whole prompt again on every redraw. The
  // result goes back untouched: this reads the composition, it does not change it.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    void update($, promptSections, () => promptItems(r.sections)).catch(() => {})
    return r
  })

  on('command.run', { command: 'context-bar' }, async $ => {
    const hidden = await update($, isHidden, h => !h)
    await $.store.set('isHidden', hidden).catch(() => {})
    if (hidden) await update($, isOpen, () => false) // hiding takes the opened box down with it
    else await refresh($).catch(() => {})
    return { text: hidden ? 'Context bar hidden. /context-bar shows it again' : 'Context bar on' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rest = await next(e) // what other mods and Claude Code draw here stays
    const r = await read($, reading)
    if (e.props.hasSurvey || (await read($, isHidden)) || !r) return rest
    const { Box, Text, Button } = $.ui.resolve(e)
    const inner = e.props.bodyColumns - 4 // the border and padding take 4 cells
    if (inner < MIN_WIDTH) return rest

    const opened = await read($, isOpen)
    const show = await read($, openRow)
    const prompt = await read($, promptSections)
    const tools = await read($, toolList)
    const messages = await read($, messageList)
    // A list opens under its own row, and one at a time: opening another shuts the first.
    const toggle = (id: string) => update($, openRow, (now: string | null) => (now === id ? null : id))
    const head = `${tokens(r.total)} of ${tokens(r.window)}${r.compactsAt ? ` · compacts at ${tokens(r.compactsAt)}` : ''}`
    const badge = ` ${r.percent}% `
    // The detail is laid out in a block narrower than a wide box, and centered in it.
    const m = metrics(frameWidth(inner))
    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text wrap="truncate-end">
              <Text color="#d97757">{'◆ '}</Text>
              <Text bold>context</Text>
            </Text>
            <Box flexDirection="row">
              <Text wrap="truncate-start">
                <Text dimColor>{`${head} `}</Text>
                <Text bold color="black" backgroundColor={levelColor(r)}>{badge}</Text>
                <Text> </Text>
              </Text>
              <Button key="toggle" plain label={opened ? '▴' : '▾'} onPress={() => update($, isOpen, v => !v)} />
            </Box>
          </Box>
          <Text>
            {cells(r, inner).map(c => (
              <Text color={c.color}>{c.text}</Text>
            ))}
          </Text>
          {!opened &&
            legend(r, inner).map(line => (
              <Text wrap="truncate-end">
                {line.map((s, i) => (
                  <Text>
                    {i > 0 && <Text>{SPLIT}</Text>}
                    <Text color={s.color}>{`${SWATCH[s.kind]} `}</Text>
                    <Text dimColor={s.kind !== 'used'}>{`${s.name} `}</Text>
                    <Text bold={s.kind === 'used'}>{tokens(s.tokens)}</Text>
                    {s.kind === 'used' && <Text dimColor>{` ${share(s.tokens, r.window)}`}</Text>}
                  </Text>
                ))}
              </Text>
            ))}
          {opened && (
            <Box flexDirection="column" alignItems="center">
              <Box flexDirection="column" width={m.total}>
                {blocks(r, show, prompt, tools, messages).map(b => {
                  if (b.kind === 'gap') return <Text> </Text>
                  if (b.kind === 'entry') {
                    const list = b.list
                    return (
                      <Box flexDirection="row">
                        <Button key={list.id} plain label={b.open ? '▼' : '▶'} onPress={() => toggle(list.id)} />
                        <Text wrap="truncate-end">
                          <Text>{' '}</Text>
                          <Text bold>{list.head}</Text>
                          {list.note !== undefined && <Text dimColor>{`  ${list.note}`}</Text>}
                        </Text>
                      </Box>
                    )
                  }
                  if (b.kind === 'figure')
                    return (
                      <Text wrap="truncate-end">
                        <Text>{'  '}</Text>
                        <Text bold>{b.text}</Text>
                        <Text dimColor>{`  ${b.note}`}</Text>
                      </Text>
                    )
                  if (b.kind === 'head')
                    return (
                      <Text wrap="truncate-end">
                        <Text bold>{b.text}</Text>
                        {b.note !== undefined && <Text dimColor>{`  ${b.note}`}</Text>}
                      </Text>
                    )
                  if (b.kind === 'note')
                    return (
                      <Text dimColor wrap="truncate-end">
                        {`${' '.repeat(2 + m.num)}${b.text}`}
                      </Text>
                    )
                  if (b.kind === 'item')
                    return (
                      <Text wrap="truncate-end">
                        <Text>{' '.repeat(INDENT)}</Text>
                        {/* A `~` wherever the figure is this mod's estimate. A tool has no figure at all:
                            the engine counts its row whole, so the cells are left bare rather than guessed. */}
                        <Text bold>
                          {b.item.tokens === undefined ? ' '.repeat(m.num) : lpad(`${b.item.estimated ? '~' : ''}${tokens(b.item.tokens)}`, m.num)}
                        </Text>
                        <Text>{'  '}</Text>
                        <Text>{cut(b.item.name, itemRoom(m.total, m.num, b.item))}</Text>
                        {b.item.note !== undefined && <Text dimColor>{`  ${b.item.note}`}</Text>}
                      </Text>
                    )
                  const filled = barFill(b.slice.tokens, b.max, m.bar)
                  const list = b.list
                  return (
                    <Box flexDirection="row">
                      {/* The row that has detail under it leads with a mark; a bare row keeps the cells. */}
                      {list ? (
                        <Button key={list.id} plain label={b.open ? '▼' : '▶'} onPress={() => toggle(list.id)} />
                      ) : (
                        <Text>{' '}</Text>
                      )}
                      <Text>{' '}</Text>
                      <Text wrap="truncate-end">
                        <Text color={b.slice.color}>{`${SWATCH[b.slice.kind]} `}</Text>
                        <Text dimColor={b.slice.kind !== 'used'}>{pad(b.slice.name, m.name)}</Text>
                        {m.bar > 0 && <Text>{' '}</Text>}
                        {m.bar > 0 && (
                          <Text>
                            <Text color={b.slice.color}>{GLYPH[b.slice.kind].repeat(filled)}</Text>
                            {m.bar - filled > 0 && <Text dimColor>{REST.repeat(m.bar - filled)}</Text>}
                          </Text>
                        )}
                        <Text>{' '}</Text>
                        <Text bold={b.slice.kind === 'used'}>{lpad(tokens(b.slice.tokens), m.num)}</Text>
                        <Text>{' '}</Text>
                        <Text dimColor>{lpad(share(b.slice.tokens, r.window), m.pct)}</Text>
                      </Text>
                    </Box>
                  )
                })}
                <Text> </Text>
                <Button key="minimize" label="Minimize" hotkey="q" onPress={() => update($, isOpen, () => false)} />
              </Box>
            </Box>
          )}
        </Box>
        {rest}
      </Box>
    )
  })
}

// Asks the engine for /context's breakdown, estimated locally (no token-count calls).
async function refresh($: EngineInterface) {
  if (await read($, isHidden)) return
  const usage = await $.session.usage({ breakdown: 'summary' })
  const b = usage.context.breakdown
  if (!b || !(b.rawMaxTokens > 0)) return // no window to measure against
  await update($, reading, () => toReading(b))
  // The tools can change mid-session — an MCP server connects, a plugin registers one — so this
  // is read on the same beat as the breakdown rather than once at the start.
  const tools = await $.tool.list().catch(() => [])
  await update($, toolList, () => toolItems(tools))
  const said = await $.session.messages().catch(() => [])
  await update($, messageList, () => messageItems(said))
}

export function toReading(b: {
  categories: { name: string; tokens: number; color: string; kind: string }[]
  totalTokens: number
  rawMaxTokens: number
  percentage: number
  autoCompactThreshold?: number
  isAutoCompactEnabled: boolean
  autocompactSource?: string
  model?: string
  memoryFiles?: { path: string; type: string; tokens: number }[]
  mcpTools?: { name: string; serverName: string; tokens: number; isLoaded: boolean }[]
  agents?: { agentType: string; source: string; tokens: number }[]
  skills?: {
    totalSkills: number
    includedSkills: number
    tokens: number
    skillFrontmatter: { name: string; source: string; pluginName?: string; tokens: number }[]
  }
  slashCommands?: { totalCommands: number; includedCommands: number; tokens: number }
}): Reading {
  const slices: Slice[] = b.categories
    .filter(c => c.kind !== 'deferred' && c.tokens > 0)
    .map(c => ({ name: c.name.toLowerCase(), tokens: c.tokens, color: c.color, kind: c.kind as Slice['kind'] }))
  const order = { used: 0, free: 1, buffer: 2 }
  slices.sort((x, y) => order[x.kind] - order[y.kind]) // stable: used rows keep /context's order
  let next = 0
  for (const s of slices) {
    s.color = s.kind === 'free' ? FREE : s.kind === 'buffer' ? BUFFER : s.name === 'messages' ? MESSAGES : PALETTE[next++ % PALETTE.length]!
  }
  return {
    slices,
    total: b.totalTokens,
    window: b.rawMaxTokens,
    percent: b.percentage,
    compactsAt: b.isAutoCompactEnabled ? b.autoCompactThreshold : undefined,
    drilldown: toDrilldown(b),
  }
}

function toDrilldown(b: Parameters<typeof toReading>[0]): Drilldown {
  const servers = new Map<string, { tokens: number; tools: string[]; onDemand: number }>()
  for (const t of b.mcpTools ?? []) {
    const server = servers.get(t.serverName) ?? { tokens: 0, tools: [], onDemand: 0 }
    server.tokens += t.tokens
    // The wire name leads with its server; the box is already under that server's line.
    if (t.isLoaded) server.tools.push(t.name.replace(/^mcp__.+?__/, ''))
    else server.onDemand++
    servers.set(t.serverName, server)
  }
  return {
    memoryFiles: (b.memoryFiles ?? []).map(m => ({ name: shortPath(m.path), tokens: m.tokens, note: m.type })),
    mcpServers: [...servers.entries()]
      .map(([name, s]) => ({ name, tokens: s.tokens, note: mcpNote(s.tools, s.onDemand) }))
      .sort((x, y) => y.tokens - x.tokens),
    agents: (b.agents ?? []).map(a => ({ name: a.agentType, tokens: a.tokens, note: a.source })),
    skills: (b.skills?.skillFrontmatter ?? []).map(s => ({
      name: s.name,
      tokens: s.tokens,
      note: s.pluginName ? `${s.source} · ${s.pluginName}` : s.source,
    })),
    skillsTokens: b.skills?.tokens,
    skillsIncluded: b.skills?.includedSkills,
    slashCommands: b.slashCommands
      ? { tokens: b.slashCommands.tokens, included: b.slashCommands.includedCommands, total: b.slashCommands.totalCommands }
      : undefined,
    model: b.model ?? 'unknown',
    autoCompactSource: b.autocompactSource ?? 'unknown',
  }
}

// Which row a list opens under, by the row's own name as /context prints it. A name the engine
// changes leaves its list without a row, where it keeps an entry of its own rather than going.
const UNDER: Record<string, string> = {
  'system prompt': 'prompt',
  'system tools': 'tools',
  'memory files': 'memory',
  'mcp tools': 'mcp',
  agents: 'agents',
  'custom agents': 'agents',
  skills: 'skills',
  'slash commands': 'slash',
  messages: 'messages',
}

// What each row holds in detail, and what it comes to. A list with nothing in it is left out.
export function lists(r: Reading, prompt: Item[] = [], tools: Item[] = [], messages: Item[] = []): List[] {
  const d = r.drilldown
  const out: List[] = []
  const add = (id: string, head: string, note: string | undefined, items: Item[]) => {
    if (items.length > 0) out.push({ id, head, note, items })
  }
  // The System prompt and System tools rows are the two the breakdown carries no list for: each
  // note is a count of what is there, so neither sets this mod's number against the engine's.
  add('prompt', 'system prompt', `${prompt.length} sections`, prompt)
  add('tools', 'system tools', `${tools.length} built-in`, tools)
  add('memory', 'memory files', tokens(held(d.memoryFiles)), d.memoryFiles)
  add('mcp', 'mcp tools', `by server · ${tokens(held(d.mcpServers))}`, d.mcpServers)
  add('agents', 'agents', tokens(held(d.agents)), d.agents)
  // What the window carries of each, and the tokens those come to: /context counts the whole set.
  add('skills', 'skills', d.skillsTokens !== undefined ? `${d.skills.length} of ${d.skillsIncluded ?? d.skills.length} · ${tokens(d.skillsTokens)}` : tokens(held(d.skills)), d.skills)
  add('messages', 'messages', `${messages.length} messages, biggest first`, messages)
  return out
}

// The figures that are no list at all: /context counts the command listing and hands over the
// count with nothing under it, and the window's own line is how it was measured. Both are read
// at a glance and have nothing to open, so neither carries a mark.
export function figures(r: Reading): { text: string; note: string }[] {
  const d = r.drilldown
  const out: { text: string; note: string }[] = []
  if (d.slashCommands && d.slashCommands.tokens > 0)
    out.push({ text: 'slash commands', note: `${d.slashCommands.included} of ${d.slashCommands.total} · ${tokens(d.slashCommands.tokens)}` })
  out.push({ text: 'window', note: r.compactsAt ? `${d.model} · compacts at ${tokens(r.compactsAt)}` : `${d.model} · auto-compaction off` })
  return out
}

const held = (items: Item[]) => items.reduce((n, i) => n + (i.tokens ?? 0), 0)

/**
 * The system prompt's sections as the System prompt row's items: the engine's own id for each,
 * the cache boundary it sits on, and the tokens off its text. The text is all `prompt.compose`
 * hands over — no count of its own — so these tokens are this mod's estimate and are marked as
 * one. They compare a section against its neighbours; they are not the engine's figures.
 */
export function promptItems(sections: readonly { id: string; text: string; scope: string }[]): Item[] {
  return sections.map(s => ({ name: s.id, tokens: Math.round(s.text.length / 4), note: s.scope, estimated: true }))
}

/**
 * The built-in tools as the System tools row's items: the name, and the tool's own words for
 * what it does. MCP tools are left out — the breakdown counts them under their own row, and
 * listing them here would put the same schemas in the box twice.
 *
 * No figure is drawn: the engine counts the System tools row whole, and what a tool costs is its
 * input schema, which nothing hands over. A number off the description would be a guess off the
 * wrong quantity, so this row carries none.
 */
export function toolItems(tools: readonly { name: string; description: string; mcp: boolean }[]): Item[] {
  return tools.filter(t => !t.mcp).map(t => ({ name: t.name, note: oneLine(t.description) }))
}

/** One message of the transcript, as `$.session.messages()` returns it. */
type Said = {
  role: 'user' | 'assistant'
  text: string
  toolUses: readonly { tool_use_id: string; tool: string; input: Record<string, unknown>; text?: string }[]
  toolResults?: readonly { tool_use_id: string; text: string }[]
}

/**
 * The conversation as the Messages row's items, biggest first. That row is the one the bar is
 * read for, and a transcript holds hundreds of messages where the box shows twelve: the twelve
 * it shows are the twelve that cost the most, which is the question the row raises.
 *
 * The tokens are estimated off the length of what each message holds — its own text, the
 * arguments its tool calls were given, and what those calls came back with — and marked as
 * estimates. The row above is the engine's own count, reconciled to the API; these are
 * proportions of one another and will not add up to it.
 */
export function messageItems(messages: readonly Said[]): Item[] {
  // A tool result can be read off either side of the transcript — the assistant's call carries it
  // and the user's message does too — so every result is met once here and counted where the call is.
  const results = new Map<string, number>()
  for (const m of messages) for (const u of m.toolUses) if (u.text !== undefined) results.set(u.tool_use_id, u.text.length)
  for (const m of messages) for (const r of m.toolResults ?? []) if (!results.has(r.tool_use_id)) results.set(r.tool_use_id, r.text.length)

  const out: Item[] = []
  for (const m of messages) {
    let chars = m.text.length
    for (const u of m.toolUses) chars += JSON.stringify(u.input ?? {}).length + (results.get(u.tool_use_id) ?? 0)
    const calls = m.toolUses.length
    out.push({
      name: m.role === 'user' ? 'you' : calls > 0 ? `assistant · ${calls} ${calls === 1 ? 'call' : 'calls'}` : 'assistant',
      tokens: Math.round(chars / 4),
      note: oneLine(m.text),
      estimated: true,
    })
  }
  return out.sort((a, b) => (b.tokens ?? 0) - (a.tokens ?? 0))
}

// A description cut to what one row can carry: its first sentence, and no more than a line of it.
function oneLine(text: string, room = 44) {
  const said = text.replace(/\s+/g, ' ').trim()
  const end = said.search(/\.(?:\s|$)/)
  const head = end > 0 ? said.slice(0, end) : said
  return head.length <= room ? head : `${head.slice(0, room - 1).trimEnd()}…`
}

// The opened box's body as blocks, in the order drawn: every row of the breakdown, each with the
// list it names opening under it, then any list the rows do not account for. `open` is the one
// list unfolded; one at a time keeps the box the rows plus a single list, whatever the band has.
export function blocks(r: Reading, open: string | null = null, prompt: Item[] = [], tools: Item[] = [], messages: Item[] = []): Block[] {
  const used = r.slices.filter(s => s.kind === 'used')
  const max = Math.max(...used.map(s => s.tokens), 1) // the meter is scaled to the largest row, so rows compare
  const all = lists(r, prompt, tools, messages)
  const rows = new Set<string>()
  const out: Block[] = [{ kind: 'head', text: 'detail' }]
  for (const slice of r.slices) {
    const id = UNDER[slice.name] // the list this row is counted for, where it is one that has detail
    const list = id !== undefined ? all.find(l => l.id === id) : undefined
    const isOpen = list !== undefined && list.id === open
    if (list) rows.add(list.id)
    out.push({ kind: 'row', slice, max, list, open: isOpen })
    if (isOpen) out.push(...items(list))
  }
  // A list no row accounts for — the agents, where the breakdown counts no row for them — keeps
  // an entry of its own, opened the same way.
  for (const list of all) {
    if (rows.has(list.id)) continue
    const isOpen = list.id === open
    out.push({ kind: 'gap' }, { kind: 'entry', list, open: isOpen })
    if (isOpen) out.push(...items(list))
  }
  const figs = figures(r)
  if (figs.length > 0) {
    out.push({ kind: 'gap' })
    for (const f of figs) out.push({ kind: 'figure', text: f.text, note: f.note })
  }
  return out
}

// A list's rows, shown with at most `MAX_ITEMS` of its items and a count of the rest.
function items(list: List): Block[] {
  const out: Block[] = list.items.slice(0, MAX_ITEMS).map(item => ({ kind: 'item', item }) as Block)
  const left = list.items.length - MAX_ITEMS
  if (left > 0) out.push({ kind: 'note', text: `+${left} more` })
  return out
}

// The cells a detail row is laid out in: `total` is what the widest row comes to, and the
// block the box centers its opened content as.
export function metrics(width: number) {
  const mark = 2 // the ▶ a row with detail under it leads with; a bare row keeps the cells in its place
  const num = 7 // tokens, right-aligned (`186.0k`)
  const pct = 6 // the share of the window, right-aligned (`19.0%`)
  const swatch = 2
  const fixed = mark + swatch + 2 + num + 1 + pct
  let name = Math.min(28, Math.max(8, Math.round(width * 0.28)))
  // Too narrow for the name it wanted: it gives way to the figures, which are what the row is for.
  if (fixed + name > width) name = Math.max(1, width - fixed)
  const bar = Math.max(0, Math.min(40, width - (fixed + name)))
  // The two cells the meter is spaced by are only spent when there is a meter to space.
  const total = mark + swatch + name + (bar > 0 ? 1 + bar : 0) + 1 + num + 1 + pct
  return { mark, swatch, name, num, pct, bar, total }
}

// The block the opened detail is laid out in: the room it has, never wider than it reads
// well at, so what the box centers is a column of even margins rather than the whole screen.
export function frameWidth(room: number) {
  return Math.max(MIN_WIDTH, Math.min(room, CONTENT_WIDTH))
}

// How much of a meter `tokens` fills against the largest row, at least one cell in use.
export function barFill(tokens: number, max: number, width: number) {
  if (width <= 0 || max <= 0 || tokens <= 0) return 0
  return Math.max(1, Math.min(width, Math.round((tokens / max) * width)))
}

// The cells an item's name may take, once its indent, its tokens, its note and the gaps are placed.
function itemRoom(width: number, num: number, item: Item) {
  const fixed = INDENT + num + 2
  const note = item.note ? item.note.length + 2 : 0
  return Math.max(6, width - fixed - note)
}

// The bar as runs of cells: each slice gets its share of `width`, a used one at least one cell.
export function cells(r: Reading, width: number) {
  const sizes = r.slices.map(s => Math.max(s.kind === 'used' ? 1 : 0, Math.round((s.tokens / r.window) * width)))
  // Rounding leaves the sum a few cells off: free space takes the difference first, then the largest slices.
  let diff = width - sizes.reduce((a, n) => a + n, 0)
  const isUsed = (i: number) => r.slices[i]!.kind === 'used'
  const order = r.slices.map((_, i) => i).sort((a, b) => Number(isUsed(a)) - Number(isUsed(b)) || sizes[b]! - sizes[a]!)
  for (const i of order) {
    if (diff === 0) break
    const size = Math.max(isUsed(i) ? 1 : 0, sizes[i]! + diff)
    diff -= size - sizes[i]!
    sizes[i] = size
  }
  return r.slices.map((s, i) => ({ color: s.color, kind: s.kind, text: GLYPH[s.kind].repeat(sizes[i]!) })).filter(c => c.text !== '')
}

// The legend, packed into lines no wider than `width`. Shown while the box is folded.
export function legend(r: Reading, width: number) {
  const lines: Slice[][] = [[]]
  let used = 0
  for (const s of r.slices) {
    const size = 2 + s.name.length + 1 + tokens(s.tokens).length + (s.kind === 'used' ? 1 + share(s.tokens, r.window).length : 0)
    const line = lines.at(-1)!
    if (line.length > 0 && used + SPLIT.length + size > width) {
      lines.push([s])
      used = size
    } else {
      used += (line.length > 0 ? SPLIT.length : 0) + size
      line.push(s)
    }
  }
  return lines.filter(l => l.length > 0)
}

// How full the window is, for the badge: red where a compaction is close.
export function levelColor(r: Reading) {
  const level = r.compactsAt ? r.total / r.compactsAt : r.total / r.window
  return level >= 0.9 ? 'red' : level >= 0.7 ? 'yellow' : 'green'
}

export function tokens(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`
  return String(n)
}

export function share(n: number, window: number) {
  const p = (n / window) * 100
  if (p > 0 && p < 0.1) return '<0.1%'
  return `${p >= 10 ? Math.round(p) : +p.toFixed(1)}%`
}

// A path as it is read at a glance: `~` for the home it sits in.
function shortPath(path: string) {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, '~')
}

// An MCP server's line: how many tools it brings, named where a few say enough.
function mcpNote(tools: string[], onDemand: number) {
  const parts: string[] = []
  if (tools.length > 0) parts.push(tools.length <= 3 ? tools.join(', ') : `${tools.slice(0, 3).join(', ')}, +${tools.length - 3}`)
  if (onDemand > 0) parts.push(`${onDemand} on demand`)
  return parts.join(' · ') || 'no schemas loaded'
}

function cut(s: string, n: number) {
  return s.length <= n ? s : `${s.slice(0, Math.max(1, n - 1))}…`
}

function pad(s: string, n: number) {
  const text = cut(s, n)
  return text + ' '.repeat(Math.max(0, n - text.length))
}

function lpad(s: string, n: number) {
  const text = cut(s, n)
  return ' '.repeat(Math.max(0, n - text.length)) + text
}
