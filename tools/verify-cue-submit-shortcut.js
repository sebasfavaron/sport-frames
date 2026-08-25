#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = script.indexOf("  function isCueSubmitShortcut(event, form) {");
const end = script.indexOf("\n  function setEditorStatus", start);
assert.notEqual(start, -1, "isCueSubmitShortcut exists");
assert.notEqual(end, -1, "submit shortcut extraction boundary exists");

const context = {};
vm.runInNewContext(`${script.slice(start, end)}\nthis.isCueSubmitShortcut = isCueSubmitShortcut;`, context);
const inside = {};
const outside = {};
const form = { contains: (target) => target === inside };
const event = (overrides = {}) => ({
  key: "Enter",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  repeat: false,
  target: inside,
  ...overrides
});

assert.equal(context.isCueSubmitShortcut(event(), form), true, "Ctrl+Enter inside the form submits");
assert.equal(context.isCueSubmitShortcut(event({ ctrlKey: false, metaKey: true }), form), true, "Cmd+Enter inside the form submits");
assert.equal(context.isCueSubmitShortcut(event({ target: outside }), form), false, "shortcut outside the form is ignored");
assert.equal(context.isCueSubmitShortcut(event({ ctrlKey: false }), form), false, "plain Enter is ignored");
assert.equal(context.isCueSubmitShortcut(event({ key: "NumpadEnter" }), form), false, "unrelated key values are ignored");
assert.equal(context.isCueSubmitShortcut(event({ altKey: true }), form), false, "Alt-modified shortcut is ignored");
assert.equal(context.isCueSubmitShortcut(event({ repeat: true }), form), false, "key repeat is ignored");

assert.match(script, /<kbd>Ctrl\/Cmd<\/kbd>\+<kbd>Enter<\/kbd> save cue/, "visible shortcut map documents the action");
assert.match(
  script,
  /form\.addEventListener\("keydown", \(event\) => \{\s*if \(isCueSubmitShortcut\(event, form\)\) \{\s*event\.preventDefault\(\);\s*form\.requestSubmit\(\);\s*return;\s*\}/,
  "form keydown listener prevents the shortcut keystroke and invokes native form submission before any other keydown handling"
);
assert.match(script, /form\.addEventListener\("submit", \(event\) => \{/, "existing submit path remains the save path");

console.log("cue submit shortcut verification: pass");
