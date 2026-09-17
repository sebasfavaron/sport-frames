#!/usr/bin/env node
"use strict";

// T-049.47 - export/import cues as SubRip (.srt) alongside the existing WebVTT format.
// Exercise the shipped buildSrt/parseSrtCues/parseSrtTimestamp/srtTimestamp helpers
// extracted verbatim from script.js, then assert the toolbar wiring.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

const vttTimestampStart = source.indexOf("  const vttTimestamp = (seconds) => {");
const cueVoiceStart = source.indexOf("  const cueVoice = (cue) =>");
const srtStart = source.indexOf("  const srtTimestamp = (seconds) =>");
const srtEnd = source.indexOf("\n\n  function parseVttTimestamp", srtStart);
assert.notEqual(vttTimestampStart, -1, "vttTimestamp exists");
assert.notEqual(cueVoiceStart, -1, "cueVoice exists");
assert.notEqual(srtStart, -1, "srtTimestamp exists");
assert.notEqual(srtEnd, -1, "SRT helper block extraction boundary exists");

const vttTimestampEnd = source.indexOf("\n\n  function setupPreview", vttTimestampStart);
const cueVoiceEnd = source.indexOf("\n", cueVoiceStart);
assert.notEqual(vttTimestampEnd, -1, "vttTimestamp extraction boundary exists");
assert.notEqual(cueVoiceEnd, -1, "cueVoice extraction boundary exists");

const context = { editorCues: [] };
vm.createContext(context);
vm.runInContext(
  `${source.slice(vttTimestampStart, vttTimestampEnd)}\n${source.slice(cueVoiceStart, cueVoiceEnd)}\n${source.slice(srtStart, srtEnd)}\n` +
    "this.api = { buildSrt, parseSrtCues, parseSrtTimestamp, srtTimestamp };",
  context
);

// srtTimestamp uses a comma decimal separator, unlike WebVTT's dot.
assert.equal(context.api.srtTimestamp(65.25), "00:01:05,250", "srtTimestamp formats HH:MM:SS,mmm");

// parseSrtTimestamp accepts the standard comma format and rejects a VTT-style dot.
assert.equal(context.api.parseSrtTimestamp("00:01:05,250"), 65.25, "parseSrtTimestamp parses comma timestamps");
assert.equal(context.api.parseSrtTimestamp("00:01:05.250"), null, "parseSrtTimestamp rejects dot timestamps");

// buildSrt: sequential numeric index, comma timestamps, no WEBVTT header, no cue settings line.
context.editorCues = [
  { id: 2, start: 3, end: 4.5, text: "Second" },
  { id: 1, start: 0, end: 1, text: "First" }
];
const srtOut = context.api.buildSrt();
assert.equal(
  srtOut,
  "1\n00:00:00,000 --> 00:00:01,000\nFirst\n\n2\n00:00:03,000 --> 00:00:04,500\nSecond\n",
  "buildSrt emits chronologically sorted, sequentially numbered SRT blocks"
);
assert.doesNotMatch(srtOut, /WEBVTT/, "SRT output has no WebVTT header");
assert.doesNotMatch(srtOut, /line:|position:|align:/, "SRT output carries no WebVTT cue settings");

// A speaker/voice is exported as a plain "Name: text" prefix (SRT has no <v> span).
context.editorCues = [{ id: 1, start: 0, end: 1, text: "Hello", voice: "Ref" }];
assert.match(context.api.buildSrt(), /^1\n00:00:00,000 --> 00:00:01,000\nRef: Hello\n$/, "voice is prefixed as plain text in SRT");

// Empty cue list produces an empty string, matching buildVtt's empty-body convention.
context.editorCues = [];
assert.equal(context.api.buildSrt(), "", "no cues produce an empty SRT payload");

// parseSrtCues: round-trips a realistic multi-cue file, including a multi-line body.
const sample = [
  "1",
  "00:00:01,000 --> 00:00:02,500",
  "Kickoff",
  "",
  "2",
  "00:00:03,000 --> 00:00:05,000",
  "Line one",
  "Line two",
  ""
].join("\n");
// vm-context results come from another realm; JSON round-trip normalises them
// into ordinary objects in this realm so assert.deepEqual (deepStrictEqual,
// which checks prototypes) can compare them.
const parsed = JSON.parse(JSON.stringify(context.api.parseSrtCues(sample)));
assert.deepEqual(parsed, [
  { start: 1, end: 2.5, text: "Kickoff" },
  { start: 3, end: 5, text: "Line one\nLine two" }
], "parseSrtCues recovers start/end/text for every block");

// Malformed/edge blocks are rejected: end<=start, and a body-less block.
const rejects = [
  "1",
  "00:00:05,000 --> 00:00:02,000",
  "Backwards",
  "",
  "2",
  "00:00:06,000 --> 00:00:07,000",
  ""
].join("\n");
assert.deepEqual(JSON.parse(JSON.stringify(context.api.parseSrtCues(rejects))), [], "end<=start and empty-body blocks are both rejected");

// A CRLF file with a missing numeric index (some exporters omit it) still parses.
const noIndex = "00:00:00,500 --> 00:00:01,500\r\nNo index line\r\n";
assert.deepEqual(
  JSON.parse(JSON.stringify(context.api.parseSrtCues(noIndex))),
  [{ start: 0.5, end: 1.5, text: "No index line" }],
  "a missing index line does not block parsing"
);

// UI wiring: import input and download button exist and are hooked to the new helpers.
assert.match(source, /Import cues \.srt<input type="file" accept="\.srt,application\/x-subrip,text\/srt" data-import-srt>/, "toolbar exposes an SRT import control");
assert.match(source, /<button type="button" data-export="download-srt">Download \.srt<\/button>/, "toolbar exposes an SRT download control");
assert.match(
  source,
  /querySelector\("\[data-import-srt\]"\)\.addEventListener\("change", async \(event\) => \{[\s\S]*?parseSrtCues\(await file\.text\(\)\)/,
  "SRT import handler parses the chosen file with parseSrtCues"
);
assert.match(
  source,
  /querySelector\('\[data-export="download-srt"\]'\)\.addEventListener\("click", \(\) => \{\s*const url = URL\.createObjectURL\(new Blob\(\[buildSrt\(\)\], \{ type: "application\/x-subrip" \}\)\);/,
  "SRT download handler builds the file from buildSrt() with the SubRip MIME type"
);
assert.match(source, /link\.download = "annotations\.srt";/, "SRT download uses an .srt filename");

console.log("T-049.47 SRT export/import verification: pass");
