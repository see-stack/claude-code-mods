/** Speech this mod started, and everything transport needs to know about it. */
export type Mine = {
  voice: string
  /** The whole text that was launched, in characters. */
  chars: number
  /** The multiplier the app was launched at. */
  rate: number
  /** Where the app says it is, in UTF-16 units of that text. */
  offset: number
}

/** What is playing right now, as the band above the prompt reads it. */
export type Speech = {
  isSpeaking: boolean
  isPaused: boolean
  /** Milliseconds since the epoch; 0 when nothing is playing. */
  startedAt: number
  /** Absent for speech this mod did not start: the Stop hook's, read off pgrep.
   *  There is no text or position behind it, so the band offers no transport. */
  mine?: Mine
  /** The last turn's answer, already stripped and capped: what the band offers to
   *  read while nothing is playing. Absent until a turn has answered, and absent
   *  while a reading has the reply in its list instead. */
  answer?: string
  /** The reading this mod is in the middle of. Kept after its last reply has been
   *  read, so `prev` still has somewhere to walk back to. */
  run?: Run
}

/** A reading: the replies it holds, oldest first, and where it has got to.
 *  A reply that arrives while it is flowing takes a place at the end. */
export type Run = {
  items: string[]
  /** Which reply is playing, or - with nothing playing - which one it stopped on.
   *  Everything after the cursor is still to be read, in order. */
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'read-aloud': { speech: Speech | null }
  }
}
