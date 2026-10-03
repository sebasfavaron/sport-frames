const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const script = path.join(repoRoot, "tools", "suggest-all-vtt.sh");

assert.ok(fs.existsSync(script), "tools/suggest-all-vtt.sh exists");
assert.ok(fs.statSync(script).mode & 0o111, "tools/suggest-all-vtt.sh is executable");

const run = (args) => spawnSync("bash", [script, ...args], { encoding: "utf8" });

const parseCues = (vtt) => {
  const timingLine = /(\d{2}):(\d{2}):(\d{2})\.(\d{3}) --> (\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
  const toSeconds = (h, m, s, ms) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
  const blocks = vtt.replace(/^WEBVTT\n+/, "").trim();
  if (!blocks) return [];
  return blocks.split(/\n\n+/).map((block) => {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => timingLine.test(line));
    const match = lines[timingIndex].match(timingLine);
    return {
      identifier: lines[timingIndex - 1],
      start: toSeconds(match[1], match[2], match[3], match[4]),
      end: toSeconds(match[5], match[6], match[7], match[8]),
      body: lines.slice(timingIndex + 1).join("\n"),
    };
  });
};

// Usage / validation paths need no ffmpeg work and no fixture video.
{
  const result = run([]);
  assert.equal(result.status, 2, "no arguments exits 2");
}
{
  const result = run(["a.mp4", "b.mp4"]);
  assert.equal(result.status, 2, "more than one argument exits 2");
}
{
  const result = run(["/tmp/sport-frames-does-not-exist.mp4"]);
  assert.equal(result.status, 1, "missing video exits 1");
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sport-frames-suggest-all-"));
const cutsVideo = path.join(tmpDir, "cuts.mp4");
const withAudioVideo = path.join(tmpDir, "with-audio.mp4");
const flatVideo = path.join(tmpDir, "flat.mp4");

const ffmpeg = (args) => {
  const result = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
  assert.equal(result.status, 0, `ffmpeg fixture generation failed: ${result.stderr}`);
};

try {
  // Three 1s solid-color segments, no audio: a scene cut at 1.0s and 2.0s, a
  // black interval covering the whole black segment (1.0-2.0s), and a frozen
  // interval covering the initial red segment (0.0-1.0s), matching this
  // repo's per-signal FFmpeg suggesters (T-049.1/.7/.8/.53).
  ffmpeg([
    "-f", "lavfi", "-i", "color=c=red:s=64x64:d=1:r=10",
    "-f", "lavfi", "-i", "color=c=black:s=64x64:d=1:r=10",
    "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=1:r=10",
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0",
    "-pix_fmt", "yuv420p", cutsVideo,
  ]);

  // Same three video segments, plus audio: silence, then a 1kHz tone, then
  // silence again, to exercise cross-signal (video+audio) merging.
  ffmpeg([
    "-f", "lavfi", "-i", "color=c=red:s=64x64:d=1:r=10",
    "-f", "lavfi", "-i", "color=c=black:s=64x64:d=1:r=10",
    "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=1:r=10",
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=1",
    "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:d=1",
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=1",
    "-filter_complex",
    "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v];[3:a][4:a][5:a]concat=n=3:v=0:a=1[a]",
    "-map", "[v]", "-map", "[a]", "-pix_fmt", "yuv420p", withAudioVideo,
  ]);

  // One flat, unchanging color: no scene cuts, no black interval, and
  // freezedetect never reports a freeze_end because the video ends while
  // still frozen, so no signal fires at all.
  ffmpeg([
    "-f", "lavfi", "-i", "color=c=gray:s=64x64:d=2:r=10",
    "-pix_fmt", "yuv420p", flatVideo,
  ]);

  {
    const result = run([cutsVideo]);
    assert.equal(result.status, 0, "video-only clip exits 0");
    assert.match(result.stderr, /skipping quiet/, "missing audio stream skips the silence suggester with a warning");
    assert.match(result.stderr, /skipping loudpeak/, "missing audio stream skips the loud-peak suggester with a warning");
    assert.doesNotMatch(result.stderr, /error:/, "no suggester reports a hard error");

    const cues = parseCues(result.stdout);
    assert.equal(cues.length, 3, `expected 3 merged cues, got ${cues.length}: ${JSON.stringify(cues)}`);
    for (let i = 1; i < cues.length; i++) {
      assert.ok(cues[i].start >= cues[i - 1].start, "cues are sorted by start time");
    }

    const freeze = cues.find((cue) => cue.identifier === "freeze-1");
    assert.ok(freeze, "the red segment's frozen interval survives merging");
    assert.ok(Math.abs(freeze.start - 0) < 0.15 && Math.abs(freeze.end - 1) < 0.15, "freeze-1 covers the red segment");

    const scenecut = cues.find((cue) => cue.identifier === "scenecut-1");
    assert.ok(scenecut, "the red-to-black scene cut survives merging as its own cue");
    assert.ok(Math.abs(scenecut.start - 1) < 0.15, "scenecut-1 starts at the cut");

    const black = cues.find((cue) => cue.identifier === "black-1");
    assert.ok(black, "the black interval survives merging, keeping its own identifier");
    assert.ok(Math.abs(black.start - 1) < 0.15 && Math.abs(black.end - 2) < 0.15, "black-1 covers the black segment");
    assert.match(black.body, /\[also flagged by: freeze\]/, "the near-identical freeze cue over the black interval was deduplicated into black-1");
    assert.ok(!cues.some((cue) => cue.identifier === "freeze-2"), "the deduplicated freeze-2 cue is dropped, not duplicated");
  }

  {
    const result = run([withAudioVideo]);
    assert.equal(result.status, 0, "clip with audio exits 0");
    // Speech (T-049.56) is excluded here: it needs whisper-cli and its model,
    // a shared external dependency that can fail independently of the audio
    // stream. Its skip path is covered by verify-t04956.js.
    assert.doesNotMatch(result.stderr, /skipping (quiet|loudpeak)/, "an audio stream is present, so the audio suggesters are not skipped");

    const cues = parseCues(result.stdout);
    const freeze = cues.find((cue) => cue.identifier === "freeze-1");
    assert.ok(freeze, "the initial silent+frozen interval survives merging");
    assert.match(freeze.body, /\[also flagged by: quiet\]/, "the coinciding silence cue over the same interval was deduplicated cross-signal (video+audio)");

    const trailingQuiet = cues.find((cue) => cue.identifier === "quiet-2");
    assert.ok(trailingQuiet, "the trailing silence interval survives merging on its own");
    assert.ok(Math.abs(trailingQuiet.start - 2) < 0.15, "quiet-2 starts at the second silent segment");
  }

  {
    const result = run([flatVideo]);
    assert.equal(result.status, 0, "a signal-free clip still exits 0");
    assert.equal(parseCues(result.stdout).length, 0, "a signal-free clip merges to zero cues");
    assert.match(result.stdout, /^WEBVTT\n\n?$/, "a signal-free clip still emits a valid empty WebVTT file");
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("T-049.54 merged suggestion WebVTT verification: pass");
