#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");

// Overridable so this file's own falsifiability can be proven against /tmp
// copies of the pre-T-049.62 tools (never git checkout/stash on the real
// repo). Normal sweeps always check the real shipped files.
const checkScript =
  process.env.SPORT_FRAMES_T04962_CHECK_SCRIPT || path.join(repoRoot, "tools", "check-whisper-model.sh");
const suggestScript =
  process.env.SPORT_FRAMES_T04962_SUGGEST_SCRIPT || path.join(repoRoot, "tools", "suggest-speech-vtt.sh");

assert.ok(fs.existsSync(checkScript), "tools/check-whisper-model.sh exists");
assert.ok(fs.statSync(checkScript).mode & 0o111, "tools/check-whisper-model.sh is executable");
assert.ok(fs.existsSync(suggestScript), "tools/suggest-speech-vtt.sh exists");

const runCheck = (args, env) =>
  spawnSync("bash", [checkScript, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
const runSuggest = (args, env) =>
  spawnSync("bash", [suggestScript, ...args], { encoding: "utf8", env: { ...process.env, ...env } });

{
  const result = runCheck([]);
  assert.equal(result.status, 2, "no arguments exits 2");
}
{
  const result = runCheck(["a.bin", "b.bin"]);
  assert.equal(result.status, 2, "more than one argument exits 2");
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sport-frames-whisper-model-"));

try {
  const pinnedName = "ggml-large-v3-turbo-q5_0.bin";
  const contentA = Buffer.from("fake model content A, 64 bytes long, padded......", "utf8");
  const hashA = crypto.createHash("sha256").update(contentA).digest("hex");

  // --- match / mismatch / unknown, each with its own isolated cache dir ---
  {
    const dir = fs.mkdtempSync(path.join(tmpDir, "match-"));
    const modelPath = path.join(dir, pinnedName);
    fs.writeFileSync(modelPath, contentA);
    const result = runCheck([modelPath], {
      XDG_CACHE_HOME: path.join(dir, "cache"),
      SPORT_FRAMES_WHISPER_MODEL_PIN_SHA256: hashA,
    });
    assert.equal(result.status, 0, `a matching sha256 exits 0: ${result.stderr}`);
  }
  {
    const dir = fs.mkdtempSync(path.join(tmpDir, "mismatch-"));
    const modelPath = path.join(dir, pinnedName);
    fs.writeFileSync(modelPath, contentA);
    const result = runCheck([modelPath], {
      XDG_CACHE_HOME: path.join(dir, "cache"),
      SPORT_FRAMES_WHISPER_MODEL_PIN_SHA256: "0".repeat(64),
    });
    assert.equal(result.status, 4, `a mismatching sha256 exits 4: ${result.stderr}`);
    assert.match(result.stderr, /mismatch/i, "the mismatch error names the problem");
  }
  {
    const dir = fs.mkdtempSync(path.join(tmpDir, "unknown-"));
    const modelPath = path.join(dir, "some-other-model.bin");
    fs.writeFileSync(modelPath, contentA);
    const result = runCheck([modelPath], { XDG_CACHE_HOME: path.join(dir, "cache") });
    assert.equal(result.status, 2, `an unpinned filename exits 2: ${result.stderr}`);
    assert.match(result.stderr, /no pinned checksum|unpinned|unknown/i, "the unpinned error names the problem");
  }

  // --- a cached repeat does not re-hash the file ---
  // Falsifiable: if the cache key (path+size+mtime) or the cache itself is
  // dropped, the second run would hash the now-different content B and see
  // it does not match hashA, flipping the verdict from match to mismatch.
  {
    const dir = fs.mkdtempSync(path.join(tmpDir, "cache-reuse-"));
    const modelPath = path.join(dir, pinnedName);
    const cacheHome = path.join(dir, "cache");
    const fixedTime = new Date("2026-01-01T00:00:00Z");

    fs.writeFileSync(modelPath, contentA);
    fs.utimesSync(modelPath, fixedTime, fixedTime);

    const first = runCheck([modelPath], { XDG_CACHE_HOME: cacheHome, SPORT_FRAMES_WHISPER_MODEL_PIN_SHA256: hashA });
    assert.equal(first.status, 0, `first run matches: ${first.stderr}`);

    const cacheDir = path.join(cacheHome, "sport-frames");
    const cacheFilesAfterFirst = fs.readdirSync(cacheDir);
    assert.equal(cacheFilesAfterFirst.length, 1, "exactly one cache entry after the first run");

    const contentB = Buffer.from("fake model content B, 64 bytes long, padded......", "utf8");
    assert.equal(contentA.length, contentB.length, "test setup: same size so the cache key is unchanged");
    const hashB = crypto.createHash("sha256").update(contentB).digest("hex");
    assert.notEqual(hashA, hashB, "test setup: B hashes differently than A");

    fs.writeFileSync(modelPath, contentB);
    fs.utimesSync(modelPath, fixedTime, fixedTime);

    const second = runCheck([modelPath], { XDG_CACHE_HOME: cacheHome, SPORT_FRAMES_WHISPER_MODEL_PIN_SHA256: hashA });
    assert.equal(
      second.status,
      0,
      `second run with unchanged path+size+mtime must reuse the cached hashA verdict, not re-hash ` +
        `content B: ${second.stderr}`,
    );
    const cacheFilesAfterSecond = fs.readdirSync(cacheDir);
    assert.equal(cacheFilesAfterSecond.length, 1, "still exactly one cache entry (same key reused)");
  }

  // --- the speech suggester's failure message carries the check's verdict ---
  const fakeWhisper = path.join(tmpDir, "fake-whisper.sh");
  fs.writeFileSync(
    fakeWhisper,
    `#!/usr/bin/env bash\necho "fake whisper: failed to initialize whisper context" >&2\nexit 3\n`,
  );
  fs.chmodSync(fakeWhisper, 0o755);

  const toneVideo = path.join(tmpDir, "tone.mp4");
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=gray:s=64x64:d=1:r=5",
    "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=16000:d=1",
    "-shortest", "-pix_fmt", "yuv420p", "-c:a", "aac", toneVideo,
  ]);

  {
    const dir = fs.mkdtempSync(path.join(tmpDir, "suggest-ok-"));
    const modelPath = path.join(dir, pinnedName);
    fs.writeFileSync(modelPath, contentA);
    const result = runSuggest([toneVideo], {
      SPORT_FRAMES_WHISPER_CLI: fakeWhisper,
      SPORT_FRAMES_WHISPER_MODEL: modelPath,
      SPORT_FRAMES_WHISPER_MODEL_PIN_SHA256: hashA,
      XDG_CACHE_HOME: path.join(dir, "cache"),
    });
    assert.equal(result.status, 3, `whisper-cli failure still exits 3 unchanged: ${result.stderr}`);
    assert.match(result.stderr, /whisper-cli failed:/, "the original failure message is unchanged");
    assert.match(result.stderr, /failed to initialize whisper context/, "whisper's own stderr is still forwarded");
    assert.match(
      result.stderr,
      /model checksum OK — likely memory pressure/,
      "a matching model checksum is reported as likely memory pressure",
    );
  }
  {
    const dir = fs.mkdtempSync(path.join(tmpDir, "suggest-bad-"));
    const modelPath = path.join(dir, pinnedName);
    fs.writeFileSync(modelPath, contentA);
    const result = runSuggest([toneVideo], {
      SPORT_FRAMES_WHISPER_CLI: fakeWhisper,
      SPORT_FRAMES_WHISPER_MODEL: modelPath,
      SPORT_FRAMES_WHISPER_MODEL_PIN_SHA256: "0".repeat(64),
      XDG_CACHE_HOME: path.join(dir, "cache"),
    });
    assert.equal(result.status, 3, `whisper-cli failure still exits 3 unchanged: ${result.stderr}`);
    assert.match(
      result.stderr,
      /model checksum mismatch — re-download it/,
      "a mismatching model checksum is reported as likely corruption",
    );
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("T-049.62 whisper model integrity check verification: pass");
