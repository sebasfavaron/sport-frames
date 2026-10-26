#!/usr/bin/env node
"use strict";

// T-049.69: end-to-end check of the main flow in a real Chromium (Playwright):
// load a local video, load a .vtt through the page input, mark in/out a cue in
// the editor, edit it, drag-retime it, Apply to video, download the .vtt.
// Exercises the native <track> path that unit-level verify-* scripts never hit.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("SKIP verify-t04969: playwright is not installed");
  process.exit(0);
}

const repoRoot = path.join(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".mp4": "video/mp4", ".vtt": "text/vtt" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html");
  const file = path.join(repoRoot, path.normalize(rel));
  if (!file.startsWith(repoRoot)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);

    await page.setInputFiles("#file-input", path.join(repoRoot, "assets", "default.mp4"));
    await page.waitForFunction(() => {
      const video = document.getElementById("scrolly-video");
      return video.src.startsWith("blob:") && video.readyState >= 1;
    });
    const seekTo = async (seconds) => {
      await page.evaluate((t) => {
        const track = document.getElementById("scrolly");
        const video = document.getElementById("scrolly-video");
        const rect = track.getBoundingClientRect();
        window.scrollTo(0, window.scrollY + rect.top + (t / video.duration) * (rect.height - innerHeight));
      }, seconds);
      await page.waitForTimeout(400);
    };
    const overlay = () => page.locator("#scrolly-vtt-annotation .scrolly__vtt-cue").allTextContents();
    const nativeCueCount = () => page.evaluate(() => {
      const track = document.getElementById("scrolly-annotations").track;
      return track.cues ? track.cues.length : 0;
    });

    // 1. Page-level "Cargar anotaciones WebVTT" input must actually load cues.
    await page.setInputFiles("#vtt-file-input", path.join(repoRoot, "assets", "default.vtt"));
    await page.waitForFunction(() => {
      const track = document.getElementById("scrolly-annotations").track;
      return track.cues && track.cues.length === 3;
    }, null, { timeout: 5000 }).catch(() => {});
    assert.equal(await nativeCueCount(), 3, "loaded .vtt yields 3 native cues");
    await page.waitForTimeout(1000); // let the input's smooth scrollIntoView settle
    await seekTo(2);
    assert.deepEqual(await overlay(), ["Inicio de la secuencia"], "loaded .vtt cue renders at 2s");

    // 2. Editor: mark in/out with I/O, add, edit, drag-retime.
    await page.click("#vtt-editor-toggle");
    await seekTo(2);
    await page.locator("body").press("i");
    await seekTo(4);
    await page.locator("body").press("o");
    assert.equal(await page.inputValue("[name=start]"), "2.000");
    await page.fill("[name=text]", "Gol & festejo");
    await page.click(".vtt-editor__save");
    await page.locator(".vtt-editor__list li").first().locator('[data-action="edit"]').click();
    await page.fill("[name=text]", "Gol editado & festejo");
    await page.click(".vtt-editor__save");
    await page.locator(".vtt-editor__list li").first().locator('[data-action="timeline-retime"]').evaluate((el) => {
      el.value = "10";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 3. Apply to video replaces the native track with the editor's cues,
    //    and each cue renders once (not editor preview + native copy).
    await page.click('[data-export="apply"]');
    await page.waitForFunction(() => {
      const track = document.getElementById("scrolly-annotations").track;
      return track.cues && track.cues.length === 1;
    }, null, { timeout: 5000 }).catch(() => {});
    assert.equal(await nativeCueCount(), 1, "Apply to video loads the editor cue into the native track");
    await seekTo(11);
    assert.deepEqual(await overlay(), ["Gol editado & festejo"], "applied cue renders exactly once");
    await seekTo(2);
    assert.deepEqual(await overlay(), [], "the replaced .vtt no longer renders");

    // 4. Download the .vtt.
    const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-export="download"]')]);
    const vtt = fs.readFileSync(await download.path(), "utf8");
    assert.match(vtt, /^WEBVTT\n\n00:00:10\.000 --> 00:00:12\.001 [^\n]*\nGol editado &amp; festejo\n$/, vtt);

    assert.deepEqual(pageErrors, [], "no page errors");
    console.log("verify-t04969: ok");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
