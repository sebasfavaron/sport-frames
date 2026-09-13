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

const context = {
  clamp: (n, min, max) => Math.min(max, Math.max(min, n)),
  parseVttCues(text) {
    return [...text.matchAll(/\d{2}:\d{2}:(\d+)\.(\d{3}) --> \d{2}:\d{2}:(\d+)\.(\d{3})/g)].map((match) => ({
      start: Number(match[1]) + Number(match[2]) / 1000,
      end: Number(match[3]) + Number(match[4]) / 1000
    }));
  }
};
vm.runInNewContext(
  `${functionSource("retimeCueFromTimeline")}\n${functionSource("referenceMarkersFromVtt")}\n${functionSource("snapRetimeToMarkers")}\nthis.api={referenceMarkersFromVtt,snapRetimeToMarkers};`,
  context
);

const markers = context.api.referenceMarkersFromVtt(
  "WEBVTT\n\n00:00:02.000 --> 00:00:03.500\nTODO\n\n00:00:03.500 --> 00:00:07.000\nTODO\n"
);
assert.deepEqual(Array.from(markers), [2, 3.5, 7], "imports unique, sorted cue boundaries as reference markers");
const cue = { id: 1, start: 1, end: 2, text: "Goal", x: 30 };
assert.deepEqual(
  JSON.parse(JSON.stringify(context.api.snapRetimeToMarkers(cue, 2.18, 10, markers, 0.25))),
  { ...cue, start: 2, end: 3 },
  "snaps the moved cue start to a nearby marker and preserves duration plus metadata"
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.api.snapRetimeToMarkers(cue, 2.62, 10, markers, 0.25))),
  { ...cue, start: 2.5, end: 3.5 },
  "snaps the moved cue end to a nearby marker"
);
assert.equal(context.api.snapRetimeToMarkers(cue, 4, 10, markers, 0.25).start, 4, "leaves movement outside tolerance unchanged");
assert.equal(context.api.snapRetimeToMarkers(cue, 6.9, 7, markers, 0.25).end, 7, "keeps a snapped cue within video duration");
assert.deepEqual(cue, { id: 1, start: 1, end: 2, text: "Goal", x: 30 }, "does not mutate the source cue");

assert.match(source, /data-import-markers/, "editor has a separate reference-marker VTT input");
assert.match(source, /data-snap-markers checked disabled/, "snapping is optional and disabled until markers exist");
assert.match(source, /referenceMarkers = referenceMarkersFromVtt\(await file\.text\(\)\)/, "reference import uses shipped parser path");
assert.match(source, /cues were not imported/, "UI states that marker import does not add editable cues");
assert.match(source, /snapRetimeToMarkers\(cue, Number\(slider\.value\)/, "drag retiming uses marker snapping");
assert.match(source, /snapRetimeToMarkers\(shifted, shifted\.start/, "keyboard nudging uses marker snapping");
assert.doesNotMatch(functionSource("saveEditorCues"), /referenceMarkers|marker/, "reference markers do not enter persisted cue state");
assert.doesNotMatch(functionSource("buildVtt"), /referenceMarkers|marker/, "reference markers do not enter exported WebVTT");

console.log("T-049.44 reference-marker snapping verification: pass");
