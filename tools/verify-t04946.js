#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

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

const dependencies = [
  "findCueOverlaps",
  "findNearDuplicateCues",
  "findCuesPastVideoEnd",
  "findShortCues",
  "findEmptyCueBodies",
  "findFastReadingCues",
  "findCueBodiesWithBlankLines",
  "findCueGaps",
  "findCueValidationIssues"
];

const context = { SHORT_CUE_THRESHOLD_SECONDS: 0.15, NEAR_DUPLICATE_CUE_TOLERANCE_SECONDS: 0.1, MAX_CUE_CHARACTERS_PER_SECOND: 20, CUE_GAP_THRESHOLD_SECONDS: 1 };
vm.createContext(context);
vm.runInContext(
  `${dependencies.map(functionSource).join("\n")}\nthis.api={findCueValidationIssues};`,
  context
);

const cue = (id, start, end, text) => ({ id, start, end, text });
// vm-context results are objects/arrays from another realm; JSON round-trip
// normalises them into ordinary objects in this realm so assert.deepEqual
// (which is deepStrictEqual and checks prototypes) can compare them.
const plainIssues = (cues, duration) => JSON.parse(JSON.stringify(context.api.findCueValidationIssues(cues, duration)));

// Baseline: no cues have issues.
const clean = [cue(1, 0, 2, "Kickoff"), cue(2, 3, 5, "Corner")];
assert.deepEqual(plainIssues(clean, NaN), [], "clean cues produce no validation issues");

// Overlap: cue 1 and cue 2 overlap.
const overlapping = [cue(1, 0, 3, "Kickoff"), cue(2, 2, 4, "Corner")];
const overlapIssues = plainIssues(overlapping, NaN);
assert.equal(overlapIssues.length, 2, "both overlapping cues are flagged");
assert.ok(overlapIssues.every((entry) => entry.labels.includes("Overlaps another cue")), "overlap label attached to both cues");

// Near-duplicate timing.
const duplicates = [cue(1, 10, 12, "Goal"), cue(2, 10.01, 12.02, "GOAL")];
const duplicateIssues = plainIssues(duplicates, NaN);
assert.ok(duplicateIssues.every((entry) => entry.labels.includes("Near-duplicate timing")), "near-duplicate label attached to both cues");

// Extends past video end.
const pastEnd = [cue(1, 8, 12, "Full time")];
assert.deepEqual(plainIssues(pastEnd, 10)[0].labels, ["Extends past video end"], "past-video-end label attached when duration is known");
assert.deepEqual(plainIssues(pastEnd, NaN), [], "past-video-end check is skipped without a known duration");

// Very short cue.
const shortCue = [cue(1, 0, 0.1, "Hi")];
assert.deepEqual(plainIssues(shortCue, NaN)[0].labels, ["Very short cue"], "short-cue label attached");

// Empty body.
const emptyBody = [cue(1, 0, 2, "   ")];
assert.deepEqual(plainIssues(emptyBody, NaN)[0].labels, ["Needs annotation text"], "empty-body label attached");

// High reading speed: many characters in a short duration.
const fastReading = [cue(1, 0, 1, "x".repeat(40))];
assert.deepEqual(plainIssues(fastReading, NaN)[0].labels, ["High reading speed"], "reading-speed label attached");

// Blank line splitting a cue body.
const blankLine = [cue(1, 0, 2, "Line one\n\nLine two")];
assert.deepEqual(plainIssues(blankLine, NaN)[0].labels, ["Blank line splits WebVTT cue"], "blank-line label attached");

// Gap before next cue.
const gapped = [cue(1, 0, 2, "Kickoff"), cue(2, 10, 12, "Corner")];
const gapIssues = plainIssues(gapped, NaN);
assert.deepEqual(gapIssues.map((entry) => entry.cue.id), [1], "only the cue owning the coverage frontier is flagged for the gap");
assert.deepEqual(gapIssues[0].labels, ["Gap before next cue"], "gap label attached to the frontier cue");

// A cue with multiple simultaneous issues reports every applicable label.
const multi = [cue(1, 0, 0.1, ""), cue(2, 0.05, 0.15, "y")];
const multiIssues = plainIssues(multi, NaN);
const first = multiIssues.find((entry) => entry.cue.id === 1);
assert.ok(first.labels.includes("Overlaps another cue"), "multi-issue cue includes overlap");
assert.ok(first.labels.includes("Very short cue"), "multi-issue cue includes short-cue");
assert.ok(first.labels.includes("Needs annotation text"), "multi-issue cue includes empty-body");

// Result is sorted by cue start and does not mutate input.
const unsorted = [cue(2, 5, 5.05, ""), cue(1, 0, 0.05, "")];
const unsortedIssues = plainIssues(unsorted, NaN);
assert.deepEqual(unsortedIssues.map((entry) => entry.cue.id), [1, 2], "issues are reported in cue start order");
assert.deepEqual(unsorted, [cue(2, 5, 5.05, ""), cue(1, 0, 0.05, "")], "the source cue array is not mutated");

assert.doesNotMatch(functionSource("buildVtt"), /validationIssues|validation-summary/i, "validation summary does not affect WebVTT export");
assert.doesNotMatch(functionSource("saveEditorCues"), /validationIssues|validation-summary/i, "validation summary is not persisted with cues");
assert.match(source, /class="vtt-editor__validation-summary"/, "editor includes a validation summary panel");
assert.match(source, /class="vtt-editor__validation-summary-list"/, "editor includes a validation summary list");
assert.match(functionSource("renderEditorCues"), /findCueValidationIssues\(editorCues, video\.duration\)/, "rendering computes validation issues from the current cues and known video duration");
assert.match(functionSource("renderEditorCues"), /summaryList\.replaceChildren\(\)/, "validation summary list is rebuilt on every render");
assert.match(source, /data-action="validation-jump"/, "each summary entry offers a jump action");
assert.match(source, /\.vtt-editor__validation-summary-list"\)\.addEventListener\("click"/, "validation summary list has a click handler");
assert.match(source, /scrollToVideoTime\(cue\.start\)\s*\n\s*\?\s*`Moved to cue start/, "jump action moves the video to the cue start");
assert.match(css, /\.vtt-editor__validation-summary-list li \{/, "validation summary entries have dedicated styling");

console.log("T-049.46 cue validation summary verification: pass");
