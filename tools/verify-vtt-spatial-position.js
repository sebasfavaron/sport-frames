#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const path = require("node:path");
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
  setEditorStatus() {}
};
vm.createContext(context);
vm.runInContext(`${source.slice(spatialStart, spatialEnd)}\n${functionSource("parseVttTimestamp")}\n${functionSource("parseVttCues")}\n${functionSource("loadPersistedCues")}\n${functionSource("saveEditorCues")}\nthis.api={buildVtt,parseVttCues,loadPersistedCues,saveEditorCues};`, context);

const original = [{ id: 9, start: 1.25, end: 3.5, text: "Move me", x: 23, y: 71, size: 42 }];
context.editorCues.push(...original);
const exported = context.api.buildVtt();
assert.match(exported, /00:00:01\.250 --> 00:00:03\.500 line:71%,center position:23%,center size:42% align:center/);
const parsed = context.api.parseVttCues(exported);
assert.deepEqual(JSON.parse(JSON.stringify(parsed)), [{ start: 1.25, end: 3.5, text: "Move me", x: 23, y: 71, size: 42 }]);

let stored = "";
context.localStorage = {
  getItem: () => stored,
  setItem: (_key, value) => { stored = value; }
};
context.api.saveEditorCues();
context.editorCues.length = 0;
const restored = context.api.loadPersistedCues();
assert.deepEqual(JSON.parse(JSON.stringify(restored)), [{ start: 1.25, end: 3.5, text: "Move me", x: 23, y: 71, size: 42 }]);
context.editorCues.push(...restored.map((cue, index) => ({ id: index + 1, ...cue })));
assert.equal(context.api.buildVtt(), exported);

const legacy = context.api.parseVttCues("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nLegacy\n");
assert.deepEqual(JSON.parse(JSON.stringify(legacy[0])), { start: 0, end: 1, text: "Legacy", x: 50, y: 8, size: 60 });
assert.match(source, /form\.addEventListener\("input"[\s\S]*updateVttAnnotation\(\)/);
assert.match(source, /className = "scrolly__vtt-cue"/);
console.log("PASS spatial WebVTT export, parse, localStorage reload, re-export, and live-preview wiring");
