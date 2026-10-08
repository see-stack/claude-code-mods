"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = void 0;
exports.readOptions = readOptions;
exports.fill = fill;
exports.reading = reading;
exports.enqueue = enqueue;
exports.parseProgress = parseProgress;
exports.listsVoice = listsVoice;
exports.lastReply = lastReply;
exports.sentenceStart = sentenceStart;
exports.looksNorwegian = looksNorwegian;
exports.speakable = speakable;
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
// A reading run begins only when it is asked for, and lasts as long as it has
// anything left to read: a reply that arrives while it is talking queues behind
// the one playing rather than cutting in, and the run ends when the queue runs
// dry. Nothing here reaches for a turn's reply on its own - the Stop hook in
// settings.json is muted (CLAUDE_SPEAK_OFF) so that this mod is the only voice,
// which is what makes one queue possible in the first place.
//
// /read-aloud        speak the last reply, or queue it inside a run
// /read-aloud stop   silence it, and drop the queue with it
// /read-aloud skip   drop the reply playing, start the next one waiting
// /read-aloud clear  empty the queue, leaving what is playing alone
// /read-aloud pause|resume|next|prev|faster|slower
//
// The band above the prompt draws one row: the transport while something is
// playing, an offer to read while a reply is waiting, and nothing at all when
// there is neither. The transport leads with a progress bar, filled and empty in
// the same two glyphs the context band above it draws with.
var claude_code_1 = require("claude-code");
/** The manifest's options as the engine hands them over: whatever is set over the
 *  defaults, with anything that makes no sense falling back rather than refusing
 *  to load - a bad rate list should cost the rate button, not the whole mod. */
function readOptions(options) {
    var text = function (value, fallback) {
        return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
    };
    var rates = String(text(options.rates, DEFAULTS.rates))
        .split(',')
        .map(function (part) { return Number(part.trim()); })
        .filter(function (rate) { return Number.isFinite(rate) && rate > 0; });
    var asked = Number(options.maxChars);
    return {
        voice: text(options.voice, DEFAULTS.voice),
        norwegianVoice: text(options.norwegianVoice, DEFAULTS.norwegianVoice),
        rates: rates.length > 0 ? rates : [1],
        maxChars: Number.isFinite(asked) ? Math.min(20000, Math.max(200, Math.round(asked))) : DEFAULTS.maxChars,
        speaker: text(options.speaker, DEFAULTS.speaker),
    };
}
// What the manifest's userConfig offers, with the value used when nothing is set.
// Every one of these can be changed in /config, which stores what is chosen in
// settings.json under pluginConfigs.
var DEFAULTS = {
    voice: 'Ember',
    norwegianVoice: 'Nora',
    rates: '1,1.25,1.5,2,0.75',
    maxChars: 6000,
    speaker: '~/Control-Panel/tools/ember-speak/EmberSpeak.app/Contents/MacOS/EmberSpeak',
};
// Both under the home directory read at session.start: a hooks module has no
// environment of its own, and this keeps its runtime files where the hook keeps
// its own (~/Control-Panel/local-config).
var SCRATCH = '/Control-Panel/local-config/hooks/read-aloud/speak.txt'; // the text being read
var PROGRESS = '/Control-Panel/local-config/hooks/read-aloud/speak.state'; // where the app is
// $.audio.speak speaks the first 4096 characters and says so; cut it here instead,
// so the truncation is ours and lands at a word.
var MAX_CHARS_FALLBACK = 4096;
var POLL_MS = 1000;
var IDLE_EVERY = 5; // idle, look every fifth tick rather than every tick
var GRACE_MS = 3000; // a launch is not up this soon: never read that as "done"
var KILL_SETTLE_MS = 150; // a killed speaker needs a moment to let go of the audio
var MIN_WIDTH = 60; // narrower than this, the band gives up its transport buttons
var QUEUE_MAX = 5; // replies waiting behind the one playing; past this the oldest falls off
var BAR = 12; // cells in the progress bar
// The context band's own two: the accent it marks this conversation with, and the
// grey it leaves empty room in. Filled and empty cells are its glyphs too.
var ACCENT = '#d97757';
var FREE = '#808080';
// What the person has set, read again whenever the module loads.
var config = readOptions({});
// Held by the host, so the band survives a hot reload of this file.
var speech = (0, claude_code_1.atom)({ plugin: 'read-aloud', key: 'speech' }, null);
var home = '';
var ticks = 0;
var register = function (on, options) {
    config = readOptions(options);
    on('session.start', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, next(e)
                    // A name Claude Code already has is refused: start anyway.
                ];
                case 1:
                    r = _a.sent();
                    // A name Claude Code already has is refused: start anyway.
                    return [4 /*yield*/, $.command
                            .register({ name: 'read-aloud', description: 'Speak the last reply aloud', argumentHint: '[stop|skip|clear|pause|next|prev|faster|slower]' })
                            .catch(function () { })];
                case 2:
                    // A name Claude Code already has is refused: start anyway.
                    _a.sent();
                    return [4 /*yield*/, homeDir($)];
                case 3:
                    home = _a.sent();
                    $.clock.every(POLL_MS, function () { return void poll($); });
                    return [2 /*return*/, r];
            }
        });
    }); });
    // The reply, kept for the band to offer and for the command to read out. A
    // subagent's turn is not this conversation's, and a turn that answered nothing
    // leaves whatever was waiting before it still waiting.
    on('turn.complete', function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var r, answer, s;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, next(e)];
                case 1:
                    r = _b.sent();
                    if (e.agentId)
                        return [2 /*return*/, r];
                    answer = e.reason === 'answer' ? speakable(e.answer, config.maxChars) : '';
                    if (answer === '')
                        return [2 /*return*/, r];
                    return [4 /*yield*/, (0, claude_code_1.read)($, speech)
                        // Inside a run the reply takes its place behind what is playing, and stops
                        // being what the band offers: it is not waiting to be asked for any more, it
                        // is going to be read.
                    ];
                case 2:
                    s = _b.sent();
                    if (!reading(s)) return [3 /*break*/, 4];
                    return [4 /*yield*/, merge($, { queue: enqueue((_a = s === null || s === void 0 ? void 0 : s.queue) !== null && _a !== void 0 ? _a : [], answer), answer: undefined })];
                case 3:
                    _b.sent();
                    return [2 /*return*/, r];
                case 4: return [4 /*yield*/, merge($, { answer: answer })];
                case 5:
                    _b.sent();
                    return [2 /*return*/, r];
            }
        });
    }); });
    on('command.run', { command: 'read-aloud' }, function ($, e) { return __awaiter(void 0, void 0, void 0, function () {
        var _a;
        var _b, _c, _d, _e, _f, _g, _h, _j, _k;
        return __generator(this, function (_l) {
            switch (_l.label) {
                case 0:
                    _a = e.args.trim().toLowerCase();
                    switch (_a) {
                        case 'stop': return [3 /*break*/, 1];
                        case 'pause': return [3 /*break*/, 3];
                        case 'resume': return [3 /*break*/, 5];
                        case 'skip': return [3 /*break*/, 7];
                        case 'clear': return [3 /*break*/, 9];
                        case 'next': return [3 /*break*/, 11];
                        case 'prev': return [3 /*break*/, 13];
                        case 'faster': return [3 /*break*/, 15];
                        case 'slower': return [3 /*break*/, 17];
                    }
                    return [3 /*break*/, 19];
                case 1: return [4 /*yield*/, stop($)];
                case 2:
                    _l.sent();
                    return [2 /*return*/, { text: 'Speech stopped.' }];
                case 3:
                    _b = {};
                    return [4 /*yield*/, setPaused($, true)];
                case 4: return [2 /*return*/, (_b.text = (_l.sent()) ? 'Paused.' : 'Nothing is playing.', _b)];
                case 5:
                    _c = {};
                    return [4 /*yield*/, setPaused($, false)];
                case 6: return [2 /*return*/, (_c.text = (_l.sent()) ? 'Resumed.' : 'Nothing is paused.', _c)];
                case 7:
                    _d = {};
                    return [4 /*yield*/, skip($)];
                case 8: return [2 /*return*/, (_d.text = _l.sent(), _d)];
                case 9:
                    _e = {};
                    return [4 /*yield*/, clearQueue($)];
                case 10: return [2 /*return*/, (_e.text = _l.sent(), _e)];
                case 11:
                    _f = {};
                    return [4 /*yield*/, seek($, 1)];
                case 12: return [2 /*return*/, (_f.text = _l.sent(), _f)];
                case 13:
                    _g = {};
                    return [4 /*yield*/, seek($, -1)];
                case 14: return [2 /*return*/, (_g.text = _l.sent(), _g)];
                case 15:
                    _h = {};
                    return [4 /*yield*/, cycleRate($, 1)];
                case 16: return [2 /*return*/, (_h.text = _l.sent(), _h)];
                case 17:
                    _j = {};
                    return [4 /*yield*/, cycleRate($, -1)];
                case 18: return [2 /*return*/, (_j.text = _l.sent(), _j)];
                case 19:
                    _k = {};
                    return [4 /*yield*/, readLast($)];
                case 20: return [2 /*return*/, (_k.text = _l.sent(), _k)];
            }
        });
    }); });
    on('ui.render', { component: 'AbovePrompt' }, function ($, e, next) { return __awaiter(void 0, void 0, void 0, function () {
        var rest, s, playing, waiting, _a, Box, Text, Button, wide, mine, queued, filled;
        var _b, _c, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0: return [4 /*yield*/, next(e)]; // what other mods and Claude Code draw here stays
                case 1:
                    rest = _f.sent() // what other mods and Claude Code draw here stays
                    ;
                    return [4 /*yield*/, (0, claude_code_1.read)($, speech)];
                case 2:
                    s = _f.sent();
                    playing = (s === null || s === void 0 ? void 0 : s.isSpeaking) === true;
                    waiting = (_b = s === null || s === void 0 ? void 0 : s.answer) !== null && _b !== void 0 ? _b : '';
                    if (e.props.hasSurvey || (!playing && waiting === ''))
                        return [2 /*return*/, rest];
                    _a = $.ui.resolve(e), Box = _a.Box, Text = _a.Text, Button = _a.Button;
                    if (!playing) {
                        return [2 /*return*/, (<Box flexDirection="column">
          {rest}
          <Box flexDirection="row" paddingX={1}>
            <Text color={ACCENT}>{'♪ '}</Text>
            <Text dimColor>{"".concat(looksNorwegian(waiting) ? config.norwegianVoice : config.voice, " \u00B7 ready")}</Text>
            <Text>{'  '}</Text>
            <Button key="read" plain label="read" onPress={function () { return readLast($); }}/>
          </Box>
        </Box>)];
                    }
                    wide = ((_c = e.props.bodyColumns) !== null && _c !== void 0 ? _c : 0) >= MIN_WIDTH;
                    mine = s.mine;
                    queued = (_e = (_d = s.queue) === null || _d === void 0 ? void 0 : _d.length) !== null && _e !== void 0 ? _e : 0;
                    filled = mine ? fill(share(mine), BAR) : 0;
                    // Drawn after `rest` rather than before it, so this row is the band's last
                    // one whichever way the engine nests the two: outermost, it follows what the
                    // other mods drew; innermost, this whole box is already placed beneath them.
                    return [2 /*return*/, (<Box flexDirection="column">
        {rest}
        <Box flexDirection="row" paddingX={1}>
          <Text color={ACCENT}>{'♪ '}</Text>
          {/* The bar is the position, so the row repeats neither a percentage nor
                                the rate its own button already carries. Speech with no text behind
                                it - the hook's - has neither, and says so instead. */}
          <Text dimColor>{mine ? mine.voice : s.isPaused ? 'speaking · paused' : 'speaking'}</Text>
          {mine && <Text>{'  '}</Text>}
          {mine && <Text color={ACCENT}>{'█'.repeat(filled)}</Text>}
          {mine && <Text color={FREE}>{'─'.repeat(BAR - filled)}</Text>}
          {queued > 0 && <Text dimColor>{"  \u00B7 ".concat(queued, " in queue")}</Text>}
          <Text>{'  '}</Text>
          {/* Pause is the one control that always fits, and the only one that
                                reaches the hook's speech, which has no text behind it to seek in. */}
          <Button key="pause" plain hotkey="p" label={s.isPaused ? 'resume' : 'pause'} onPress={function () { return setPaused($, !s.isPaused); }}/>
          {wide && mine && <Text>{' '}</Text>}
          {wide && mine && <Button key="back" plain hotkey="b" label="back" onPress={function () { return seek($, -1); }}/>}
          {wide && mine && <Text>{' '}</Text>}
          {wide && mine && <Button key="next" plain hotkey="n" label="next" onPress={function () { return seek($, 1); }}/>}
          {wide && mine && <Text>{' '}</Text>}
          {wide && mine && <Button key="rate" plain hotkey="r" label={"".concat(mine.rate, "\u00D7")} onPress={function () { return cycleRate($, 1); }}/>}
          {/* Drawn only while something is waiting: it is the only control that
                                means nothing when the queue is empty. */}
          {wide && queued > 0 && <Text>{' '}</Text>}
          {wide && queued > 0 && <Button key="skip" plain label="skip" onPress={function () { return skip($); }}/>}
          <Text>{'  '}</Text>
          <Button key="stop" plain hotkey="s" label="stop" onPress={function () { return stop($); }}/>
        </Box>
      </Box>)];
            }
        });
    }); });
};
exports.register = register;
/** How far into the text the app says it is, as a percentage. */
function share(mine) {
    return mine.chars > 0 ? (mine.offset / mine.chars) * 100 : 0;
}
/** How many cells of a `width`-wide bar a percentage fills, clamped: the app can
 *  report an offset at or past the end of the text it was handed. */
function fill(percent, width) {
    return Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
}
// One place the state changes, so the band is asked to draw again from one place.
function merge($, patch) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.update)($, speech, function (prev) { return (__assign(__assign({ isSpeaking: false, isPaused: false, startedAt: 0 }, prev), patch)); }).catch(function () { })];
                case 1:
                    _a.sent();
                    $.ui.invalidate('ui.render');
                    return [2 /*return*/];
            }
        });
    });
}
// ---- the run ---------------------------------------------------------------
/** Whether a reading run is on: something is playing, or something is waiting to.
 *  A reply arriving inside one is read after the one playing; outside one nothing
 *  is read until it is asked for, which is what keeps this mod from speaking over
 *  a session the person is reading themselves. */
function reading(s) {
    var _a, _b;
    return (s === null || s === void 0 ? void 0 : s.isSpeaking) === true || ((_b = (_a = s === null || s === void 0 ? void 0 : s.queue) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > 0;
}
/** The queue after one more reply: oldest first, and past `max` it is the oldest
 *  that falls off, never the reply that just arrived. */
function enqueue(queue, text, max) {
    if (max === void 0) { max = QUEUE_MAX; }
    return __spreadArray(__spreadArray([], queue, true), [text], false).slice(-max);
}
/** Drops the reply playing and starts the one behind it - what the `skip` button
 *  and `/read-aloud skip` do. With nothing waiting there is nowhere to skip to. */
function skip($) {
    return __awaiter(this, void 0, void 0, function () {
        var s, queue, left;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, speech)];
                case 1:
                    s = _b.sent();
                    queue = (_a = s === null || s === void 0 ? void 0 : s.queue) !== null && _a !== void 0 ? _a : [];
                    if (queue.length === 0)
                        return [2 /*return*/, 'Nothing is queued.'];
                    left = queue.length - 1;
                    return [4 /*yield*/, playNext($, s, queue)];
                case 2:
                    if (!(_b.sent()))
                        return [2 /*return*/, 'Could not start the next reply.'];
                    return [2 /*return*/, left === 0 ? 'Skipped to the last reply in the queue.' : "Skipped. ".concat(left, " still waiting.")];
            }
        });
    });
}
/** Empties the queue and leaves what is playing alone: the run then ends with the
 *  reply that is talking, instead of going on to the ones behind it. */
function clearQueue($) {
    return __awaiter(this, void 0, void 0, function () {
        var n;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, speech)];
                case 1:
                    n = (_c = (_b = (_a = (_d.sent())) === null || _a === void 0 ? void 0 : _a.queue) === null || _b === void 0 ? void 0 : _b.length) !== null && _c !== void 0 ? _c : 0;
                    if (n === 0)
                        return [2 /*return*/, 'Nothing is queued.'];
                    return [4 /*yield*/, merge($, { queue: [] })];
                case 2:
                    _d.sent();
                    return [2 /*return*/, "Cleared ".concat(n, " ").concat(n === 1 ? 'reply' : 'replies', " from the queue.")];
            }
        });
    });
}
// Starts the reply at the head of the queue, at the rate the run is already at -
// a rate chosen mid-reply is a choice about the reading, not about that reply.
//
// When the app cannot be reached the queue is dropped rather than left standing:
// a queue with nothing playing is a run that never ends, and every reply after it
// would be filed behind a voice that is not coming.
function playNext($, s, queue) {
    return __awaiter(this, void 0, void 0, function () {
        var text, rest, voice;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    text = queue[0], rest = queue.slice(1);
                    if (text === undefined || text === '')
                        return [2 /*return*/, false];
                    return [4 /*yield*/, merge($, { queue: rest, isSpeaking: false, isPaused: false, startedAt: 0, mine: undefined })];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, voiceFor($, text)];
                case 2:
                    voice = _c.sent();
                    return [4 /*yield*/, start($, text, voice, (_b = (_a = s === null || s === void 0 ? void 0 : s.mine) === null || _a === void 0 ? void 0 : _a.rate) !== null && _b !== void 0 ? _b : 1, 0)];
                case 3:
                    if (_c.sent())
                        return [2 /*return*/, true];
                    return [4 /*yield*/, merge($, { queue: [], isSpeaking: false, isPaused: false, startedAt: 0, mine: undefined })];
                case 4:
                    _c.sent();
                    $.ui.log('read-aloud: could not start the next queued reply');
                    return [2 /*return*/, false];
            }
        });
    });
}
function homeDir($) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, exitCode, stdout, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, $.process.run(['/usr/bin/printenv', 'HOME'], { timeoutMs: 5000 })];
                case 1:
                    _a = _c.sent(), exitCode = _a.exitCode, stdout = _a.stdout;
                    return [2 /*return*/, exitCode === 0 ? stdout.trim() : ''];
                case 2:
                    _b = _c.sent();
                    return [2 /*return*/, ''];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function path(under) {
    return home + under;
}
// A configured path, with ~ standing for the home read at session.start.
function expand(configured) {
    return configured.startsWith('~/') ? home + configured.slice(1) : configured;
}
// ---- reading it ------------------------------------------------------------
// The reply waiting to be read: what the last turn answered, or - when the session
// was resumed or this mod reloaded and holds none - the last reply in the
// conversation, which is what it would have been.
function waiting($) {
    return __awaiter(this, void 0, void 0, function () {
        var s, _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, speech)];
                case 1:
                    s = _c.sent();
                    if (s === null || s === void 0 ? void 0 : s.answer)
                        return [2 /*return*/, s.answer];
                    _a = speakable;
                    _b = lastReply;
                    return [4 /*yield*/, $.session.messages().catch(function () { return []; })];
                case 2: return [2 /*return*/, _a.apply(void 0, [_b.apply(void 0, [_c.sent()]), config.maxChars])];
            }
        });
    });
}
function readLast($) {
    return __awaiter(this, void 0, void 0, function () {
        var text, s, _a, queue, voice;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, waiting($)];
                case 1:
                    text = _d.sent();
                    if (text === '')
                        return [2 /*return*/, 'Nothing to read: nothing has been answered in this conversation yet.'];
                    return [4 /*yield*/, (0, claude_code_1.read)($, speech)
                        // Asked for inside a run, the reply waits its turn rather than cutting in. The
                        // one already talking - or already waiting - is not queued a second time.
                    ];
                case 2:
                    s = _d.sent();
                    if (!reading(s)) return [3 /*break*/, 5];
                    _a = text;
                    return [4 /*yield*/, speakingText($)];
                case 3:
                    if (_a === (_d.sent()) || ((_b = s === null || s === void 0 ? void 0 : s.queue) !== null && _b !== void 0 ? _b : []).includes(text))
                        return [2 /*return*/, 'Already reading that one.'];
                    queue = enqueue((_c = s === null || s === void 0 ? void 0 : s.queue) !== null && _c !== void 0 ? _c : [], text);
                    return [4 /*yield*/, merge($, { queue: queue, answer: undefined })];
                case 4:
                    _d.sent();
                    return [2 /*return*/, "Queued. ".concat(queue.length, " waiting.")];
                case 5: return [4 /*yield*/, voiceFor($, text)];
                case 6:
                    voice = _d.sent();
                    return [4 /*yield*/, start($, text, voice, 1, 0)];
                case 7:
                    if (_d.sent())
                        return [2 /*return*/, "Speaking ".concat(text.length, " characters with ").concat(voice, ".")];
                    return [4 /*yield*/, fallback($, text, voice)];
                case 8: return [2 /*return*/, _d.sent()];
            }
        });
    });
}
// ---- transport ------------------------------------------------------------
// Pause and resume of the app's own voice, which keeps the synthesizer's place:
// the process is not frozen, so it stops at a word and picks up from there. It
// reaches whatever EmberSpeak is speaking, the hook's replies included - usefully
// so, since the hook reads every turn and this is the only way to stop it talking.
function setPaused($, paused) {
    return __awaiter(this, void 0, void 0, function () {
        var s, signal, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, speech)];
                case 1:
                    s = _b.sent();
                    if (!(s === null || s === void 0 ? void 0 : s.isSpeaking))
                        return [2 /*return*/, false];
                    signal = paused ? '-USR1' : '-USR2';
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, $.process.run(['/usr/bin/pkill', signal, '-x', 'EmberSpeak'], { timeoutMs: 5000 })];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 5: return [4 /*yield*/, merge($, { isPaused: paused })];
                case 6:
                    _b.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
// Speed and position cannot be changed in a running app, so the reply is read
// again from where it had got to, at the new rate. The progress file is what
// makes that exact: the app reports the offset every word.
function cycleRate($, direction) {
    return __awaiter(this, void 0, void 0, function () {
        var s, mine, at, next, text;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, speech)];
                case 1:
                    s = _a.sent();
                    mine = s === null || s === void 0 ? void 0 : s.mine;
                    if (!mine)
                        return [2 /*return*/, 'Nothing is playing.'];
                    at = config.rates.indexOf(mine.rate);
                    next = config.rates[(at + direction + config.rates.length) % config.rates.length];
                    return [4 /*yield*/, speakingText($)];
                case 2:
                    text = _a.sent();
                    return [4 /*yield*/, start($, text, mine.voice, next, mine.offset)];
                case 3:
                    if (!(_a.sent()))
                        return [2 /*return*/, 'Could not reach EmberSpeak.'];
                    return [2 /*return*/, "Reading again at ".concat(next, "\u00D7.")];
            }
        });
    });
}
function seek($, direction) {
    return __awaiter(this, void 0, void 0, function () {
        var s, mine, text, offset, queue, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, speech)];
                case 1:
                    s = _c.sent();
                    mine = s === null || s === void 0 ? void 0 : s.mine;
                    if (!mine)
                        return [2 /*return*/, 'Nothing is playing.'];
                    return [4 /*yield*/, speakingText($)];
                case 2:
                    text = _c.sent();
                    offset = sentenceStart(text, mine.offset, direction);
                    if (!(offset >= text.length)) return [3 /*break*/, 6];
                    queue = (_b = s === null || s === void 0 ? void 0 : s.queue) !== null && _b !== void 0 ? _b : [];
                    _a = queue.length > 0;
                    if (!_a) return [3 /*break*/, 4];
                    return [4 /*yield*/, playNext($, s, queue)];
                case 3:
                    _a = (_c.sent());
                    _c.label = 4;
                case 4:
                    if (_a)
                        return [2 /*return*/, 'Skipped to the next reply.'];
                    return [4 /*yield*/, stop($)];
                case 5:
                    _c.sent();
                    return [2 /*return*/, 'End of the reply.'];
                case 6: return [4 /*yield*/, start($, text, mine.voice, mine.rate, offset)];
                case 7:
                    _c.sent();
                    return [2 /*return*/, direction === 1 ? 'Skipped a sentence forward.' : 'Skipped a sentence back.'];
            }
        });
    });
}
// The text being read, from the file the app is reading it out of - so a seek or
// a rate change hands back exactly what is playing, not a fresh reading of the
// conversation.
function speakingText($) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!home)
                        return [2 /*return*/, ''];
                    return [4 /*yield*/, $.fs.read(path(SCRATCH)).catch(function () { return ''; })];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
// Stopping ends the run, so the queue goes with it: replies left waiting behind a
// voice that was silenced are replies nobody asked to hear any more.
function stop($) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, kill($)];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, merge($, { isSpeaking: false, isPaused: false, startedAt: 0, mine: undefined, queue: [] })];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// Kills by name, which is the only handle there is: neither $.process.run nor
// $.process.spawn reports a pid. It stops the hook's speech too, on purpose - the
// two of them reading at once is the thing to avoid.
function kill($) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, $.process.run(['/usr/bin/pkill', '-x', 'EmberSpeak'], { timeoutMs: 5000 })];
                case 1:
                    _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    _a = _b.sent();
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ---- the app ---------------------------------------------------------------
// Writes `text` and reads it from the start, replacing anything already playing.
function start($, text, voice, rate, offset) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!home || text === '')
                        return [2 /*return*/, false];
                    return [4 /*yield*/, kill($)];
                case 1:
                    _b.sent();
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, $.fs.write(path(SCRATCH), text)];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 5: 
                // A killed speaker takes a moment to let go of the audio device, and the one
                // launched into that moment is the one that comes out silent.
                return [4 /*yield*/, $.clock.sleep(KILL_SETTLE_MS).catch(function () { })];
                case 6:
                    // A killed speaker takes a moment to let go of the audio device, and the one
                    // launched into that moment is the one that comes out silent.
                    _b.sent();
                    return [4 /*yield*/, launch($, voice, rate, offset, text.length)];
                case 7: return [2 /*return*/, _b.sent()];
            }
        });
    });
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
function launch($, voice, rate, offset, chars) {
    return __awaiter(this, void 0, void 0, function () {
        var speaker, scratch, progress, cmd, exitCode, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    speaker = expand(config.speaker);
                    scratch = path(SCRATCH);
                    progress = path(PROGRESS);
                    cmd = [
                        "if [ -x ".concat(q(speaker), " ]; then"),
                        "nohup ".concat(q(speaker), " -v ").concat(q(voice), " -r ").concat(rate, " -s ").concat(offset, " -p ").concat(q(progress), " -f ").concat(q(scratch)),
                        "</dev/null >/dev/null 2>&1 & else exit 3; fi",
                    ].join(' ');
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, $.process.run(['/bin/sh', '-c', cmd], { timeoutMs: 10000 })];
                case 2:
                    exitCode = (_b.sent()).exitCode;
                    if (exitCode !== 0)
                        return [2 /*return*/, false];
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 4: return [4 /*yield*/, merge($, {
                        isSpeaking: true,
                        isPaused: false,
                        startedAt: Date.now(),
                        mine: { voice: voice, chars: chars, rate: rate, offset: offset },
                    })];
                case 5:
                    _b.sent();
                    return [2 /*return*/, true];
            }
        });
    });
}
// The platform's own synthesizer, for when EmberSpeak is not there. Not awaited: it
// resolves when the utterance ends, which can be minutes, and nothing here waits on
// that. Ember is a Personal Voice that `say` cannot speak, so an English reply is
// left to the system default voice rather than naming one macOS would substitute.
// It has no transport, so it is not marked as this mod's own.
function fallback($, text, voice) {
    return __awaiter(this, void 0, void 0, function () {
        var spoken, spokenWith;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    spoken = speakable(text, MAX_CHARS_FALLBACK);
                    void $.audio
                        .speak(spoken, voice === config.voice ? {} : { voice: voice })
                        .catch(function (err) { return $.ui.log("read-aloud: could not speak: ".concat(String(err))); });
                    return [4 /*yield*/, merge($, { isSpeaking: true, isPaused: false, startedAt: Date.now(), mine: undefined })];
                case 1:
                    _a.sent();
                    spokenWith = voice === config.voice ? 'the system voice' : voice;
                    return [2 /*return*/, "EmberSpeak is not installed: spoke ".concat(spoken.length, " characters with ").concat(spokenWith, " instead.")];
            }
        });
    });
}
function voiceFor($, text) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!looksNorwegian(text))
                        return [2 /*return*/, config.voice];
                    return [4 /*yield*/, listsVoiceNow($, config.norwegianVoice)];
                case 1: return [2 /*return*/, (_a.sent()) ? config.norwegianVoice : config.voice];
            }
        });
    });
}
// Asks `say` what it has, the way the hook does: EmberSpeak resolves a name it
// cannot find to the system default rather than failing, which would read Norwegian
// in an English voice. Only ever asked about a Norwegian reply.
function listsVoiceNow($, name) {
    return __awaiter(this, void 0, void 0, function () {
        var stdout, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, $.process.run(['/usr/bin/say', '-v', '?'], { timeoutMs: 5000 })];
                case 1:
                    stdout = (_b.sent()).stdout;
                    return [2 /*return*/, listsVoice(stdout, name)];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ---- watching it -----------------------------------------------------------
function poll($) {
    return __awaiter(this, void 0, void 0, function () {
        var s, was, playing, progress, _a, live, moved, paused, queue, _b;
        var _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0: return [4 /*yield*/, (0, claude_code_1.read)($, speech)];
                case 1:
                    s = _h.sent();
                    was = (s === null || s === void 0 ? void 0 : s.isSpeaking) === true;
                    // While something is playing, look every tick, so the position keeps up and the
                    // band leaves as soon as the voice does; idle, every fifth, so a quiet session is
                    // not spawning a process a second to learn nothing.
                    if (ticks++ % (was ? 1 : IDLE_EVERY) !== 0)
                        return [2 /*return*/];
                    return [4 /*yield*/, isPlaying($)
                        // The progress file belongs to this mod's own launches. Speech the hook started
                        // has none, and what is left in the file from the last reading is not about it:
                        // read then, a stale "done" would take the band down while a voice is talking.
                    ];
                case 2:
                    playing = _h.sent();
                    if (!(playing && (s === null || s === void 0 ? void 0 : s.mine))) return [3 /*break*/, 4];
                    return [4 /*yield*/, readProgress($)];
                case 3:
                    _a = _h.sent();
                    return [3 /*break*/, 5];
                case 4:
                    _a = null;
                    _h.label = 5;
                case 5:
                    progress = _a;
                    live = playing && (progress === null || progress === void 0 ? void 0 : progress.state) !== 'done';
                    moved = progress !== null && progress.offset !== ((_c = s === null || s === void 0 ? void 0 : s.mine) === null || _c === void 0 ? void 0 : _c.offset);
                    paused = progress ? progress.state === 'paused' : (s === null || s === void 0 ? void 0 : s.isPaused) === true;
                    if (live === was && !moved && paused === ((s === null || s === void 0 ? void 0 : s.isPaused) === true))
                        return [2 /*return*/];
                    // Right after a launch EmberSpeak is not up yet, and a reading taken in that
                    // window would take the band straight back down.
                    if (was && !live && Date.now() - ((_d = s === null || s === void 0 ? void 0 : s.startedAt) !== null && _d !== void 0 ? _d : 0) < GRACE_MS)
                        return [2 /*return*/];
                    if (!!live) return [3 /*break*/, 9];
                    queue = (_e = s === null || s === void 0 ? void 0 : s.queue) !== null && _e !== void 0 ? _e : [];
                    _b = was && queue.length > 0;
                    if (!_b) return [3 /*break*/, 7];
                    return [4 /*yield*/, playNext($, s, queue)];
                case 6:
                    _b = (_h.sent());
                    _h.label = 7;
                case 7:
                    if (_b)
                        return [2 /*return*/];
                    return [4 /*yield*/, merge($, { isSpeaking: false, isPaused: false, startedAt: 0, mine: undefined })];
                case 8:
                    _h.sent();
                    return [2 /*return*/];
                case 9: return [4 /*yield*/, merge($, {
                        isSpeaking: true,
                        isPaused: paused,
                        startedAt: (s === null || s === void 0 ? void 0 : s.mine) ? ((_f = s.startedAt) !== null && _f !== void 0 ? _f : Date.now()) : Date.now(),
                        mine: (s === null || s === void 0 ? void 0 : s.mine) ? __assign(__assign({}, s.mine), { offset: (_g = progress === null || progress === void 0 ? void 0 : progress.offset) !== null && _g !== void 0 ? _g : s.mine.offset }) : undefined,
                    })];
                case 10:
                    _h.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/** The app's progress file: where it is, and whether it is speaking. */
function parseProgress(raw) {
    var _a = raw.trim().split(/\s+/), offset = _a[0], state = _a[1];
    var at = Number(offset);
    if (!Number.isFinite(at))
        return null;
    if (state !== 'speaking' && state !== 'paused' && state !== 'done')
        return null;
    return { offset: at, state: state };
}
function readProgress($) {
    return __awaiter(this, void 0, void 0, function () {
        var raw;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!home)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, $.fs.read(path(PROGRESS)).catch(function () { return ''; })];
                case 1:
                    raw = _a.sent();
                    return [2 /*return*/, parseProgress(raw)];
            }
        });
    });
}
function isPlaying($) {
    return __awaiter(this, void 0, void 0, function () {
        var exitCode, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, $.process.run(['/usr/bin/pgrep', '-x', 'EmberSpeak'], { timeoutMs: 5000 })];
                case 1:
                    exitCode = (_b.sent()).exitCode;
                    return [2 /*return*/, exitCode === 0];
                case 2:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ---- text ------------------------------------------------------------------
/** True when a `say -v '?'` listing carries a voice by that name. */
function listsVoice(listing, name) {
    var wanted = name.trim().toLowerCase();
    if (wanted === '')
        return false;
    return listing
        .split('\n')
        .some(function (line) { var _a; return ((_a = line.trim().split(/\s{2,}/)[0]) !== null && _a !== void 0 ? _a : '').trim().toLowerCase() === wanted; });
}
/** The assistant text of the last turn: what is on screen as the last reply. */
function lastReply(messages) {
    var turn = [];
    var started = false;
    for (var i = messages.length - 1; i >= 0; i--) {
        var m = messages[i];
        // A user row is the command's own record, a notice, or a tool result: the turn
        // has not begun until some assistant text has been read, and a row before that
        // is walked past rather than stopped at.
        if (m.role === 'user') {
            if (started)
                break;
            continue;
        }
        // An assistant row with no text is a step that only called tools. It joins
        // nothing and marks nothing: taken as the turn's start, it would make the walk
        // stop at the next tool result and read out an empty reply.
        var text = m.text.trim();
        if (text === '')
            continue;
        turn.unshift(text);
        started = true;
    }
    return turn.join('\n').trim();
}
/** Where the sentence one step away from `offset` begins, in UTF-16 units. */
function sentenceStart(text, offset, direction) {
    var _a;
    var starts = [0];
    var ends = /[.!?\n]+[ \t]*/g;
    var m;
    while ((m = ends.exec(text)) !== null)
        starts.push(m.index + m[0].length);
    var i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= offset)
        i++;
    if (direction === 1)
        return i + 1 < starts.length ? starts[i + 1] : text.length;
    // Back: the start of the sentence being read, and the one before it when the
    // offset is already sitting on that start.
    return offset > starts[i] ? starts[i] : (_a = starts[i - 1]) !== null && _a !== void 0 ? _a : 0;
}
/** Norwegian rather than English, by word vote; English wins ties and near-ties. */
function looksNorwegian(text) {
    var _a, _b;
    var lowered = text.toLowerCase();
    var words = (_a = lowered.match(/[a-zæøå]+/g)) !== null && _a !== void 0 ? _a : [];
    if (words.length < 3)
        return false;
    var nb = 0;
    var en = 0;
    for (var _i = 0, words_1 = words; _i < words_1.length; _i++) {
        var w = words_1[_i];
        if (NORWEGIAN_WORDS.has(w))
            nb++;
        else if (ENGLISH_WORDS.has(w))
            en++;
    }
    // æ and ø are Norwegian/Danish only, so they count for more than the words.
    // å is shared with Swedish and Danish, so on its own it proves nothing.
    var marks = ((_b = lowered.match(/[æø]/g)) !== null && _b !== void 0 ? _b : []).length;
    return 2 * nb + 3 * marks > 2 * en && nb + marks >= 2;
}
/** Strips the markdown that reads badly out loud, and caps the length. */
function speakable(text, max) {
    return truncate(text
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
        .trim(), max);
}
// A table row as it is read out: its cells, and nothing at all for a rule.
function tableRow(row) {
    var cells = row
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(function (c) { return c.trim(); });
    if (cells.every(function (c) { return /^[-: ]*$/.test(c); }))
        return '';
    return cells.filter(function (c) { return c !== ''; }).join(', ');
}
function truncate(text, max) {
    if (text.length <= max)
        return text;
    var cut = text.slice(0, max);
    var at = cut.lastIndexOf(' ');
    return "".concat(at > 0 ? cut.slice(0, at) : cut, ". Output truncated.");
}
// One argument, quoted for the shell this app is launched through. Only ever our
// own paths, voice names and numbers: the reply text travels through the scratch
// file, so nothing a reply contains can reach a command line.
function q(argument) {
    return "'".concat(String(argument).replace(/'/g, "'\\''"), "'");
}
// Function words that are Norwegian and not English. Every entry has to be a word
// English does not also use, because a false positive here means an English reply
// read out in Norwegian, which is worse than the reverse.
var NORWEGIAN_WORDS = new Set("er og \u00E5 et en s\u00E5 ikke jeg det som til p\u00E5 med av den han hun fra om n\u00E5r hva\n    hvordan hvorfor ogs\u00E5 skal kan har hadde blir ble v\u00E6rt gj\u00F8r gjorde ser f\u00E5r\n    fikk kommer kom tok gir ga sier sa vet tror tenker trenger bruker brukte\n    lager lagde finner fant sjekker kj\u00F8rer virker fungerer feil ting dag tid sted\n    fil filen filer kode jobb m\u00E5te litt mer mest alle noen ingen ingenting\n    der n\u00E5 da jo nok kanskje selv sammen tilbake igjen fortsatt allerede\n    snart nesten godt d\u00E5rlig stor liten ny gammel f\u00F8rste siste neste samme annen\n    hver hvilken hvem hvor denne dette disse vil m\u00E5 v\u00E6re oss dere dem seg\n    sitt v\u00E5re kun helt veldig mye\n    endret endrer endre endring stemme spr\u00E5k norsk norske pr\u00F8v pr\u00F8ve pr\u00F8ver\n    tekst teksten linje linjen svar svare svarte ord ordet navn navnet verdi\n    verdien lese leser skrive skriver skrevet bruk bruke brukt lage laget\n    kj\u00F8r kj\u00F8re kj\u00F8rt bygge bygget feilen eksempel eksempler m\u00E5l m\u00E5let hjelp\n    hjelpe hjelper sjekk sjekke vise viser viste g\u00E5 g\u00E5r gikk finne\n    fordi derfor hvis etter f\u00F8r mens ganske rundt gjennom mellom opp videre\n    egen eget egne hele halv ganger tusen hundre klokka klokken uke uken\n    m\u00E5ned \u00E5r".split(/\s+/));
var ENGLISH_WORDS = new Set("the is are was were and of to in that it you we they this with for on have\n    has had be been not but from at as by or so if then than there their them\n    what when where which who how why all any some more most very just only also\n    into out up down over under".split(/\s+/));
