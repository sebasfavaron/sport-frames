#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

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

const helperContext = {};
vm.runInNewContext(`${functionSource("moveCueInList")}\nthis.moveCueInList = moveCueInList;`, helperContext);
const cues = [
  { id: 1, start: 8, end: 9, text: "Late", x: 10, voice: "A" },
  { id: 2, start: 1, end: 2, text: "Early", x: 20, name: "early" },
  { id: 3, start: 4, end: 5, text: "Middle", align: "end" }
];
const movedUp = helperContext.moveCueInList(cues, 3, "up");
assert.deepEqual(Array.from(movedUp, cue => cue.id), [1, 3, 2], "moves a cue up one list position");
assert.deepEqual(JSON.parse(JSON.stringify(movedUp[1])), cues[2], "preserves all cue data");
assert.deepEqual(cues.map(cue => cue.id), [1, 2, 3], "does not mutate the source array");
assert.deepEqual(Array.from(helperContext.moveCueInList(cues, 1, "down"), cue => cue.id), [2, 1, 3], "moves a cue down one list position");
assert.equal(helperContext.moveCueInList(cues, 1, "up"), null, "rejects movement above the list");
assert.equal(helperContext.moveCueInList(cues, 3, "down"), null, "rejects movement below the list");
assert.equal(helperContext.moveCueInList(cues, 99, "down"), null, "rejects an unknown cue");
assert.equal(helperContext.moveCueInList(cues, 2, "sideways"), null, "rejects an unknown direction");

const spatialStart = source.indexOf("  const cueSpatial =");
const spatialEnd = source.indexOf("\n\n  function parseVttTimestamp", spatialStart);
let stored = "";
const exportContext = {
  editorCues: movedUp,
  clamp: (n, min, max) => Math.min(max, Math.max(min, n)),
  localStorage: { setItem: (_key, value) => { stored = value; } },
  VTT_EDITOR_STORAGE_KEY: "sport-frames:vtt-editor-cues",
  CUE_TEXT_ALIGN_VALUES: ["start", "center", "end"],
  setEditorStatus() {},
  vttTimestamp(seconds) {
    const ms = Math.round(seconds * 1000);
    return `00:00:${String(Math.floor(ms / 1000)).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  }
};
vm.createContext(exportContext);
vm.runInContext(`${source.slice(spatialStart, spatialEnd)}\n${functionSource("saveEditorCues")}\nthis.api={buildVtt,saveEditorCues};`, exportContext);
exportContext.api.saveEditorCues();
assert.deepEqual(JSON.parse(stored).map(cue => cue.text), ["Late", "Middle", "Early"], "localStorage preserves manual list order");
const exported = exportContext.api.buildVtt();
assert.ok(exported.indexOf("Early") < exported.indexOf("Middle"), "export sorts earlier cue before middle cue");
assert.ok(exported.indexOf("Middle") < exported.indexOf("Late"), "export stays chronological after manual reorder");

assert.match(source, /editorCues\.forEach\(\(cue, cueIndex\) =>/, "list renders manual array order");
assert.match(source, /data-action="move-up"[^>]*aria-label="Move cue up in list"/, "list has an accessible move-up action");
assert.match(source, /data-action="move-down"[^>]*aria-label="Move cue down in list"/, "list has an accessible move-down action");
assert.match(source, /moveCueInList\(editorCues, id, direction\)/, "click path uses shipped reorder helper");
assert.match(source, /editorCues = reordered;[\s\S]*?renderEditorCues\(\);[\s\S]*?saveEditorCues\(\);/, "successful reorder renders and persists");
assert.match(source, /const chronologicalIndex = sortedCues\.findIndex/, "timing actions still derive chronological position");

console.log("T-049.43 cue-list reorder verification: pass");
