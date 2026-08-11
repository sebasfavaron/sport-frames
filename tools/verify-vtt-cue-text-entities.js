#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync("script.js", "utf8");
const start = script.indexOf("  function escapeVttCueText(");
const end = script.indexOf("\n  function buildVtt(", start);
assert.notEqual(start, -1, "escapeVttCueText exists");
assert.notEqual(end, -1, "entity helper extraction boundary exists");

const context = {};
vm.runInNewContext(
  `${script.slice(start, end)}\nthis.escapeVttCueText = escapeVttCueText; this.unescapeVttCueText = unescapeVttCueText;`,
  context
);

const cases = [
  ["Team A & Team B", "Team A &amp; Team B"],
  ["score < previous half", "score &lt; previous half"],
  ["5 > 3 shots on target", "5 &gt; 3 shots on target"],
  ["A & B < C > D &lt; literal", "A &amp; B &lt; C &gt; D &amp;lt; literal"],
  ["No reserved characters", "No reserved characters"]
];

for (const [literal, escaped] of cases) {
  const exportedVtt = `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n${context.escapeVttCueText(literal)}\n`;
  const exportedPayload = exportedVtt.split("\n")[3];
  assert.equal(exportedPayload, escaped, `export escapes ${JSON.stringify(literal)}`);
  assert.equal(context.unescapeVttCueText(exportedPayload), literal, "re-import restores exact literal text");
}

assert.match(script, /\\n\$\{escapeVttCueText\(cue\.text\)\}/, "buildVtt uses escaping on cue payload only");
assert.match(script, /text: unescapeVttCueText\(textLines\.join\("\\n"\)\.trim\(\)\)/, "parseVttCues decodes imported payload");
assert.match(script, /summary\.textContent = .*\$\{cue\.text\}/, "editor summary keeps raw text through textContent");
assert.match(script, /element\.textContent = cue\.text/, "live preview keeps raw text through textContent");

console.log("WebVTT cue text entity verification: pass");
