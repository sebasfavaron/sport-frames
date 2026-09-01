#!/usr/bin/env node
"use strict";

// T-049.39 - optional per-cue identifier line for WebVTT editor cues.
// Extracts the shipped cueName / buildVtt / parseVttCues / persistence helpers
// verbatim and proves the identifier round-trips through export, native-syntax
// parsing (the line before the timing line), re-import, and localStorage; that a
// cue with no identifier stays byte-identical (no `name` key); that reserved
// `-->` / newline sequences are stripped; and that the identifier is carried
// through Duplicate and Merge with next. Also asserts the form / submit /
// edit-load / list-summary wiring against the shipped source.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(process.env.SCRIPT_PATH || path.join(__dirname, "..", "script.js"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const spatialStart = source.indexOf("  const cueSpatial =");
const spatialEnd = source.indexOf("\n\n  function parseVttTimestamp", spatialStart);
assert.notEqual(spatialStart, -1, "cueSpatial region exists");
assert.notEqual(spatialEnd, -1, "cueSpatial region boundary exists");
assert.ok(
  source.slice(spatialStart, spatialEnd).includes("const cueName ="),
  "cueName lives in the extracted region"
);

const context = {
  editorCues: [],
  clamp: (n, min, max) => Math.min(max, Math.max(min, n)),
  vttTimestamp(seconds) {
    const ms = Math.round(seconds * 1000);
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  },
  localStorage: null,
  VTT_EDITOR_STORAGE_KEY: "sport-frames:vtt-editor-cues",
  CUE_TEXT_ALIGN_VALUES: ["start", "center", "end"],
  setEditorStatus() {}
};
vm.createContext(context);
vm.runInContext(
  `${source.slice(spatialStart, spatialEnd)}\n` +
    `${functionSource("parseVttTimestamp")}\n${functionSource("parseVttCues")}\n` +
    `${functionSource("loadPersistedCues")}\n${functionSource("saveEditorCues")}\n` +
    `${functionSource("duplicateCue")}\n${functionSource("mergeCueWithNext")}\n` +
    `this.api={buildVtt,parseVttCues,loadPersistedCues,saveEditorCues,cueName,duplicateCue,mergeCueWithNext};`,
  context
);

const { api } = context;

// 1. An identifier is exported as a plain line immediately before the timing line.
context.editorCues.push({ id: 1, start: 1, end: 3, text: "Gol", x: 50, y: 8, size: 60, name: "gol-1" });
const exported = api.buildVtt();
assert.match(exported, /\n\ngol-1\n00:00:01\.000 --> 00:00:03\.000 /, "identifier is the line before the timing line");

// 2. Parsing that export recovers the identifier and clean body.
assert.deepEqual(JSON.parse(JSON.stringify(api.parseVttCues(exported))), [
  { start: 1, end: 3, text: "Gol", x: 50, y: 8, size: 60, name: "gol-1" }
], "export round-trips the identifier");

// 3. A cue with no identifier exports and parses byte-identically (no `name` key).
context.editorCues.length = 0;
context.editorCues.push({ id: 2, start: 0, end: 1, text: "Sin id", x: 50, y: 8, size: 60 });
const plain = api.buildVtt();
assert.equal(plain, "WEBVTT\n\n00:00:00.000 --> 00:00:01.000 line:8%,center position:50%,center size:60% align:center\nSin id\n", "no-identifier export is unchanged");
assert.deepEqual(JSON.parse(JSON.stringify(api.parseVttCues(plain))), [
  { start: 0, end: 1, text: "Sin id", x: 50, y: 8, size: 60 }
], "no-identifier cue parses with no name key");

// 4. Externally authored identifier lines (including a numeric SRT-style id) parse.
const external = api.parseVttCues(
  "WEBVTT\n\n1\n00:00:04.000 --> 00:00:06.000\nPrimer cue\n\nsegundo\n00:00:06.000 --> 00:00:07.000\nOtro\n"
);
assert.deepEqual(JSON.parse(JSON.stringify(external)), [
  { start: 4, end: 6, text: "Primer cue", x: 50, y: 8, size: 60, name: "1" },
  { start: 6, end: 7, text: "Otro", x: 50, y: 8, size: 60, name: "segundo" }
], "each cue's own identifier line is captured, not leaked to the next cue");

// 5. The WEBVTT header line is never mistaken for an identifier.
assert.doesNotMatch(
  JSON.stringify(api.parseVttCues("WEBVTT\n00:00:00.000 --> 00:00:01.000\nx\n")),
  /"name"/,
  "the WEBVTT header is not treated as a cue identifier"
);

// 6. Reserved `-->` and newline sequences are stripped by cueName.
assert.equal(api.cueName({ name: "a --> b" }), "a  b", "the --> arrow is removed from an identifier");
assert.equal(api.cueName({ name: " keep \n me " }), "keep   me", "newlines collapse and outer whitespace trims");
assert.equal(api.cueName({ name: 42 }), "", "a non-string identifier yields the empty string");
context.editorCues.length = 0;
context.editorCues.push({ id: 3, start: 0, end: 1, text: "x", x: 50, y: 8, size: 60, name: "bad --> id" });
assert.match(api.buildVtt(), /\n\nbad  id\n00:00:00\.000 --> /, "a sanitized identifier still exports safely before the timing line");

// 7. The identifier persists through localStorage; a no-identifier cue stores no key.
context.editorCues.length = 0;
context.editorCues.push({ id: 4, start: 5, end: 7, text: "Tarjeta", x: 50, y: 8, size: 60, name: "yellow-card" });
let stored = "";
context.localStorage = { getItem: () => stored, setItem: (_k, v) => { stored = v; } };
api.saveEditorCues();
assert.match(stored, /"name":"yellow-card"/, "identifier is written to storage");
context.editorCues.length = 0;
assert.equal(api.loadPersistedCues()[0].name, "yellow-card", "identifier is restored from storage");

context.editorCues.length = 0;
context.editorCues.push({ id: 5, start: 0, end: 1, text: "y", x: 50, y: 8, size: 60 });
api.saveEditorCues();
assert.doesNotMatch(stored, /"name"/, "no-identifier cue is stored without a name key");

// 8. Duplicate and Merge with next carry the (first) cue's identifier.
const clone = api.duplicateCue({ id: 1, start: 2, end: 5, text: "t", x: 50, y: 8, size: 60, name: "clip-a" }, 9);
assert.equal(clone.name, "clip-a", "Duplicate carries the identifier");
const merged = api.mergeCueWithNext([
  { id: 1, start: 0, end: 4, text: "First", x: 50, y: 8, size: 60, name: "first" },
  { id: 2, start: 4, end: 6, text: "Second", x: 50, y: 8, size: 60, name: "second" }
], 1);
assert.equal(merged[0].name, "first", "Merge with next keeps the first cue's identifier");
const mergedPlain = api.mergeCueWithNext([
  { id: 1, start: 0, end: 4, text: "First", x: 50, y: 8, size: 60 },
  { id: 2, start: 4, end: 6, text: "Second", x: 50, y: 8, size: 60 }
], 1);
assert.ok(!("name" in mergedPlain[0]), "merging two unnamed cues produces no name key");

// UI / handler wiring assertions against the shipped source.
assert.match(source, /<label class="vtt-editor__cue-id">Cue identifier \(optional\)<input name="cueName" type="text"/, "form exposes a cue identifier input");
assert.match(source, /const name = form\.elements\.cueName\.value\.replace\(\/--\>\/g, ""\)\.replace\(\/\[\\r\\n\]\+\/g, " "\)\.trim\(\);/, "submit reads and sanitizes the identifier field");
assert.match(source, /editorCues\.push\(\{ id: nextCueId\+\+, start, end, text, x, y, size, voice, align, name \}\);/, "new cue stores the identifier");
assert.match(source, /Object\.assign\(cue, \{ start, end, text, x, y, size, voice, align, name \}\);/, "cue update stores the identifier");
assert.match(source, /form\.elements\.cueName\.value = cueName\(cue\);/, "editing a cue loads its identifier into the form");
assert.match(source, /const idNote = cueName\(cue\) \? `#\$\{cueName\(cue\)\} ` : "";/, "list summary shows the identifier");
assert.match(source, /if \(cueName\(cue\)\) clone\.name = cueName\(cue\);/, "duplicate carries the identifier");
assert.match(source, /if \(cueName\(cue\)\) merged\.name = cueName\(cue\);/, "merge carries the first cue's identifier");
assert.match(source, /\$\{identifier \? `\$\{identifier\}\\n` : ""\}\$\{vttTimestamp\(cue\.start\)\}/, "buildVtt emits the identifier line before the timing line");
assert.match(source, /pendingId = trimmed && !trimmed\.includes\("--\>"\) &&\s*!\/\^\(\?:WEBVTT\|NOTE\)/, "parseVttCues only treats a non-arrow, non-header line before the timing line as an identifier");
assert.match(source, /\.\.\.\(pendingId \? \{ name: pendingId \} : \{\}\),/, "parseVttCues attaches the pending identifier to the cue");

console.log("cue identifier verification: pass");
