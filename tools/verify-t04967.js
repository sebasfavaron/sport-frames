#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync, spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const ocrScript = path.join(repoRoot, "tools", "suggest-ocr-vtt.sh");
const speechScript = path.join(repoRoot, "tools", "suggest-speech-vtt.sh");
const mergeScript = path.join(repoRoot, "tools", "suggest-all-vtt.sh");
const scriptJs = fs.readFileSync(path.join(repoRoot, "script.js"), "utf8");

assert.ok(fs.existsSync(ocrScript), "tools/suggest-ocr-vtt.sh exists");
assert.ok(fs.existsSync(speechScript), "tools/suggest-speech-vtt.sh exists");

// --- ground truth: the editor's own reserved-character escaping contract ---
function functionSource(source, name) {
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
vm.createContext(context);
vm.runInContext(
  `${functionSource(scriptJs, "escapeVttCueText")}\n${functionSource(scriptJs, "unescapeVttCueText")}\n` +
    `${functionSource(scriptJs, "parseVttTimestamp")}\n${functionSource(scriptJs, "parseVttCues")}\n` +
    "this.escapeVttCueText = escapeVttCueText;\nthis.unescapeVttCueText = unescapeVttCueText;\n" +
    "this.parseVttCues = parseVttCues;",
  context
);

const rawText = "Smith & Jones < goal > time";
const expectedEscaped = context.escapeVttCueText(rawText);
assert.equal(
  expectedEscaped,
  "Smith &amp; Jones &lt; goal &gt; time",
  "test setup: escapeVttCueText's own contract for this fixture string"
);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sport-frames-verify-t04967-"));

const ffmpeg = (args) => {
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
};

try {
  // --- fixture video: a scene cut (drives suggest-ocr-vtt.sh's frame pick) ---
  const cutVideo = path.join(tmpDir, "cut.mp4");
  ffmpeg([
    "-f", "lavfi", "-i", "color=c=red:s=64x64:d=1:r=5",
    "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=1:r=5",
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0",
    "-pix_fmt", "yuv420p", cutVideo,
  ]);

  // --- fixture audio: any tone, suggest-speech-vtt.sh never reads its content ---
  const audioVideo = path.join(tmpDir, "audio.mp4");
  ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=2", audioVideo]);

  // A fake tesseract on PATH: deterministic, instant, and immune to any real
  // OCR misread of punctuation (the actual recognition accuracy of "&"/"<"/
  // ">" is not what this slice tests -- the escaping of whatever text comes
  // back is). Mirrors the fake-whisper-cli pattern T-049.56/.57 already use
  // for the same determinism reason.
  const fakeToolsDir = path.join(tmpDir, "fake-tools");
  fs.mkdirSync(fakeToolsDir);
  const fakeTesseract = path.join(fakeToolsDir, "tesseract");
  fs.writeFileSync(fakeTesseract, `#!/usr/bin/env bash\nprintf '%s' "${rawText}"\n`);
  fs.chmodSync(fakeTesseract, 0o755);

  const runOcr = (args, env) =>
    spawnSync("bash", [ocrScript, ...args], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${fakeToolsDir}:${process.env.PATH}`, ...env },
    });

  const ocrResult = runOcr([cutVideo, "0.1", "0.5"]);
  assert.equal(ocrResult.status, 0, `suggest-ocr-vtt.sh exits 0: ${ocrResult.stderr}`);
  assert.match(
    ocrResult.stdout,
    /OCR: Smith &amp; Jones &lt; goal &gt; time/,
    `OCR cue body escapes reserved WebVTT characters, got: ${ocrResult.stdout}`,
  );
  assert.doesNotMatch(
    ocrResult.stdout,
    /OCR: Smith & Jones < goal > time/,
    `OCR cue body must not carry the raw, unescaped text: ${ocrResult.stdout}`,
  );

  // A fake whisper-cli: same determinism rationale, same shape as
  // T-049.56/.57's own fixtures (writes the -ovtt output file whisper-cli
  // would have written).
  const fakeWhisper = path.join(tmpDir, "fake-whisper.sh");
  const fakeModel = path.join(tmpDir, "fake-model.bin");
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

00:00:00.000 --> 00:00:02.000
${rawText}
VTT
`,
  );
  fs.chmodSync(fakeWhisper, 0o755);
  fs.writeFileSync(fakeModel, "fake");

  const runSpeech = (args, env) =>
    spawnSync("bash", [speechScript, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        SPORT_FRAMES_WHISPER_CLI: fakeWhisper,
        SPORT_FRAMES_WHISPER_MODEL: fakeModel,
        ...env,
      },
    });

  const speechResult = runSpeech([audioVideo]);
  assert.equal(speechResult.status, 0, `suggest-speech-vtt.sh exits 0: ${speechResult.stderr}`);
  assert.match(
    speechResult.stdout,
    /SPEECH: Smith &amp; Jones &lt; goal &gt; time/,
    `speech cue body escapes reserved WebVTT characters, got: ${speechResult.stdout}`,
  );
  assert.doesNotMatch(
    speechResult.stdout,
    /SPEECH: Smith & Jones < goal > time/,
    `speech cue body must not carry the raw, unescaped text: ${speechResult.stdout}`,
  );

  // --- the editor's own parser decodes the escaped output back to the
  // exact original recognized text: the generate -> review loop round-trips
  // cleanly through the in-page editor's Import .vtt path (T-049.10). ---
  const ocrCues = context.parseVttCues(ocrResult.stdout);
  assert.equal(ocrCues.length, 1, "exactly one OCR cue parses");
  assert.equal(
    ocrCues[0].text,
    `OCR: ${rawText}`,
    `the editor's own parseVttCues decodes the escaped OCR cue back to the exact original text, got: ${ocrCues[0].text}`,
  );

  const speechCues = context.parseVttCues(speechResult.stdout);
  assert.equal(speechCues.length, 1, "exactly one speech cue parses");
  assert.equal(
    speechCues[0].text,
    `SPEECH: ${rawText}`,
    `the editor's own parseVttCues decodes the escaped speech cue back to the exact original text, got: ${speechCues[0].text}`,
  );

  // --- the merge step (suggest-all-vtt.sh) carries the already-escaped text
  // through untouched when a duplicate OCR/speech cue is folded into a kept
  // cue (T-049.63's bracket), neither re-escaping nor corrupting it. Forces
  // a merge by making the scene cut and the OCR candidate the same instant
  // (both suggesters share the same scene-cut detector/defaults). ---
  const mergeResult = spawnSync("bash", [mergeScript, cutVideo], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeToolsDir}:${process.env.PATH}`,
      SPORT_FRAMES_WHISPER_CLI: "/nonexistent",
    },
  });
  assert.equal(mergeResult.status, 0, `suggest-all-vtt.sh exits 0: ${mergeResult.stderr}`);
  assert.match(
    mergeResult.stdout,
    /\[also flagged by: ocr: Smith &amp; Jones &lt; goal &gt; time\]/,
    `the merge step preserves the already-escaped OCR text byte-for-byte, got: ${mergeResult.stdout}`,
  );

  // --- falsifiability: the pre-change suggesters emit raw, unescaped text ---
  // Pinned to this slice's starting HEAD (83a2e8d, T-049.66's commit), not a
  // HEAD-relative read -- the exact trap T-049.64 fixed for verify-t04963.js.
  // Never git checkout/stash on the real repo: copy to /tmp instead.
  const baselineCommit = "83a2e8d";
  for (const [name, scriptPath] of [
    ["tools/suggest-ocr-vtt.sh", ocrScript],
    ["tools/suggest-speech-vtt.sh", speechScript],
  ]) {
    const preChangeContent = execFileSync("git", ["show", `${baselineCommit}:${name}`], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.doesNotMatch(
      preChangeContent,
      /&amp;|&lt;|&gt;/,
      `test setup: ${baselineCommit}'s ${name} must be the pre-escaping version`,
    );
  }

  const preChangeToolsDir = path.join(tmpDir, "pre-change-tools");
  fs.mkdirSync(preChangeToolsDir);
  for (const entry of fs.readdirSync(path.join(repoRoot, "tools"))) {
    const content =
      entry === "suggest-ocr-vtt.sh" || entry === "suggest-speech-vtt.sh"
        ? execFileSync("git", ["show", `${baselineCommit}:tools/${entry}`], { cwd: repoRoot, encoding: "utf8" })
        : fs.readFileSync(path.join(repoRoot, "tools", entry));
    fs.writeFileSync(path.join(preChangeToolsDir, entry), content);
    fs.chmodSync(path.join(preChangeToolsDir, entry), 0o755);
  }

  const preOcrResult = spawnSync(
    "bash",
    [path.join(preChangeToolsDir, "suggest-ocr-vtt.sh"), cutVideo, "0.1", "0.5"],
    { encoding: "utf8", env: { ...process.env, PATH: `${fakeToolsDir}:${process.env.PATH}` } },
  );
  assert.equal(preOcrResult.status, 0, `pre-change OCR script still exits 0: ${preOcrResult.stderr}`);
  assert.match(
    preOcrResult.stdout,
    /OCR: Smith & Jones < goal > time/,
    `regression check: the pre-change OCR suggester emits raw, unescaped text (proves this slice's assertions are falsifiable): ${preOcrResult.stdout}`,
  );

  const preSpeechResult = spawnSync(
    "bash",
    [path.join(preChangeToolsDir, "suggest-speech-vtt.sh"), audioVideo],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SPORT_FRAMES_WHISPER_CLI: fakeWhisper,
        SPORT_FRAMES_WHISPER_MODEL: fakeModel,
      },
    },
  );
  assert.equal(preSpeechResult.status, 0, `pre-change speech script still exits 0: ${preSpeechResult.stderr}`);
  assert.match(
    preSpeechResult.stdout,
    /SPEECH: Smith & Jones < goal > time/,
    `regression check: the pre-change speech suggester emits raw, unescaped text (proves this slice's assertions are falsifiable): ${preSpeechResult.stdout}`,
  );
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("T-049.67 suggester reserved-WebVTT-character escaping verification: pass");
