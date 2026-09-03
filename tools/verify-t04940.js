#!/usr/bin/env node
"use strict";

// T-049.40 - copy the complete generated WebVTT file.
// Exercise the shipped clipboard helper and assert that the toolbar handler sends
// the shared full-file buildVtt() result, rather than one cue, to that helper.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const start = source.indexOf("  async function copyVttFile(");
const end = source.indexOf("\n\n  function parseVttTimestamp", start);
assert.notEqual(start, -1, "copyVttFile exists");
assert.notEqual(end, -1, "copyVttFile extraction boundary exists");

const context = {};
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}\nthis.copyVttFile = copyVttFile;`, context);

(async () => {
  const completeFile = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nFirst\n\n00:00:03.000 --> 00:00:04.000\nSecond\n";
  const writes = [];
  const clipboard = { writeText: async (text) => { writes.push(text); } };

  const result = await context.copyVttFile(clipboard, completeFile);
  assert.equal(result, completeFile, "helper resolves with the unchanged complete file");
  assert.deepEqual(writes, [completeFile], "one write contains both cues and the WEBVTT header unchanged");

  await assert.rejects(context.copyVttFile(null, completeFile), /Clipboard unavailable/, "missing clipboard is rejected");
  await assert.rejects(
    context.copyVttFile({ writeText: async () => { throw new Error("denied"); } }, completeFile),
    /denied/,
    "clipboard permission failures propagate to the UI handler"
  );

  assert.match(source, /<button type="button" data-export="copy">Copy \.vtt<\/button>/, "toolbar exposes complete-file copy");
  assert.match(
    source,
    /querySelector\('\[data-export="copy"\]'\)\.addEventListener\("click", async \(\) => \{\s*try \{\s*await copyVttFile\(navigator\.clipboard, buildVtt\(\)\);/,
    "copy action passes the shared full-file generator directly to the clipboard helper"
  );
  assert.match(source, /Copied complete WebVTT file with/, "success reports a complete-file copy");
  assert.match(source, /Clipboard unavailable; copy permission required\./, "failure is visible");
  assert.match(source, /\[\.\.\.editorCues\]\s*\.sort/, "the shared generated file remains sorted across all editor cues");

  console.log("T-049.40 complete WebVTT clipboard verification: pass");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
