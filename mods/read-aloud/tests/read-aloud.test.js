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
Object.defineProperty(exports, "__esModule", { value: true });
var testing_1 = require("claude-code/testing");
var register_1 = require("../hooks/register");
var row = function (role, text) { return ({ role: role, text: text, toolUses: [] }); };
/** A speech state with `waiting` replies queued behind whatever is playing. */
var state = function (isSpeaking, waiting) {
    if (waiting === void 0) { waiting = 0; }
    return ({ isSpeaking: isSpeaking, isPaused: false, startedAt: 0, queue: Array(waiting).fill('a reply') });
};
var BAND = { component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100 } };
var mountBand = function ($) { return $.ui.mount(__assign({ plugin: 'read-aloud', surface: 'terminal' }, BAND)); };
(0, testing_1.describe)('read-aloud', function () {
    (0, testing_1.test)('speakable strips what reads badly out loud', function () {
        var text = (0, register_1.speakable)([
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
        ].join('\n'), 6000);
        (0, testing_1.expect)(text).toContain('Heading');
        (0, testing_1.expect)(text).not.toContain('#');
        (0, testing_1.expect)(text).not.toContain('**');
        (0, testing_1.expect)(text).not.toContain('`');
        (0, testing_1.expect)(text).not.toContain('const x = 1'); // a fenced block is never read out
        (0, testing_1.expect)(text).toContain('A bold word and a link and code.');
        (0, testing_1.expect)(text).toContain('name, tokens'); // the header row, and the rule row dropped
        (0, testing_1.expect)(text).toContain('context, 204k');
        (0, testing_1.expect)(text).not.toContain('---');
        (0, testing_1.expect)(text).toContain('a quote');
        (0, testing_1.expect)(text).toContain('a bullet');
        (0, testing_1.expect)(text).not.toMatch(/\n{2,}/);
    });
    (0, testing_1.test)('speakable caps the length at a word', function () {
        var text = (0, register_1.speakable)('word '.repeat(2000), 100);
        (0, testing_1.expect)(text.length).toBeLessThan(130);
        (0, testing_1.expect)(text.endsWith('. Output truncated.')).toBe(true);
        (0, testing_1.expect)(text).not.toContain('  ');
    });
    (0, testing_1.test)('lastReply reads the last turn, not the command that asked for it', function () {
        // The command's own record lands as a user row after the reply.
        var messages = [row('user', 'what changed?'), row('assistant', 'The hook moved.'), row('user', '/read-aloud')];
        (0, testing_1.expect)((0, register_1.lastReply)(messages)).toBe('The hook moved.');
    });
    (0, testing_1.test)('lastReply joins a turn and stops at the prompt before it', function () {
        var messages = [
            row('user', 'first question'),
            row('assistant', 'An older answer.'),
            row('user', 'second question'),
            row('assistant', 'Part one.'),
            row('assistant', ''), // a tool-only or thinking-only step joins nothing
            row('assistant', 'Part two.'),
        ];
        (0, testing_1.expect)((0, register_1.lastReply)(messages)).toBe('Part one.\nPart two.');
    });
    (0, testing_1.test)('lastReply reads past a turn full of tool calls', function () {
        // The shape that broke it: a turn that only called tools, then the command's
        // own record. The reply to read is the one before all of it.
        var messages = [
            row('user', 'what changed?'),
            row('assistant', 'The hook moved.'),
            row('user', 'do it'),
            row('assistant', ''), // a step that only called tools
            row('user', ''), // its tool result
            row('assistant', ''), // and another
            row('user', ''),
            row('user', '/read-aloud'),
        ];
        (0, testing_1.expect)((0, register_1.lastReply)(messages)).toBe('The hook moved.');
    });
    (0, testing_1.test)('lastReply has nothing to read before the first answer', function () {
        (0, testing_1.expect)((0, register_1.lastReply)([])).toBe('');
        (0, testing_1.expect)((0, register_1.lastReply)([row('user', 'hello')])).toBe('');
        (0, testing_1.expect)((0, register_1.lastReply)([row('user', 'hello'), row('assistant', ''), row('user', '')])).toBe('');
    });
    (0, testing_1.test)('looksNorwegian votes, and English wins near-ties', function () {
        (0, testing_1.expect)((0, register_1.looksNorwegian)('Dette er en fil som ikke virker')).toBe(true);
        (0, testing_1.expect)((0, register_1.looksNorwegian)('Filen ble endret, men jeg finner ikke feilen')).toBe(true);
        (0, testing_1.expect)((0, register_1.looksNorwegian)('The file is not there, and I did not find it')).toBe(false);
        (0, testing_1.expect)((0, register_1.looksNorwegian)('er og')).toBe(false); // too short to vote on
    });
    (0, testing_1.test)('sentenceStart steps to the sentence either side of the offset', function () {
        var text = 'One. Two! Three?\nFour.'; // sentence starts: 0, 5, 10, 17
        (0, testing_1.expect)((0, register_1.sentenceStart)(text, 0, 1)).toBe(5);
        (0, testing_1.expect)((0, register_1.sentenceStart)(text, 6, 1)).toBe(10);
        (0, testing_1.expect)((0, register_1.sentenceStart)(text, 12, 1)).toBe(17);
        (0, testing_1.expect)((0, register_1.sentenceStart)(text, 15, -1)).toBe(10); // inside a sentence: its own start
        (0, testing_1.expect)((0, register_1.sentenceStart)(text, 10, -1)).toBe(5); // already on a start: the one before
        (0, testing_1.expect)((0, register_1.sentenceStart)(text, 17, -1)).toBe(10); // a line break ends a sentence too
        (0, testing_1.expect)((0, register_1.sentenceStart)(text, 99, 1)).toBe(text.length); // nothing after the last one
    });
    (0, testing_1.test)('readOptions takes what is set and falls back on what makes no sense', function () {
        var plain = (0, register_1.readOptions)({});
        (0, testing_1.expect)(plain.voice).toBe('Ember');
        (0, testing_1.expect)(plain.norwegianVoice).toBe('Nora');
        (0, testing_1.expect)(plain.rates).toEqual([1, 1.25, 1.5, 2, 0.75]);
        (0, testing_1.expect)(plain.maxChars).toBe(6000);
        (0, testing_1.expect)(plain.speaker).toContain('EmberSpeak');
        (0, testing_1.expect)((0, register_1.readOptions)({ voice: '  Tom (Enhanced) ', norwegianVoice: 'Henrik (Enhanced)' })).toMatchObject({
            voice: 'Tom (Enhanced)',
            norwegianVoice: 'Henrik (Enhanced)',
        });
        (0, testing_1.expect)((0, register_1.readOptions)({ rates: '1, 1.5 ,2' }).rates).toEqual([1, 1.5, 2]);
        (0, testing_1.expect)((0, register_1.readOptions)({ rates: 'fast, faster' }).rates).toEqual([1]); // an unusable list costs the rate button, not the mod
        (0, testing_1.expect)((0, register_1.readOptions)({ rates: '' }).rates).toEqual([1, 1.25, 1.5, 2, 0.75]); // blank counts as unset, not as no rates
        (0, testing_1.expect)((0, register_1.readOptions)({ voice: '   ' }).voice).toBe('Ember');
        (0, testing_1.expect)((0, register_1.readOptions)({ maxChars: 'lots' }).maxChars).toBe(6000);
        (0, testing_1.expect)((0, register_1.readOptions)({ maxChars: 999999 }).maxChars).toBe(20000); // clamped, not refused
        (0, testing_1.expect)((0, register_1.readOptions)({ maxChars: 5 }).maxChars).toBe(200);
    });
    (0, testing_1.test)('fill turns a share of the reply into cells of the bar', function () {
        (0, testing_1.expect)((0, register_1.fill)(0, 12)).toBe(0);
        (0, testing_1.expect)((0, register_1.fill)(50, 12)).toBe(6);
        (0, testing_1.expect)((0, register_1.fill)(100, 12)).toBe(12);
        (0, testing_1.expect)((0, register_1.fill)(2, 12)).toBe(0); // barely started still reads as a bar, not as a stub
        (0, testing_1.expect)((0, register_1.fill)(104, 12)).toBe(12); // the app can report an offset at the end of the text
        (0, testing_1.expect)((0, register_1.fill)(-1, 12)).toBe(0);
    });
    (0, testing_1.test)('enqueue puts the new reply last, and the oldest falls off past the cap', function () {
        (0, testing_1.expect)((0, register_1.enqueue)([], 'a')).toEqual(['a']);
        (0, testing_1.expect)((0, register_1.enqueue)(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
        (0, testing_1.expect)((0, register_1.enqueue)(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['b', 'c', 'd', 'e', 'f']);
    });
    (0, testing_1.test)('reading is a run while something plays or something waits', function () {
        (0, testing_1.expect)((0, register_1.reading)(null)).toBe(false); // nothing asked for yet
        (0, testing_1.expect)((0, register_1.reading)(state(false))).toBe(false); // a reply waiting to be asked for is not a run
        (0, testing_1.expect)((0, register_1.reading)(state(true))).toBe(true);
        (0, testing_1.expect)((0, register_1.reading)(state(false, 2))).toBe(true); // between two replies of a run
        (0, testing_1.expect)((0, register_1.reading)(state(true, 2))).toBe(true);
    });
    (0, testing_1.test)('parseProgress reads the app position file, and refuses anything else', function () {
        (0, testing_1.expect)((0, register_1.parseProgress)('1234 speaking\n')).toEqual({ offset: 1234, state: 'speaking' });
        (0, testing_1.expect)((0, register_1.parseProgress)('0 paused')).toEqual({ offset: 0, state: 'paused' });
        (0, testing_1.expect)((0, register_1.parseProgress)('164 done\n')).toEqual({ offset: 164, state: 'done' });
        (0, testing_1.expect)((0, register_1.parseProgress)('')).toBeNull(); // not launched with -p yet
        (0, testing_1.expect)((0, register_1.parseProgress)('speaking')).toBeNull();
        (0, testing_1.expect)((0, register_1.parseProgress)('12 humming')).toBeNull();
    });
    (0, testing_1.test)('the band offers to read once a turn has answered, and draws nothing before', function ($, on) { return __awaiter(void 0, void 0, void 0, function () {
        var nothing, _a, band, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    // The bottom a band needs: what the engine draws where no mod draws. It answers
                    // both events the plugin asks beneath it.
                    on('ui.render', function ($, e) { return $.ui.resolve(e).Text({ children: 'band below' }); });
                    on('turn.complete', function () { return ({ text: '' }); });
                    return [4 /*yield*/, mountBand($)];
                case 1:
                    nothing = _d.sent();
                    _a = testing_1.expect;
                    return [4 /*yield*/, nothing.find({ key: 'read' })];
                case 2:
                    _a.apply(void 0, [_d.sent()]).toBeUndefined(); // nothing answered: no row
                    return [4 /*yield*/, nothing.unmount()];
                case 3:
                    _d.sent();
                    return [4 /*yield*/, $.turn.complete({ answer: 'Everything checks out.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })];
                case 4:
                    _d.sent();
                    return [4 /*yield*/, mountBand($)];
                case 5:
                    band = _d.sent();
                    _b = testing_1.expect;
                    return [4 /*yield*/, band.find({ key: 'read' })];
                case 6:
                    _b.apply(void 0, [_d.sent()]).toBeDefined();
                    _c = testing_1.expect;
                    return [4 /*yield*/, band.find({ type: 'Text', text: /ready/ })];
                case 7:
                    _c.apply(void 0, [_d.sent()]).toBeDefined();
                    return [4 /*yield*/, band.unmount()];
                case 8:
                    _d.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, testing_1.test)('listsVoice reads a say -v ? listing by name', function () {
        var listing = ['Nora                nb_NO    # Hei! Jeg heter Nora.', 'Ember               en_US    # This is Ember.'].join('\n');
        (0, testing_1.expect)((0, register_1.listsVoice)(listing, 'Nora')).toBe(true);
        (0, testing_1.expect)((0, register_1.listsVoice)(listing, 'norA')).toBe(true);
        (0, testing_1.expect)((0, register_1.listsVoice)(listing, 'Henrik (Enhanced)')).toBe(false);
        (0, testing_1.expect)((0, register_1.listsVoice)(listing, '')).toBe(false);
    });
});
