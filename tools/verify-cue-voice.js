#!/usr/bin/env node
"use strict";

// T-049.37 - editable speaker / voice (<v Name>) label for WebVTT editor cues.
// Extracts the shipped buildVtt / parseVttCues / persistence helpers verbatim and
// proves the speaker label round-trips through export, native-syntax parsing,
// re-import, and localStorage, plus asserts the form / edit-load / submit wiring.

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
    `this.api={buildVtt,parseVttCues,loadPersistedCues,saveEditorCues,cueVoice};`,
  context
);

const { api } = context;

// 1. A speaker label is exported as a native WebVTT <v Name> span prefix.
context.editorCues.push({ id: 1, start: 1, end: 3, text: "Gol de cabeza", x: 50, y: 8, size: 60, voice: "Relator" });
const exported = api.buildVtt();
assert.match(exported, / line:8%,center position:50%,center size:60% align:center\n<v Relator>Gol de cabeza/, "voice exports as <v Name> prefix");

// 2. Parsing that export recovers the speaker and the clean body.
const parsed = api.parseVttCues(exported);
assert.deepEqual(JSON.parse(JSON.stringify(parsed)), [
  { start: 1, end: 3, text: "Gol de cabeza", x: 50, y: 8, size: 60, voice: "Relator" }
], "export round-trips speaker and text");

// 3. A cue with no speaker exports and parses with no voice key (no regression).
context.editorCues.length = 0;
context.editorCues.push({ id: 2, start: 0, end: 1, text: "Sin relator", x: 50, y: 8, size: 60 });
const plain = api.buildVtt();
assert.doesNotMatch(plain, /<v /, "no speaker emits no <v> tag");
assert.deepEqual(JSON.parse(JSON.stringify(api.parseVttCues(plain))), [
  { start: 0, end: 1, text: "Sin relator", x: 50, y: 8, size: 60 }
], "no-speaker cue has no voice key");

// 4. Externally authored voice syntax: classes and </v> close tag are handled.
const external = api.parseVttCues(
  "WEBVTT\n\n00:00:04.000 --> 00:00:06.000\n<v.loud Entrenador>Cambio tactico</v>\n"
);
assert.deepEqual(JSON.parse(JSON.stringify(external[0])), {
  start: 4, end: 6, text: "Cambio tactico", x: 50, y: 8, size: 60, voice: "Entrenador"
}, "voice classes and trailing </v> are stripped");

// 5. Reserved characters in the speaker name survive the round-trip.
context.editorCues.length = 0;
context.editorCues.push({ id: 3, start: 2, end: 4, text: "Falta", x: 50, y: 8, size: 60, voice: "A & B" });
const ampExport = api.buildVtt();
assert.match(ampExport, /<v A &amp; B>Falta/, "speaker name is entity-escaped on export");
assert.equal(api.parseVttCues(ampExport)[0].voice, "A & B", "escaped speaker name decodes on import");

// 6. The speaker persists through localStorage save/restore.
context.editorCues.length = 0;
context.editorCues.push({ id: 4, start: 5, end: 7, text: "Tarjeta", x: 50, y: 8, size: 60, voice: "Arbitro" });
let stored = "";
context.localStorage = { getItem: () => stored, setItem: (_k, v) => { stored = v; } };
api.saveEditorCues();
assert.match(stored, /"voice":"Arbitro"/, "speaker is written to storage");
context.editorCues.length = 0;
const restored = api.loadPersistedCues();
assert.equal(restored[0].voice, "Arbitro", "speaker is restored from storage");

// 7. A cue saved without a speaker writes no voice key.
context.editorCues.length = 0;
context.editorCues.push({ id: 5, start: 0, end: 1, text: "x", x: 50, y: 8, size: 60 });
api.saveEditorCues();
assert.doesNotMatch(stored, /voice/, "no-speaker cue is stored without a voice key");

// UI / handler wiring assertions against the shipped source.
assert.match(source, /<label class="vtt-editor__voice">Speaker \(optional\)<input name="voice" type="text"/, "form exposes a speaker input");
assert.match(source, /const voice = form\.elements\.voice\.value\.trim\(\);/, "submit reads the speaker field");
assert.match(source, /editorCues\.push\(\{ id: nextCueId\+\+, start, end, text, x, y, size, voice, align, name, region \}\);/, "new cue stores the speaker");
assert.match(source, /Object\.assign\(cue, \{ start, end, text, x, y, size, voice, align, name, region \}\);/, "cue update stores the speaker");
assert.match(source, /form\.elements\.voice\.value = cueVoice\(cue\);/, "editing a cue loads its speaker into the form");
assert.match(source, /\$\{cueVoice\(cue\) \? `\$\{cueVoice\(cue\)\}: ` : ""\}\$\{cue\.text\}/, "list summary shows the speaker");

console.log("cue voice label verification: pass");
