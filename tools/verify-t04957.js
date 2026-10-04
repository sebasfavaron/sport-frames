#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync, spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const script = path.join(repoRoot, "tools", "suggest-speech-vtt.sh");
const editorScript = fs.readFileSync(path.join(repoRoot, "script.js"), "utf8");

assert.ok(fs.existsSync(script), "tools/suggest-speech-vtt.sh exists");

function functionSource(name) {
  const start = editorScript.indexOf(`  function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in script.js`);
  const brace = editorScript.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < editorScript.length; i++) {
    if (editorScript[i] === "{") depth++;
    if (editorScript[i] === "}" && --depth === 0) return editorScript.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function constSource(name) {
  const start = editorScript.indexOf(`  const ${name} = `);
  assert.notEqual(start, -1, `${name} must exist in script.js`);
  return editorScript.slice(start, editorScript.indexOf("\n", start));
}

// The editor's own importer, extracted from script.js so the check runs the
// same parser a reviewer's Import .vtt uses.
const context = {};
vm.createContext(context);
vm.runInContext(
  [
    "const VTT_CUE_REGIONS = {};",
    constSource("clamp"),
    functionSource("parseVttTimestamp"),
    functionSource("unescapeVttCueText"),
    functionSource("parseVttCues"),
    "this.parseVttCues = parseVttCues;",
  ].join("\n"),
  context
);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sport-frames-speech-zero-"));
const toneVideo = path.join(tmpDir, "tone.mp4");
const fakeModel = path.join(tmpDir, "fake-model.bin");
const fakeWhisper = path.join(tmpDir, "fake-whisper.sh");

// Stands in for whisper-cli, so no heavy model runs on this memory-tight Pi.
// Whisper can emit a segment whose start equals its end, or one whose end
// precedes its start; the second and third segments below model both.
fs.writeFileSync(
  fakeWhisper,
  `#!/usr/bin/env bash
of=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "-of" ]]; then of="$2"; shift; fi
  shift
done
cat > "$of.vtt" <<'VTT'
WEBVTT

00:00:01.000 --> 00:00:01.000
whistle

00:00:02.000 --> 00:00:04.000
kick it in

00:00:05.000 --> 00:00:04.500
reversed segment
VTT
`,
);
fs.chmodSync(fakeWhisper, 0o755);
fs.writeFileSync(fakeModel, "not a real model; the fake whisper ignores it\n");

try {
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=gray:s=64x64:d=4:r=5",
    "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=16000:d=4",
    "-shortest", "-pix_fmt", "yuv420p", "-c:a", "aac", toneVideo,
  ]);

  const result = spawnSync("bash", [script, toneVideo], {
    encoding: "utf8",
    env: {
      ...process.env,
      SPORT_FRAMES_WHISPER_CLI: fakeWhisper,
      SPORT_FRAMES_WHISPER_MODEL: fakeModel,
    },
  });
  assert.equal(result.status, 0, `tone clip with fake whisper exits 0: ${result.stderr}`);

  assert.equal(
    result.stdout,
    "WEBVTT\n\nspeech-1\n00:00:02.000 --> 00:00:04.000\nSPEECH: kick it in\n\n",
    "zero-length and reversed whisper segments are dropped before they reach the editor",
  );

  const cues = context.parseVttCues(result.stdout);
  assert.equal(cues.length, 1, "the editor importer keeps every cue the suggester emits");
  assert.equal(cues[0].text, "SPEECH: kick it in", "transcript text survives import intact");
  assert.equal(cues[0].name, "speech-1", "cue identifier survives import");
  assert.equal(cues[0].start, 2, "start time survives import");
  assert.equal(cues[0].end, 4, "end time survives import");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("T-049.57 speech zero-length segment verification: pass");
