#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function cueTimingNudgeDirection(");
const end = script.indexOf("\n  function adjacentCueInDirection", start);
assert.notEqual(start, -1, "cueTimingNudgeDirection exists");
assert.notEqual(end, -1, "timing nudge helper extraction boundary exists");

const context = {};
vm.runInNewContext(
  `${script.slice(start, end)}\nthis.cueTimingNudgeDirection = cueTimingNudgeDirection; this.nudgeCueTiming = nudgeCueTiming;`,
  context
);

const inside = {};
const outside = {};
const form = { contains: (target) => target === inside };
const event = (overrides = {}) => ({
  key: "ArrowLeft", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false,
  repeat: false, target: inside, ...overrides
});
assert.equal(context.cueTimingNudgeDirection(event(), form), -0.1, "Alt+Left nudges 100ms earlier");
assert.equal(context.cueTimingNudgeDirection(event({ key: "ArrowRight" }), form), 0.1, "Alt+Right nudges 100ms later");
for (const overrides of [
  { altKey: false }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true },
  { repeat: true }, { target: outside }, { key: "ArrowUp" }
]) {
  assert.equal(context.cueTimingNudgeDirection(event(overrides), form), 0, "unsupported key combination is ignored");
}

const cue = { id: 4, start: 1, end: 2.25, text: "Goal", x: 30 };
assert.deepEqual(
  { ...context.nudgeCueTiming(cue, -0.1) },
  { id: 4, start: 0.9, end: 2.15, text: "Goal", x: 30 },
  "earlier nudge preserves duration and cue data"
);
assert.deepEqual(
  { ...context.nudgeCueTiming({ start: 0.2, end: 0.4 }, 0.1) },
  { start: 0.3, end: 0.5 },
  "millisecond rounding avoids floating-point drift"
);
assert.equal(context.nudgeCueTiming({ start: 0.05, end: 1 }, -0.1), null, "nudge before zero is rejected");
assert.equal(context.nudgeCueTiming(cue, Number.NaN), null, "non-finite nudge is rejected");
assert.equal(context.nudgeCueTiming({ start: Number.NaN, end: 1 }, 0.1), null, "incomplete form timing is rejected");
assert.equal(context.nudgeCueTiming({ start: 1, end: 1 }, 0.1), null, "invalid cue duration is rejected");
assert.deepEqual(cue, { id: 4, start: 1, end: 2.25, text: "Goal", x: 30 }, "source cue is not mutated");

assert.match(script, /<kbd>Alt<\/kbd>\+<kbd>←<\/kbd>\/<kbd>→<\/kbd> nudge cue 100ms/, "shortcut map documents timing nudge");
assert.match(script, /const nudge = cueTimingNudgeDirection\(event, form\);/, "form key handler detects timing nudge");
assert.match(script, /form\.elements\.start\.value = shifted\.start\.toFixed\(3\);\s*form\.elements\.end\.value = shifted\.end\.toFixed\(3\);/, "valid nudge updates both timing fields");
assert.match(script, /Cue needs valid timing and cannot move before 0\.000s\./, "invalid nudge explains timing and zero boundary");
assert.match(script, /Save to keep the change\./, "status explains that normal save commits the nudge");

console.log("cue timing nudge verification: pass");
