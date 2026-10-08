export type Slice = { name: string; tokens: number; color: string; kind: 'used' | 'free' | 'buffer' }

/** One line under a row: a memory file, an MCP server, an agent, a skill or a tool. */
export type Item = {
  name: string
  // Left out where there is no figure to draw: the engine counts the System tools row whole and
  // hands over no per-tool count, so those rows carry a name and their own words and nothing else.
  tokens?: number
  note?: string
  // The tokens are this mod's estimate off a text's length, not a count the engine made: drawn
  // with a `~` so they are never read as one of the engine's figures.
  estimated?: boolean
}

/** What sits under the rows: the lists `/context` carries beside them. */
export type Drilldown = {
  memoryFiles: Item[] // name: the path, note: where it was loaded from
  mcpServers: Item[] // name: the server, note: the tools it brings
  agents: Item[]
  skills: Item[]
  skillsTokens?: number // every listed skill together
  skillsIncluded?: number // how many skills the window carries, listed or not
  slashCommands?: { tokens: number; included: number; total: number }
  model: string
  autoCompactSource: string // how the window measured against was settled
}

export type Reading = {
  slices: Slice[]
  total: number // tokens in use
  window: number // the window measured against
  percent: number
  compactsAt?: number // where auto-compaction runs, when it is on
  drilldown: Drilldown
}

/**
 * What a row holds in detail: the memory files, MCP servers, agents, skills or commands that
 * come to the tokens the row is counted for. It opens under the row that names it.
 */
export type List = {
  id: string // what a press on the row is remembered by
  head: string // the row's own name, where the list has no row to open under
  note?: string // what it holds and what it costs, read while it is shut
  items: Item[]
}

/** One block of the opened box's body, in the order drawn. The bar is drawn above them. */
export type Block =
  | { kind: 'gap' }
  | { kind: 'head'; text: string; note?: string }
  // A row, its meter scaled to the largest of them, and the list that opens under it when it has one.
  | { kind: 'row'; slice: Slice; max: number; list?: List; open: boolean }
  | { kind: 'entry'; list: List; open: boolean } // a list with no row of its own to open under
  | { kind: 'figure'; text: string; note: string } // a count that is all there is: nothing opens under it
  | { kind: 'item'; item: Item }
  | { kind: 'note'; text: string }

declare module 'claude-code' {
  interface PluginState {
    // `openRow` names the one list that is open: opening another shuts the first.
    // `promptSections` is the system prompt's own sections and `toolList` the built-in tools the
    // model can call: the two rows the breakdown carries no list of their own for.
    'context-bar': {
      reading: Reading | null
      isHidden: boolean
      isOpen: boolean
      openRow: string | null
      promptSections: Item[]
      toolList: Item[]
      messageList: Item[]
    }
  }
}
