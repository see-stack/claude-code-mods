# See Stack Mods for Claude Code ⚡

Curated developer mods for [Claude Code](https://code.claude.com) by [See Stack](https://youtube.com/@SeeStack).

Upgrade your terminal with live context analytics, personal voice narration, and transport controls.

---

## Quick Install (One Command)

Add the **See Stack Marketplace** to your Claude Code installation:

```bash
claude plugin marketplace add seestack-dev/claude-code-mods
```

Then install any of the mods:

```bash
# 1. Interactive 2-Column Context Bar with Nested Dropdowns
claude plugin install context-bar@seestack-mods

# 2. Text-to-Speech Voice Player with Transport Scrubber & Queue
claude plugin install read-aloud@seestack-mods
```

To update mods anytime:
```bash
claude plugin update context-bar@seestack-mods
claude plugin update read-aloud@seestack-mods
```

---

## Featured Mods

### 1. `context-bar`
A live stacked context window audit bar placed directly above your prompt.

* **2-Column Layout**: Cuts vertical height in half to preserve your screen space.
* **Inline Accordion**: Click `▶` directly on `memory files` or `skills` to expand their itemized breakdown without repeating headers.
* **Compaction Headroom**: Real-time tracking of safety headroom before auto-compaction triggers.
* **Slash Command**: Type `/context-bar` to toggle visibility.

```text
┌─ ◆ context ───────────────────────────── 237k of 1M  [24%] ▲ ─┐  [-]
│ █■■■██████████████─────────────────────────────────────────────│
│ detail                                                         │
│ ■ system prompt   █·····················    2k    0.2%         │
│ ■ system tools    ████████████████████     19k    1.9%         │
│ ▶ ■ memory files  █·····················   3.1k   0.3%         │
│ ▶ ■ skills        █·····················   2.6k   0.3%         │
│ ■ messages        ██████████████████████  211k     21%         │
│ ─ free space      ──────────────────────  760k     76%         │
│ ░ compact buffer  ░░····················    3k    0.3%         │
│                                                                │
│ slash commands  42 of 42 · 1.4k                                │
│ window  claude-sonnet-5-5 · auto-compaction off                │
│ [ Minimize ]                                                   │
└────────────────────────────────────────────────────────────────┘
```

---

### 2. `read-aloud`
Brings high-quality Text-to-Speech (macOS Personal Voice / AVSpeechSynthesizer) into Claude Code with a full transport deck.

* **Media Deck**: Play/Pause, sentence scrubbing, reply queuing, and speed multiplier.
* **Terracotta Progress Bar**: Visual scrub bar matching your context meter.
* **Speech Queue**: Seamlessly queues replies without cutting off sentences mid-speech.
* **Slash Command**: Type `/read-aloud` or click the `read` button above your prompt.

```text
♪ Ember   ⏮ ◀ ‹ [██████████]── › ▶ ⏭   1×
```

| Key | Action |
|:---:|:---|
| `p` | Pause / Resume speech |
| `s` | Stop audio |
| `◀` / `▶` | Step one sentence back / forward |
| `⏮` / `⏭` | Step across queued replies |
| `r` | Cycle speed multiplier (1×, 1.25×, 1.5×, 2×) |

---

## Developing & Testing Mods

To load mods locally in development mode:

```bash
claude --plugin-dir ./mods/context-bar
claude --plugin-dir ./mods/read-aloud
```

Reload changes instantly without restarting your session:
```text
/reload-plugins
```

---

## Community & YouTube

* 📺 **YouTube**: [See Stack](https://youtube.com/@SeeStack)
* 💬 Built for developers optimizing Claude Code workflows.
* 📄 Licensed under the [MIT License](LICENSE).
