#!/usr/bin/env node

// T-049.41 regression check: per-cue "Gap before next cue" indicator.
// The editor flags the cue whose end leaves an uncovered gap longer than
// CUE_GAP_THRESHOLD_SECONDS before the next chronological cue, and reports the
// gap count in the toolbar. The feature is display-only: it must not change the
// exported .vtt payload or the persisted cue shape.

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

// --- detector logic, extracted verbatim ---------------------------------------

const thresholdMatch = /\n  const CUE_GAP_THRESHOLD_SECONDS = ([\d.]+);/.exec(source);
assert.notEqual(thresholdMatch, null, "CUE_GAP_THRESHOLD_SECONDS constant exists");
const THRESHOLD = Number(thresholdMatch[1]);
assert.ok(THRESHOLD > 0, "gap threshold is a positive number of seconds");

const context = {};
vm.runInNewContext(
  `const CUE_GAP_THRESHOLD_SECONDS = ${thresholdMatch[1]};\n${functionSource("findCueGaps")}\nthis.findCueGaps = findCueGaps;`,
  context
);

const cue = (id, start, end) => ({ id, start, end });
const result = (cues) => {
  const gaps = context.findCueGaps(cues);
  return { ids: [...gaps.cueIds].sort((a, b) => a - b), count: gaps.gapCount };
};

// empty / single cue: nothing to compare
assert.deepEqual(result([]), { ids: [], count: 0 }, "no cues -> no gaps");
assert.deepEqual(result([cue(1, 0, 5)]), { ids: [], count: 0 }, "single cue -> no gaps");

// contiguous cues: zero gap
assert.deepEqual(result([cue(1, 0, 2), cue(2, 2, 4)]), { ids: [], count: 0 }, "touching cues -> no gap");

// gap exactly at the threshold is not flagged (strict >)
assert.deepEqual(
  result([cue(1, 0, 2), cue(2, 2 + THRESHOLD, 6)]),
  { ids: [], count: 0 },
  "gap exactly at threshold is within tolerance"
);

// gap beyond the threshold flags the earlier (frontier) cue
assert.deepEqual(
  result([cue(1, 0, 2), cue(2, 2 + THRESHOLD + 0.001, 6)]),
  { ids: [1], count: 1 },
  "gap over threshold flags the cue that precedes the gap"
);

// unsorted input is handled
assert.deepEqual(
  result([cue(2, 20, 25), cue(1, 0, 2)]),
  { ids: [1], count: 1 },
  "unsorted cues are sorted before gap detection"
);

// overlapping cues never count as a gap
assert.deepEqual(
  result([cue(1, 0, 10), cue(2, 3, 12)]),
  { ids: [], count: 0 },
  "overlapping cues produce a negative delta, not a gap"
);

// a fully-contained cue must not create a phantom gap after it: coverage
// frontier is the max end seen so far, not the previous cue's end
assert.deepEqual(
  result([cue(1, 0, 10), cue(2, 2, 3), cue(3, 10.5, 12)]),
  { ids: [], count: 0 },
  "cue contained inside a longer cue does not open a gap"
);
assert.deepEqual(
  result([cue(1, 0, 10), cue(2, 2, 3), cue(3, 12, 13)]),
  { ids: [1], count: 1 },
  "gap is measured against the coverage frontier (cue 1's end), and cue 1 is flagged"
);

// multiple independent gaps are each counted
assert.deepEqual(
  result([cue(1, 0, 1), cue(2, 5, 6), cue(3, 10, 11)]),
  { ids: [1, 2], count: 2 },
  "each qualifying gap is counted and its preceding cue flagged"
);

// --- export / persistence must be untouched by this display-only feature -----

const spatialStart = source.indexOf("  const cueSpatial =");
const spatialEnd = source.indexOf("\n\n  function parseVttTimestamp", spatialStart);
const exportContext = {
  editorCues: [],
  clamp: (n, min, max) => Math.min(max, Math.max(min, n)),
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
  `${source.slice(spatialStart, spatialEnd)}\n${functionSource("parseVttTimestamp")}\n${functionSource("parseVttCues")}\n${functionSource("loadPersistedCues")}\n${functionSource("saveEditorCues")}\nthis.api={buildVtt,parseVttCues,loadPersistedCues,saveEditorCues};`,
  exportContext
);

// two cues with a large gap between them - the payload a native TextTrack sees
const cues = [
  { id: 1, start: 0.5, end: 1.5, text: "Kickoff", x: 50, y: 8, size: 60 },
  { id: 2, start: 9, end: 11, text: "Goal", x: 50, y: 8, size: 60 }
];
exportContext.editorCues.push(...cues);
const exported = exportContext.api.buildVtt();

// round-trips losslessly through export -> parse -> re-import -> re-export
const reparsed = exportContext.api.parseVttCues(exported);
exportContext.editorCues.length = 0;
exportContext.editorCues.push(...reparsed.map((c, i) => ({ id: i + 1, ...c })));
assert.equal(exportContext.api.buildVtt(), exported, "gap indicator does not perturb export round-trip");

// byte-identical export against a hand-written reference (feature at default)
assert.equal(
  exported,
  "WEBVTT\n\n00:00:00.500 --> 00:00:01.500 line:8%,center position:50%,center size:60% align:center\nKickoff\n\n00:00:09.000 --> 00:00:11.000 line:8%,center position:50%,center size:60% align:center\nGoal\n",
  "export payload is unchanged by the gap indicator"
);

// persisted shape carries no gap-related key
let stored = "";
exportContext.localStorage = { getItem: () => stored, setItem: (_k, v) => { stored = v; } };
exportContext.api.saveEditorCues();
assert.ok(!/gap/i.test(stored), "persisted cues contain no gap metadata");

// --- wiring assertions ------------------------------------------------------

assert.match(source, /const cueGaps = findCueGaps\(editorCues\)/, "render path computes gap warnings");
assert.match(source, /cueGaps\.cueIds\.has\(cue\.id\)/, "affected list items are marked");
assert.match(source, /item\.classList\.add\("has-gap-after"\)/, "gap list item gets a class");
assert.match(source, /"Gap before next cue"/, "per-cue gap label is rendered");
assert.match(source, /class="vtt-editor__gap-warning" role="status" hidden/, "aggregate gap warning is accessible and initially hidden");
assert.match(source, /gapWarning\.hidden = cueGaps\.gapCount === 0/, "aggregate warning visibility follows gap count");

const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
assert.match(css, /\.vtt-editor__gap-label/, "gap label is styled");
assert.match(css, /\.vtt-editor__list li\.has-gap-after/, "gap list item is styled");

console.log("T-049.41 gap indicator verification: pass");
