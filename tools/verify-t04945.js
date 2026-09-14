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

const context = {};
vm.runInNewContext(
  `${functionSource("cueTextMatches")}\n${functionSource("nextCueTextMatch")}\nthis.api={cueTextMatches,nextCueTextMatch};`,
  context
);

const cues = [
  { id: 1, text: "Opening kickoff" },
  { id: 2, text: "GOAL by Rivera" },
  { id: 3, text: "Goal ruled out" },
  { id: 4, text: "Full time" }
];
const matches = context.api.cueTextMatches(cues, "  goal ");
assert.deepEqual(Array.from(matches, (cue) => cue.id), [2, 3], "search is trimmed, case-insensitive, and keeps list order");
assert.equal(context.api.cueTextMatches(cues, "missing").length, 0, "unmatched text returns no cues");
assert.deepEqual(Array.from(context.api.cueTextMatches(cues, ""), (cue) => cue.id), [1, 2, 3, 4], "an empty query shows every cue");
assert.deepEqual(cues, [
  { id: 1, text: "Opening kickoff" },
  { id: 2, text: "GOAL by Rivera" },
  { id: 3, text: "Goal ruled out" },
  { id: 4, text: "Full time" }
], "search does not mutate cues");

assert.equal(context.api.nextCueTextMatch(cues, "goal", null, "next").cue.id, 2, "next starts at the first match");
assert.equal(context.api.nextCueTextMatch(cues, "goal", null, "previous").cue.id, 3, "previous starts at the last match");
assert.equal(context.api.nextCueTextMatch(cues, "goal", 2, "next").cue.id, 3, "next advances through matches");
const wrapped = context.api.nextCueTextMatch(cues, "goal", 3, "next");
assert.equal(wrapped.cue.id, 2, "next wraps to the first match");
assert.equal(wrapped.position, 1, "navigation reports the visible match position");
assert.equal(wrapped.total, 2, "navigation reports the total match count");
assert.equal(context.api.nextCueTextMatch(cues, "none", null, "next"), null, "navigation rejects an empty result set");

assert.match(source, /type="search"[^>]+data-cue-search/, "editor includes a native cue-text search field");
assert.match(source, /data-search-direction="previous"/, "editor includes previous-match navigation");
assert.match(source, /data-search-direction="next"/, "editor includes next-match navigation");
assert.match(functionSource("renderEditorCues"), /visibleCueIds\.has\(cue\.id\)/, "list rendering filters non-matching cues");
assert.match(functionSource("renderEditorCues"), /of \$\{editorCues\.length\} cues match/, "filtered list reports match count against total cues");
assert.match(source, /item\.scrollIntoView\(\{ block: "nearest" \}\)/, "match navigation reveals the selected list item");
assert.match(source, /scrollToVideoTime\(match\.cue\.start\)/, "match navigation jumps the video to the cue start");
assert.doesNotMatch(functionSource("saveEditorCues"), /search|query/i, "search state is not persisted with cues");
assert.doesNotMatch(functionSource("buildVtt"), /search|query/i, "search state does not affect WebVTT export");
assert.match(css, /\.vtt-editor__search \{ justify-content: flex-start; align-items: end; \}/, "search controls use the shipped editor layout");

console.log("T-049.45 cue-text search verification: pass");
