#!/usr/bin/env node
"use strict";

// T-049.70: on a phone (390x844) the open editor must not cover the video frame:
// the editor sheet starts below the frame. Before T-049.70 it covered all of it.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("SKIP verify-t04970: playwright is not installed");
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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => document.getElementById("scrolly-video").readyState >= 1);
    await page.click("#vtt-editor-toggle");
    await page.evaluate(() => {
      const track = document.getElementById("scrolly");
      window.scrollTo(0, track.offsetTop + track.offsetHeight * 0.4);
    });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const video = document.getElementById("scrolly-video");
      const box = video.getBoundingClientRect();
      const pictureHeight = box.width * video.videoHeight / video.videoWidth;
      const [, y] = getComputedStyle(video).objectPosition.split(" ");
      const pictureTop = box.top + (box.height - pictureHeight) * parseFloat(y) / 100;
      const editor = document.querySelector(".vtt-editor");
      return { pictureBottom: pictureTop + pictureHeight, editorTop: editor.getBoundingClientRect().top,
               editorScrolls: editor.scrollHeight > editor.clientHeight };
    });
    assert.ok(m.editorTop >= m.pictureBottom - 1, `editor (top ${m.editorTop}) covers the frame (bottom ${m.pictureBottom})`);
    assert.ok(m.editorScrolls, "the editor sheet scrolls to reach the rest of its controls");
    console.log("verify-t04970: ok");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
