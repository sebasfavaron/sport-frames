#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const realScript = path.join(repoRoot, "tools", "suggest-all-vtt.sh");

assert.ok(fs.existsSync(realScript), "tools/suggest-all-vtt.sh exists");
assert.ok(fs.statSync(realScript).mode & 0o111, "tools/suggest-all-vtt.sh is executable");

for (const command of ["ffmpeg", "ffprobe", "tesseract"]) {
  const found = spawnSync("bash", ["-lc", `command -v ${command}`]);
  assert.equal(found.status, 0, `${command} is required for this verification`);
}

const run = (scriptPath, args) => spawnSync("bash", [scriptPath, ...args], { encoding: "utf8" });

const parseCues = (vtt) => {
  const timingLine = /(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
  const blocks = vtt.replace(/^WEBVTT\n+/, "").trim();
  if (!blocks) return [];
  return blocks.split(/\n\n+/).map((block) => {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => timingLine.test(line));
    return {
      identifier: lines[timingIndex - 1],
      body: lines.slice(timingIndex + 1).join("\n"),
    };
  });
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sport-frames-verify-t04963-"));

try {
  const fontFile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  assert.ok(fs.existsSync(fontFile), `test setup: ${fontFile} is required to draw on-screen text`);

  // Two 1s solid-color segments, no audio: a scene cut at 1.0s, with the
  // second segment carrying a drawtext overlay so suggest-ocr-vtt.sh's
  // frame extraction at that same scene-cut candidate recognizes text.
  // suggest-scenecut-vtt.sh and suggest-ocr-vtt.sh share the same candidate
  // detector/defaults, so both fire at the same 1.000s timestamp and
  // suggest-all-vtt.sh's merge de-duplicates them.
  const cutsWithTextVideo = path.join(tmpDir, "cuts-with-text.mp4");
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=red:s=320x240:d=1:r=10",
    "-f", "lavfi", "-i", "color=c=blue:s=320x240:d=1:r=10",
    "-filter_complex",
    `[1:v]drawtext=fontfile=${fontFile}:text='HOME 2 AWAY 1':fontsize=36:fontcolor=white:x=20:y=90[txt];` +
      "[0:v][txt]concat=n=2:v=1:a=0",
    "-pix_fmt", "yuv420p", cutsWithTextVideo,
  ]);

  // A flat, unchanging clip: no scene cut, no on-screen text, nothing to
  // merge. Confirms the fix does not invent "also flagged by" notes.
  const flatVideo = path.join(tmpDir, "flat.mp4");
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=gray:s=320x240:d=1:r=10",
    "-pix_fmt", "yuv420p", flatVideo,
  ]);

  // --- the fixed, shipped script keeps the recognized OCR text ---
  {
    const result = run(realScript, [cutsWithTextVideo]);
    assert.equal(result.status, 0, `suggest-all-vtt.sh exits 0 on the fixture: ${result.stderr}`);

    const cues = parseCues(result.stdout);
    const scenecut = cues.find((cue) => cue.identifier === "scenecut-1");
    assert.ok(scenecut, `the scene cut survives merging: ${result.stdout}`);
    assert.match(
      scenecut.body,
      /\[also flagged by: ocr: [^\]]*HOME[^\]]*\]/,
      `the merged cue keeps the recognized OCR text, not just the bare tag: ${scenecut.body}`,
    );
    assert.doesNotMatch(
      scenecut.body,
      /\[also flagged by: ocr\]/,
      `the dropped OCR cue is not reduced to a bare, content-free tag: ${scenecut.body}`,
    );
  }

  // --- a clip with nothing to merge produces no "also flagged by" note ---
  {
    const result = run(realScript, [flatVideo]);
    assert.equal(result.status, 0, `a signal-free clip still exits 0: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /also flagged by/, "nothing to merge means no merge note at all");
  }

  // --- falsifiability: the pre-change merge step drops the OCR text ---
  // Copy the whole tools/ dir to /tmp (suggest-all-vtt.sh shells out to its
  // sibling suggesters by its own BASH_SOURCE dirname, so they must resolve
  // next to it), then overwrite only suggest-all-vtt.sh with the version
  // from HEAD, read before this slice's own commit. Never git
  // checkout/stash on the real repo.
  const preChangeContent = execFileSync("git", ["show", "HEAD:tools/suggest-all-vtt.sh"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.doesNotMatch(
    preChangeContent,
    /machine_text_prefix/,
    "test setup: HEAD's suggest-all-vtt.sh must be the pre-T-049.63 version (run this check before committing this slice)",
  );

  const preChangeToolsDir = path.join(tmpDir, "pre-change-tools");
  fs.mkdirSync(preChangeToolsDir);
  for (const entry of fs.readdirSync(path.join(repoRoot, "tools"))) {
    fs.copyFileSync(path.join(repoRoot, "tools", entry), path.join(preChangeToolsDir, entry));
    fs.chmodSync(path.join(preChangeToolsDir, entry), 0o755);
  }
  fs.writeFileSync(path.join(preChangeToolsDir, "suggest-all-vtt.sh"), preChangeContent);
  fs.chmodSync(path.join(preChangeToolsDir, "suggest-all-vtt.sh"), 0o755);

  {
    const preChangeScript = path.join(preChangeToolsDir, "suggest-all-vtt.sh");
    const result = run(preChangeScript, [cutsWithTextVideo]);
    assert.equal(result.status, 0, `pre-change script still exits 0 on the fixture: ${result.stderr}`);

    const cues = parseCues(result.stdout);
    const scenecut = cues.find((cue) => cue.identifier === "scenecut-1");
    assert.ok(scenecut, `the scene cut survives merging in the pre-change copy: ${result.stdout}`);
    assert.doesNotMatch(
      scenecut.body,
      /\[also flagged by: ocr: /,
      `regression check: the pre-change merge must NOT carry the OCR text (proves this slice's assertions are falsifiable): ${scenecut.body}`,
    );
    assert.match(
      scenecut.body,
      /\[also flagged by: ocr\]/,
      `regression check: the pre-change merge reduces the dropped OCR cue to the bare tag: ${scenecut.body}`,
    );
  }

  // --- unrelated tag-only format (T-049.54) is untouched by this slice ---
  // Same red/black/blue three-segment fixture verify-t04954.js uses, where
  // a freeze interval over the black segment is deduplicated against the
  // scene cut at the same moment.
  const threeSegmentVideo = path.join(tmpDir, "three-segment.mp4");
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=red:s=64x64:d=1:r=10",
    "-f", "lavfi", "-i", "color=c=black:s=64x64:d=1:r=10",
    "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=1:r=10",
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0",
    "-pix_fmt", "yuv420p", threeSegmentVideo,
  ]);
  {
    const result = run(realScript, [threeSegmentVideo]);
    assert.equal(result.status, 0, `three-segment fixture exits 0: ${result.stderr}`);
    const cues = parseCues(result.stdout);
    const black = cues.find((cue) => cue.identifier === "black-1");
    assert.ok(black, `the black interval survives merging: ${result.stdout}`);
    assert.match(
      black.body,
      /\[also flagged by: freeze\]$/,
      `a non-machine-text tag (freeze) keeps T-049.54's original bare-tag format, unchanged by this slice: ${black.body}`,
    );
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("T-049.63 merge-dedup OCR/speech text preservation verification: pass");
