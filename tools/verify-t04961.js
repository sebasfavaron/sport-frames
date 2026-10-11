#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const verifyT04956 = path.join(root, "tools", "verify-t04956.js");

// Overridable only for the falsifiability proof (pointing at a /tmp copy of the
// pre-change file). The normal sweep always checks the real shipped file.
const staticCheckTarget = process.env.SPORT_FRAMES_T04961_TARGET || verifyT04956;
const source = fs.readFileSync(staticCheckTarget, "utf8");

// Check 1: verify-t04956.js's real-transcription branch must still be gated on
// SPORT_FRAMES_REAL_WHISPER. The pre-T-049.61 file has no such gate at all, so this
// fails against it and passes against the fixed file.
assert.match(
  source,
  /process\.env\.SPORT_FRAMES_REAL_WHISPER\s*!==\s*["']1["']/,
  "verify-t04956.js must gate its real-transcription branch on SPORT_FRAMES_REAL_WHISPER !== \"1\"",
);

// Check 2: with the opt-in and the whisper-path overrides unset, running
// verify-t04956.js for real must stay deterministic and light: it must exit 0
// without spawning the real whisper-cli, printing the opt-in skip line instead.
const env = { ...process.env };
delete env.SPORT_FRAMES_REAL_WHISPER;
delete env.SPORT_FRAMES_WHISPER_CLI;
delete env.SPORT_FRAMES_WHISPER_MODEL;

const result = spawnSync(process.execPath, [verifyT04956], { encoding: "utf8", env });
assert.equal(
  result.status,
  0,
  `verify-t04956.js must pass with SPORT_FRAMES_REAL_WHISPER unset: ${result.stderr}`,
);
assert.match(
  result.stdout,
  /skipping real-transcription check, set SPORT_FRAMES_REAL_WHISPER=1 to run it/,
  "verify-t04956.js must print the opt-in skip line instead of running the real branch",
);

console.log("T-049.61 verify-t04956 opt-in real-whisper gate verification: pass");
