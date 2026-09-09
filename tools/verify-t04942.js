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

const context = { clamp: (n, min, max) => Math.min(max, Math.max(min, n)) };
vm.runInNewContext(`${functionSource("retimeCueFromTimeline")}\nthis.retime = retimeCueFromTimeline;`, context);

const original = {
  id: 7, start: 2, end: 4.5, text: "Goal", x: 20, y: 70, size: 40,
  voice: "Commentator", name: "goal-1", align: "end"
};
const moved = context.retime(original, 6.125, 12);
assert.deepEqual(
  JSON.parse(JSON.stringify(moved)),
  { ...original, start: 6.125, end: 8.625 },
  "drag retimes both boundaries and preserves duration plus metadata"
);
assert.deepEqual(original, {
  id: 7, start: 2, end: 4.5, text: "Goal", x: 20, y: 70, size: 40,
  voice: "Commentator", name: "goal-1", align: "end"
}, "retime does not mutate the source cue");
assert.equal(context.retime(original, -3, 12).start, 0, "drag clamps at zero");
assert.deepEqual(
  JSON.parse(JSON.stringify(context.retime(original, 11, 12))),
  { ...original, start: 9.5, end: 12 },
  "drag clamps the cue end to known video duration"
);
assert.equal(context.retime({ ...original, end: 2 }, 1, 12), null, "invalid duration is rejected");
assert.equal(context.retime(original, 0, 2), null, "a cue longer than the video is rejected");
assert.equal(context.retime(original, NaN, 12), null, "non-finite start is rejected");

const spatialStart = source.indexOf("  const cueSpatial =");
const spatialEnd = source.indexOf("\n\n  function parseVttTimestamp", spatialStart);
const exportContext = {
  editorCues: [],
  clamp: context.clamp,
  vttTimestamp(seconds) {
    const ms = Math.max(0, Math.round(seconds * 1000));
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
vm.createContext(exportContext);
vm.runInContext(
  `${source.slice(spatialStart, spatialEnd)}\n${functionSource("parseVttTimestamp")}\n${functionSource("parseVttCues")}\n${functionSource("saveEditorCues")}\nthis.api={buildVtt,parseVttCues,saveEditorCues};`,
  exportContext
);

const baselineCue = { id: 1, start: 1, end: 3, text: "Goal", x: 50, y: 8, size: 60 };
exportContext.editorCues.push(baselineCue);
const exported = exportContext.api.buildVtt();
assert.equal(
  exported,
  "WEBVTT\n\n00:00:01.000 --> 00:00:03.000 line:8%,center position:50%,center size:60% align:center\nGoal\n",
  "unused drag feature leaves export byte-identical"
);
const parsed = exportContext.api.parseVttCues(exported);
exportContext.editorCues.length = 0;
exportContext.editorCues.push({ id: 1, ...parsed[0] });
assert.equal(exportContext.api.buildVtt(), exported, "export parses and round-trips byte-identically");
let stored = "";
exportContext.localStorage = { setItem: (_key, value) => { stored = value; } };
exportContext.api.saveEditorCues();
assert.doesNotMatch(stored, /timeline|drag|retime/i, "persistence has no drag feature metadata");

assert.match(source, /className = "vtt-editor__timeline"/, "cue list renders a timeline control");
assert.match(source, /type="range"[^>]+data-action="timeline-retime"/, "timeline uses a native range input");
assert.match(source, /retimeCueFromTimeline\(cue, Number\(slider\.value\), video\.duration\)/, "input uses shipped retime helper");
assert.match(source, /Object\.assign\(cue, retimed\)/, "drag applies retimed boundaries");
assert.match(source, /saveEditorCues\(\);/, "existing persistence path remains wired");
const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
assert.match(css, /\.vtt-editor__timeline/, "timeline control is styled");

console.log("T-049.42 drag-to-retime verification: pass");
