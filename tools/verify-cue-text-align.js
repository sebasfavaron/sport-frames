#!/usr/bin/env node
"use strict";

// T-049.38 - per-cue text alignment via the standard WebVTT `align:` cue setting.
// Extracts the shipped cueAlign / cueSettings / buildVtt / parseVttCues / persistence
// helpers verbatim and proves a non-default alignment round-trips through export,
// native-syntax parsing, re-import, and localStorage, that a centered cue stays
// byte-identical (no `align` key), and that `left`/`right` normalise on parse.
// Also asserts the form select, submit read, edit-load, duplicate, merge, and
// live-preview wiring against the shipped source.

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
  source.slice(spatialStart, spatialEnd).includes("const cueAlign ="),
  "cueAlign lives in the extracted region"
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
    `this.api={buildVtt,parseVttCues,loadPersistedCues,saveEditorCues,cueAlign};`,
  context
);

const { api } = context;

// 1. A non-default alignment is exported in the standard `align:` cue setting.
context.editorCues.push({ id: 1, start: 1, end: 3, text: "Tiro libre", x: 50, y: 8, size: 60, align: "end" });
const exported = api.buildVtt();
assert.match(exported, / size:60% align:end\n/, "align:end exported in the settings line");

// 2. Parsing that export recovers the alignment.
assert.deepEqual(JSON.parse(JSON.stringify(api.parseVttCues(exported))), [
  { start: 1, end: 3, text: "Tiro libre", x: 50, y: 8, size: 60, align: "end" }
], "export round-trips the alignment");

// 3. A centered cue exports with `align:center` and no `align` key survives parsing.
context.editorCues.length = 0;
context.editorCues.push({ id: 2, start: 0, end: 1, text: "Centro", x: 50, y: 8, size: 60 });
const centered = api.buildVtt();
assert.match(centered, / align:center\n/, "centered cue still emits align:center");
assert.deepEqual(JSON.parse(JSON.stringify(api.parseVttCues(centered))), [
  { start: 0, end: 1, text: "Centro", x: 50, y: 8, size: 60 }
], "centered cue parses with no align key");

// 4. An invalid align value on a cue object falls back to center on export.
context.editorCues.length = 0;
context.editorCues.push({ id: 3, start: 0, end: 1, text: "x", x: 50, y: 8, size: 60, align: "middle" });
assert.match(api.buildVtt(), / align:center\n/, "unknown align value falls back to center");
assert.equal(context.api.cueAlign({ align: "left" }), "center", "cueAlign only accepts start/center/end");

// 5. Externally authored `align:left` / `align:right` normalise to start / end.
const left = api.parseVttCues("WEBVTT\n\n00:00:00.000 --> 00:00:01.000 align:left\nIzq\n");
assert.equal(left[0].align, "start", "align:left normalises to start");
const right = api.parseVttCues("WEBVTT\n\n00:00:02.000 --> 00:00:03.000 line:8%,center align:right\nDer\n");
assert.equal(right[0].align, "end", "align:right normalises to end");

// 6. Alignment persists through localStorage save/restore; centered writes no key.
context.editorCues.length = 0;
context.editorCues.push({ id: 4, start: 5, end: 7, text: "Corner", x: 50, y: 8, size: 60, align: "start" });
let stored = "";
context.localStorage = { getItem: () => stored, setItem: (_k, v) => { stored = v; } };
api.saveEditorCues();
assert.match(stored, /"align":"start"/, "alignment is written to storage");
context.editorCues.length = 0;
assert.equal(api.loadPersistedCues()[0].align, "start", "alignment is restored from storage");

context.editorCues.length = 0;
context.editorCues.push({ id: 5, start: 0, end: 1, text: "y", x: 50, y: 8, size: 60 });
api.saveEditorCues();
assert.doesNotMatch(stored, /align/, "centered cue is stored without an align key");

// UI / handler wiring assertions against the shipped source.
assert.match(source, /<label class="vtt-editor__align">Text alignment<select name="align">/, "form exposes a text-alignment select");
assert.match(source, /const align = CUE_TEXT_ALIGN_VALUES\.includes\(form\.elements\.align\.value\)/, "submit validates and reads the alignment");
assert.match(source, /editorCues\.push\(\{ id: nextCueId\+\+, start, end, text, x, y, size, voice, align, name, region \}\);/, "new cue stores the alignment");
assert.match(source, /Object\.assign\(cue, \{ start, end, text, x, y, size, voice, align, name, region \}\);/, "cue update stores the alignment");
assert.match(source, /form\.elements\.align\.value = cueAlign\(cue\);/, "editing a cue loads its alignment into the form");
assert.match(source, /if \(CUE_TEXT_ALIGN_VALUES\.includes\(cue\.align\) && cue\.align !== "center"\) clone\.align = cue\.align;/, "duplicate carries the alignment");
assert.match(source, /if \(CUE_TEXT_ALIGN_VALUES\.includes\(cue\.align\) && cue\.align !== "center"\) merged\.align = cue\.align;/, "merge carries the first cue's alignment");
assert.match(source, /element\.style\.textAlign = cue\.align \|\| "center";/, "live preview applies the alignment");
assert.match(source, /\.\.\.cuePreviewSpatial\(cue\), align: cueAlign\(cue\) \}\)\);/, "editor-cue preview passes the alignment");

console.log("cue text-align verification: pass");
