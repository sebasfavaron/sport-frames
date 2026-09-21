(() => {
  const track = document.getElementById("scrolly");
  const video = document.getElementById("scrolly-video");
  const progressBar = document.getElementById("scrolly-progress-bar");
  const annotationTrack = document.getElementById("scrolly-annotations");
  const vttAnnotation = document.getElementById("scrolly-vtt-annotation");
  const captions = Array.from(document.querySelectorAll(".scrolly__caption"));
  const fileInput = document.getElementById("file-input");
  const vttFileInput = document.getElementById("vtt-file-input");
  const vttEditorToggle = document.getElementById("vtt-editor-toggle");
  const params = new URLSearchParams(window.location.search);
  const previewEnabled = params.has("annotation-preview");
  const vttCueEnabled = params.has("vtt-cue");
  const vttEditorEnabled = params.has("vtt-editor");
  const captionAnchors = captions
    .map((el) => ({ el, at: parseFloat(el.dataset.at) }))
    .filter((item) => Number.isFinite(item.at))
    .sort((a, b) => a.at - b.at);

  const VH_PER_SECOND = 40; // more = slower scroll per video-second = finer scrubbing
  const MIN_VH = 250;
  const MAX_VH = 3000;

  let objectUrl = null;
  let annotationObjectUrl = null;
  let customAnnotationLoaded = false;
  let inView = false;
  let ticking = false;
  let preview = null;
  let vttCue = null;
  let cueStart = null;
  let vttEditor = null;
  let editorCues = [];
  let referenceMarkers = [];
  let activeSearchCueId = null;
  let editingCueId = null;
  let editingCueOriginal = null;
  let destructiveUndoSnapshot = null;
  let redoSnapshot = null;
  let selectedCueIds = new Set();
  let nextCueId = 1;
  const VTT_EDITOR_STORAGE_KEY = "sport-frames:vtt-editor-cues";
  const SHORT_CUE_THRESHOLD_SECONDS = 0.15;
  const MAX_CUE_CHARACTERS_PER_SECOND = 20;
  const NEAR_DUPLICATE_CUE_TOLERANCE_SECONDS = 0.1;
  const CUE_GAP_THRESHOLD_SECONDS = 1;
  const REFERENCE_MARKER_SNAP_TOLERANCE_SECONDS = 0.25;
  const CUE_TEXT_ALIGN_VALUES = ["start", "center", "end"];
  const VTT_EDITOR_SHORTCUTS = [
    { keys: ["I"], description: "Mark in — set cue start to the live scrub time" },
    { keys: ["O"], description: "Mark out — set cue end to the live scrub time" },
    { keys: ["Ctrl/Cmd", "Enter"], description: "Save the cue currently in the form" },
    { keys: ["Alt", "↓"], description: "Load the next cue into the edit form" },
    { keys: ["Alt", "↑"], description: "Load the previous cue into the edit form" },
    { keys: ["Alt", "←"], description: "Nudge the editing cue 100ms earlier" },
    { keys: ["Alt", "→"], description: "Nudge the editing cue 100ms later" },
    { keys: ["?"], description: "Toggle this keyboard shortcuts overlay" },
    { keys: ["Esc"], description: "Close this keyboard shortcuts overlay" }
  ];

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const anchorHtml = (progress) =>
    `<p class="scrolly__caption" data-at="${progress.toFixed(3)}" data-side="left">TODO: caption</p>`;
  const vttTimestamp = (seconds) => {
    const milliseconds = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor((milliseconds % 3600000) / 60000);
    const secs = Math.floor((milliseconds % 60000) / 1000);
    const ms = milliseconds % 1000;
    return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":") +
      `.${String(ms).padStart(3, "0")}`;
  };

  function setupPreview() {
    if (!previewEnabled) return;

    preview = document.createElement("aside");
    preview.className = "annotation-preview";
    preview.setAttribute("aria-label", "Live annotation preview");
    preview.innerHTML = `
      <strong>Annotation preview</strong>
      <span class="annotation-preview__time">0.000 / 0.000s</span>
      <span class="annotation-preview__active">No active caption</span>
      <button type="button">Copy current anchor</button>
      <span class="annotation-preview__status" aria-live="polite"></span>`;
    preview.querySelector("button").addEventListener("click", async () => {
      const progress = scrollProgress();
      const status = preview.querySelector(".annotation-preview__status");
      try {
        await navigator.clipboard.writeText(anchorHtml(progress));
        status.textContent = `Copied data-at=${progress.toFixed(3)}`;
      } catch {
        status.textContent = "Clipboard unavailable; copy permission required.";
      }
    });
    document.body.append(preview);
  }

  function setupVttCue() {
    if (!vttCueEnabled) return;

    vttCue = document.createElement("aside");
    vttCue.className = "annotation-preview vtt-cue";
    vttCue.setAttribute("aria-label", "WebVTT cue helper");
    vttCue.innerHTML = `
      <strong>WebVTT cue helper</strong>
      <span class="vtt-cue__time">0.000s</span>
      <button type="button">Mark cue start</button>
      <span class="annotation-preview__status" aria-live="polite">Temporary only; no cue is saved.</span>`;
    vttCue.querySelector("button").addEventListener("click", async () => {
      const targetTime = scrollProgress() * video.duration;
      const button = vttCue.querySelector("button");
      const status = vttCue.querySelector(".annotation-preview__status");
      if (cueStart === null) {
        cueStart = targetTime;
        button.textContent = "Copy WebVTT cue";
        status.textContent = `Start marked at ${vttTimestamp(cueStart)}`;
        return;
      }
      if (targetTime <= cueStart) {
        status.textContent = "Move forward before copying a cue.";
        return;
      }
      try {
        await navigator.clipboard.writeText(
          `${vttTimestamp(cueStart)} --> ${vttTimestamp(targetTime)}\nTODO: annotation\n`
        );
        status.textContent = `Copied ${vttTimestamp(cueStart)} → ${vttTimestamp(targetTime)}`;
        cueStart = null;
        button.textContent = "Mark cue start";
      } catch {
        status.textContent = "Clipboard unavailable; copy permission required.";
      }
    });
    document.body.append(vttCue);
  }

  const cueSpatial = (cue) => ({
    x: Number.isFinite(cue.x) ? clamp(cue.x, 0, 100) : 50,
    y: Number.isFinite(cue.y) ? clamp(cue.y, 0, 100) : 8,
    size: Number.isFinite(cue.size) ? clamp(cue.size, 1, 100) : 60
  });

  const cueAlign = (cue) => (CUE_TEXT_ALIGN_VALUES.includes(cue.align) ? cue.align : "center");

  const cueSettings = (cue) => {
    const { x, y, size } = cueSpatial(cue);
    return `line:${y}%,center position:${x}%,center size:${size}% align:${cueAlign(cue)}`;
  };

  const cueVoice = (cue) => (typeof cue.voice === "string" ? cue.voice.trim() : "");

  const cueName = (cue) =>
    (typeof cue.name === "string" ? cue.name : "").replace(/-->/g, "").replace(/[\r\n]+/g, " ").trim();

  function escapeVttCueText(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function unescapeVttCueText(text) {
    return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  }

  function buildVtt() {
    const body = [...editorCues]
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id)
      .map((cue) => {
        const name = cueVoice(cue);
        const payload = `${name ? `<v ${escapeVttCueText(name)}>` : ""}${escapeVttCueText(cue.text)}`;
        const identifier = cueName(cue);
        return `${identifier ? `${identifier}\n` : ""}${vttTimestamp(cue.start)} --> ${vttTimestamp(cue.end)} ${cueSettings(cue)}\n${payload}`;
      })
      .join("\n\n");
    return `WEBVTT\n\n${body}${body ? "\n" : ""}`;
  }

  async function copyVttFile(clipboard, vttText) {
    if (!clipboard || typeof clipboard.writeText !== "function") {
      throw new Error("Clipboard unavailable");
    }
    await clipboard.writeText(vttText);
    return vttText;
  }

  const srtTimestamp = (seconds) => vttTimestamp(seconds).replace(".", ",");

  function buildSrt() {
    const body = [...editorCues]
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id)
      .map((cue, index) => {
        const name = cueVoice(cue);
        const text = `${name ? `${name}: ` : ""}${cue.text}`;
        return `${index + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}\n${text}`;
      })
      .join("\n\n");
    return `${body}${body ? "\n" : ""}`;
  }

  function parseSrtTimestamp(raw) {
    const match = /^(?:(\d+):)?(\d{2}):(\d{2}),(\d{3})$/.exec(raw.trim());
    if (!match) return null;
    const [, hours, minutes, seconds, millis] = match;
    return Number(hours || 0) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
  }

  function parseSrtCues(text) {
    const lines = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
    const cues = [];
    let i = 0;
    while (i < lines.length) {
      const arrowIndex = lines[i].indexOf("-->");
      if (arrowIndex === -1) {
        i++;
        continue;
      }
      const start = parseSrtTimestamp(lines[i].slice(0, arrowIndex));
      const end = parseSrtTimestamp(lines[i].slice(arrowIndex + 3).trim().split(/\s+/)[0] || "");
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i++;
      }
      if (Number.isFinite(start) && Number.isFinite(end) && end > start && textLines.length) {
        cues.push({ start, end, text: textLines.join("\n").trim() });
      }
    }
    return cues;
  }

  function parseVttTimestamp(raw) {
    const match = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/.exec(raw.trim());
    if (!match) return null;
    const [, hours, minutes, seconds, millis] = match;
    return Number(hours || 0) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
  }

  function parseVttCues(text) {
    const lines = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
    const cues = [];
    let i = 0;
    let pendingId = "";
    while (i < lines.length) {
      const arrowIndex = lines[i].indexOf("-->");
      if (arrowIndex === -1) {
        const trimmed = lines[i].trim();
        pendingId = trimmed && !trimmed.includes("-->") &&
          !/^(?:WEBVTT|NOTE)(?:[ \t]|$)/.test(trimmed) &&
          i + 1 < lines.length && lines[i + 1].includes("-->")
          ? trimmed
          : "";
        i++;
        continue;
      }
      const start = parseVttTimestamp(lines[i].slice(0, arrowIndex));
      const timingTail = lines[i].slice(arrowIndex + 3).trim().split(/\s+/);
      const end = parseVttTimestamp(timingTail.shift() || "");
      const settings = timingTail.join(" ");
      const line = /(?:^|\s)line:([\d.]+)%(?:,center)?(?:\s|$)/.exec(settings);
      const position = /(?:^|\s)position:([\d.]+)%(?:,center)?(?:\s|$)/.exec(settings);
      const size = /(?:^|\s)size:([\d.]+)%(?:\s|$)/.exec(settings);
      const alignMatch = /(?:^|\s)align:(start|center|end|left|right)(?:\s|$)/.exec(settings);
      const align = alignMatch ? ({ left: "start", right: "end" }[alignMatch[1]] || alignMatch[1]) : "center";
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i++;
      }
      if (Number.isFinite(start) && Number.isFinite(end) && end > start && textLines.length) {
        const rawText = textLines.join("\n").trim();
        const voiceMatch = /^<v(?:\.[^\s>]+)*(?:[ \t]+([^>]*))?>[ \t]?/.exec(rawText);
        const voice = voiceMatch ? unescapeVttCueText((voiceMatch[1] || "").trim()) : "";
        const body = voiceMatch ? rawText.slice(voiceMatch[0].length).replace(/<\/v>\s*$/, "") : rawText;
        cues.push({
          start,
          end,
          text: unescapeVttCueText(body.trim()),
          x: position ? clamp(Number(position[1]), 0, 100) : 50,
          y: line ? clamp(Number(line[1]), 0, 100) : 8,
          size: size ? clamp(Number(size[1]), 1, 100) : 60,
          ...(pendingId ? { name: pendingId } : {}),
          ...(voice ? { voice } : {}),
          ...(align !== "center" ? { align } : {})
        });
      }
      pendingId = "";
    }
    return cues;
  }

  function referenceMarkersFromVtt(text) {
    return [...new Set(parseVttCues(text).flatMap((cue) => [cue.start, cue.end]))]
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
  }

  function snapRetimeToMarkers(cue, requestedStart, videoDuration, markers, tolerance) {
    const retimed = retimeCueFromTimeline(cue, requestedStart, videoDuration);
    if (!retimed || !Array.isArray(markers) || !Number.isFinite(tolerance) || tolerance < 0) return retimed;
    const candidates = markers.flatMap((marker) => [
      { distance: Math.abs(marker - retimed.start), start: marker },
      { distance: Math.abs(marker - retimed.end), start: marker - (retimed.end - retimed.start) }
    ]).filter((candidate) => candidate.distance <= tolerance);
    candidates.sort((a, b) => a.distance - b.distance || a.start - b.start);
    return candidates.length ? retimeCueFromTimeline(cue, candidates[0].start, videoDuration) : retimed;
  }

  function findCueOverlaps(cues) {
    const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id);
    const cueIds = new Set();
    let pairCount = 0;
    sorted.forEach((cue, index) => {
      for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex++) {
        const next = sorted[nextIndex];
        if (next.start >= cue.end) break;
        cueIds.add(cue.id);
        cueIds.add(next.id);
        pairCount++;
      }
    });
    return { cueIds, pairCount };
  }

  function findNearDuplicateCues(cues) {
    const cueIds = new Set();
    let pairCount = 0;
    cues.forEach((cue, index) => {
      for (let nextIndex = index + 1; nextIndex < cues.length; nextIndex++) {
        const next = cues[nextIndex];
        if (
          Math.round(Math.abs(cue.start - next.start) * 1000) <= NEAR_DUPLICATE_CUE_TOLERANCE_SECONDS * 1000 &&
          Math.round(Math.abs(cue.end - next.end) * 1000) <= NEAR_DUPLICATE_CUE_TOLERANCE_SECONDS * 1000
        ) {
          cueIds.add(cue.id);
          cueIds.add(next.id);
          pairCount++;
        }
      }
    });
    return { cueIds, pairCount };
  }

  function findCuesPastVideoEnd(cues, duration) {
    if (!Number.isFinite(duration)) return new Set();
    return new Set(cues.filter((cue) => cue.start > duration || cue.end > duration).map((cue) => cue.id));
  }

  function findShortCues(cues) {
    return new Set(cues.filter((cue) => cue.end - cue.start < SHORT_CUE_THRESHOLD_SECONDS).map((cue) => cue.id));
  }

  function findEmptyCueBodies(cues) {
    return new Set(cues.filter((cue) => typeof cue.text !== "string" || !cue.text.trim() || cue.text.trim() === "TODO").map((cue) => cue.id));
  }

  function findFastReadingCues(cues) {
    return new Set(cues.filter((cue) => {
      const duration = cue.end - cue.start;
      return duration > 0 && typeof cue.text === "string" &&
        cue.text.trim().length / duration > MAX_CUE_CHARACTERS_PER_SECOND;
    }).map((cue) => cue.id));
  }

  function duplicateCue(cue, id) {
    const duration = cue.end - cue.start;
    const clone = { id, start: cue.end, end: cue.end + duration, text: cue.text, x: cue.x, y: cue.y, size: cue.size };
    if (typeof cue.voice === "string" && cue.voice.trim()) clone.voice = cue.voice.trim();
    if (CUE_TEXT_ALIGN_VALUES.includes(cue.align) && cue.align !== "center") clone.align = cue.align;
    if (cueName(cue)) clone.name = cueName(cue);
    return clone;
  }

  function splitCueAtTime(cue, time, newId) {
    if (!Number.isFinite(time) || time <= cue.start || time >= cue.end) return null;
    return [
      { ...cue, end: time },
      { ...cue, id: newId, start: time }
    ];
  }

  function snapCueEndToNextStart(cues, cueId) {
    const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id);
    const index = sorted.findIndex((cue) => cue.id === cueId);
    const cue = sorted[index];
    const next = sorted[index + 1];
    if (!cue || !next || next.start <= cue.start) return null;
    return cues.map((item) => item.id === cueId ? { ...item, end: next.start } : { ...item });
  }

  function snapCueStartToPreviousEnd(cues, cueId) {
    const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id);
    const index = sorted.findIndex((cue) => cue.id === cueId);
    const cue = sorted[index];
    const previous = sorted[index - 1];
    if (!cue || !previous || previous.end >= cue.end) return null;
    return cues.map((item) => item.id === cueId ? { ...item, start: previous.end } : { ...item });
  }

  function mergeCueWithNext(cues, cueId) {
    const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id);
    const index = sorted.findIndex((cue) => cue.id === cueId);
    const cue = sorted[index];
    const next = sorted[index + 1];
    if (!cue || !next) return null;
    const merged = {
      id: cue.id,
      start: cue.start,
      end: Math.max(cue.end, next.end),
      text: `${cue.text}\n${next.text}`,
      x: cue.x,
      y: cue.y,
      size: cue.size
    };
    if (typeof cue.voice === "string" && cue.voice.trim()) merged.voice = cue.voice.trim();
    if (CUE_TEXT_ALIGN_VALUES.includes(cue.align) && cue.align !== "center") merged.align = cue.align;
    if (cueName(cue)) merged.name = cueName(cue);
    return cues.filter((item) => item.id !== cue.id && item.id !== next.id).concat(merged);
  }

  function offsetCueTimings(cues, offset) {
    if (!Number.isFinite(offset) || cues.some((cue) => cue.start + offset < 0)) return null;
    return cues.map((cue) => ({ ...cue, start: cue.start + offset, end: cue.end + offset }));
  }

  function retimeCueFromTimeline(cue, requestedStart, videoDuration) {
    const duration = cue.end - cue.start;
    if (!Number.isFinite(requestedStart) || !Number.isFinite(duration) || duration <= 0 ||
        (Number.isFinite(videoDuration) && videoDuration > 0 && duration > videoDuration)) return null;
    const latestStart = Number.isFinite(videoDuration) && videoDuration > 0
      ? Math.max(0, videoDuration - duration)
      : requestedStart;
    const start = Math.round(clamp(requestedStart, 0, latestStart) * 1000) / 1000;
    return { ...cue, start, end: Math.round((start + duration) * 1000) / 1000 };
  }

  function moveCueInList(cues, cueId, direction) {
    const index = cues.findIndex((cue) => cue.id === cueId);
    const targetIndex = direction === "up" ? index - 1 : direction === "down" ? index + 1 : -1;
    if (index < 0 || targetIndex < 0 || targetIndex >= cues.length) return null;
    const reordered = [...cues];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    return reordered;
  }

  function pruneSelectedCueIds(selectedIds, cues) {
    const validIds = new Set(cues.map((cue) => cue.id));
    return new Set([...selectedIds].filter((id) => validIds.has(id)));
  }

  function deleteCuesByIds(cues, idsToDelete) {
    return cues.filter((cue) => !idsToDelete.has(cue.id));
  }

  function findCueBodiesWithBlankLines(cues) {
    return new Set(cues.filter((cue) =>
      typeof cue.text === "string" && /(?:\r?\n)[\t ]*(?:\r?\n)/.test(cue.text)
    ).map((cue) => cue.id));
  }

  function findCueGaps(cues) {
    const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id);
    const cueIds = new Set();
    let gapCount = 0;
    let frontier = null;
    let frontierId = null;
    sorted.forEach((cue) => {
      if (frontier !== null && cue.start - frontier > CUE_GAP_THRESHOLD_SECONDS) {
        cueIds.add(frontierId);
        gapCount++;
      }
      if (frontier === null || cue.end > frontier) {
        frontier = cue.end;
        frontierId = cue.id;
      }
    });
    return { cueIds, gapCount };
  }

  function findCueValidationIssues(cues, duration) {
    const checks = [
      [findCueOverlaps(cues).cueIds, "Overlaps another cue"],
      [findNearDuplicateCues(cues).cueIds, "Near-duplicate timing"],
      [findCuesPastVideoEnd(cues, duration), "Extends past video end"],
      [findShortCues(cues), "Very short cue"],
      [findEmptyCueBodies(cues), "Needs annotation text"],
      [findFastReadingCues(cues), "High reading speed"],
      [findCueBodiesWithBlankLines(cues), "Blank line splits WebVTT cue"],
      [findCueGaps(cues).cueIds, "Gap before next cue"]
    ];
    return [...cues]
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id)
      .map((cue) => ({ cue, labels: checks.filter(([ids]) => ids.has(cue.id)).map(([, label]) => label) }))
      .filter((entry) => entry.labels.length > 0);
  }

  function currentScrubTime() {
    return Number.isFinite(video.duration) ? scrollProgress() * video.duration : 0;
  }

  function scrollToVideoTime(seconds) {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return false;
    const progress = clamp(seconds / video.duration, 0, 1);
    const rect = track.getBoundingClientRect();
    const trackTop = window.scrollY + rect.top;
    const scrollable = Math.max(0, rect.height - window.innerHeight);
    window.scrollTo({ top: trackTop + progress * scrollable, behavior: "auto" });
    onScroll();
    return true;
  }

  function vttShortcutField(event) {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return null;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return null;
    return event.key.toLowerCase() === "i" ? "start" : event.key.toLowerCase() === "o" ? "end" : null;
  }

  function isShortcutHelpToggle(event) {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return false;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return false;
    return event.key === "?";
  }

  function isCueSubmitShortcut(event, form) {
    return event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.repeat && form.contains(event.target);
  }

  function cueEditNavigationDirection(event, form) {
    if (event.repeat || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !form.contains(event.target)) return null;
    if (event.key === "ArrowDown") return "next";
    if (event.key === "ArrowUp") return "prev";
    return null;
  }

  function cueTimingNudgeDirection(event, form) {
    if (event.repeat || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !form.contains(event.target)) return 0;
    if (event.key === "ArrowLeft") return -0.1;
    if (event.key === "ArrowRight") return 0.1;
    return 0;
  }

  function nudgeCueTiming(cue, delta) {
    if (!cue || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start ||
        !Number.isFinite(delta) || cue.start + delta < 0) return null;
    return {
      ...cue,
      start: Math.round((cue.start + delta) * 1000) / 1000,
      end: Math.round((cue.end + delta) * 1000) / 1000
    };
  }

  function adjacentCueInDirection(cues, cueId, direction) {
    const sorted = [...cues].sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id);
    const index = sorted.findIndex((item) => item.id === cueId);
    if (index === -1) return null;
    const targetIndex = direction === "next" ? index + 1 : index - 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return null;
    return { cue: sorted[targetIndex], position: targetIndex + 1, total: sorted.length };
  }

  function cueTextMatches(cues, query) {
    const needle = String(query || "").trim().toLocaleLowerCase();
    if (!needle) return cues;
    return cues.filter((cue) => String(cue.text || "").toLocaleLowerCase().includes(needle));
  }

  function nextCueTextMatch(cues, query, cueId, direction) {
    const matches = cueTextMatches(cues, query);
    if (!matches.length) return null;
    const currentIndex = matches.findIndex((cue) => cue.id === cueId);
    const index = currentIndex === -1
      ? (direction === "previous" ? matches.length - 1 : 0)
      : (currentIndex + (direction === "previous" ? -1 : 1) + matches.length) % matches.length;
    return { cue: matches[index], position: index + 1, total: matches.length };
  }

  function setEditorStatus(message) {
    if (vttEditor) vttEditor.querySelector(".vtt-editor__status").textContent = message;
  }

  function loadPersistedCues() {
    try {
      const raw = localStorage.getItem(VTT_EDITOR_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (cue) =>
          cue &&
          Number.isFinite(cue.start) &&
          Number.isFinite(cue.end) &&
          cue.start >= 0 &&
          cue.end > cue.start &&
          typeof cue.text === "string" &&
          cue.text.trim()
      );
    } catch {
      return [];
    }
  }

  function snapshotCues(cues) {
    return cues.map((cue) => ({ ...cue }));
  }

  function setDestructiveUndoSnapshot(cues) {
    destructiveUndoSnapshot = snapshotCues(cues);
    if (vttEditor) vttEditor.querySelector('[data-action="undo-destructive"]').disabled = false;
    redoSnapshot = null;
    if (vttEditor) {
      const redoButton = vttEditor.querySelector('[data-action="redo-destructive"]');
      if (redoButton) redoButton.disabled = true;
    }
  }

  function saveEditorCues() {
    try {
      localStorage.setItem(
        VTT_EDITOR_STORAGE_KEY,
        JSON.stringify(editorCues.map((cue) => {
          const { start, end, text, x, y, size } = cue;
          const voice = cueVoice(cue);
          const align = cueAlign(cue);
          const name = cueName(cue);
          return { start, end, text, ...cueSpatial({ x, y, size }), ...(name ? { name } : {}), ...(voice ? { voice } : {}), ...(align !== "center" ? { align } : {}) };
        }))
      );
    } catch {
      setEditorStatus("Cue saved in memory, but local storage is unavailable.");
    }
  }

  function resetEditorForm({ rollback = true } = {}) {
    if (!vttEditor) return;
    if (rollback && editingCueId !== null && editingCueOriginal) {
      const cue = editorCues.find((item) => item.id === editingCueId);
      if (cue) Object.assign(cue, editingCueOriginal);
      updateVttAnnotation();
    }
    editingCueId = null;
    editingCueOriginal = null;
    vttEditor.querySelector("form").reset();
    vttEditor.querySelector(".vtt-editor__save").textContent = "Add cue";
    vttEditor.querySelector(".vtt-editor__cancel").hidden = true;
  }

  function startEditingCue(cue) {
    if (!vttEditor) return;
    const form = vttEditor.querySelector("form");
    editingCueId = cue.id;
    editingCueOriginal = { ...cue };
    form.elements.start.value = cue.start.toFixed(3);
    form.elements.end.value = cue.end.toFixed(3);
    form.elements.text.value = cue.text;
    form.elements.voice.value = cueVoice(cue);
    form.elements.cueName.value = cueName(cue);
    form.elements.align.value = cueAlign(cue);
    const spatial = cueSpatial(cue);
    form.elements.x.value = spatial.x;
    form.elements.y.value = spatial.y;
    form.elements.size.value = spatial.size;
    vttEditor.querySelector(".vtt-editor__save").textContent = "Update cue";
    vttEditor.querySelector(".vtt-editor__cancel").hidden = false;
  }

  function renderEditorCues() {
    if (!vttEditor) return;
    selectedCueIds = pruneSelectedCueIds(selectedCueIds, editorCues);
    const list = vttEditor.querySelector(".vtt-editor__list");
    const overlaps = findCueOverlaps(editorCues);
    const nearDuplicates = findNearDuplicateCues(editorCues);
    const pastVideoEnd = findCuesPastVideoEnd(editorCues, video.duration);
    const shortCues = findShortCues(editorCues);
    const emptyCueBodies = findEmptyCueBodies(editorCues);
    const fastReadingCues = findFastReadingCues(editorCues);
    const cueBodiesWithBlankLines = findCueBodiesWithBlankLines(editorCues);
    const cueGaps = findCueGaps(editorCues);
    const validationIssues = findCueValidationIssues(editorCues, video.duration);
    const searchQuery = vttEditor.querySelector("[data-cue-search]").value;
    const visibleCues = cueTextMatches(editorCues, searchQuery);
    const visibleCueIds = new Set(visibleCues.map((cue) => cue.id));
    list.replaceChildren();
    const sortedCues = [...editorCues].sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id);
    editorCues.forEach((cue, cueIndex) => {
        if (!visibleCueIds.has(cue.id)) return;
        const chronologicalIndex = sortedCues.findIndex((item) => item.id === cue.id);
        const item = document.createElement("li");
        item.dataset.cueId = String(cue.id);
        const selectCheckbox = document.createElement("input");
        selectCheckbox.type = "checkbox";
        selectCheckbox.dataset.action = "select-cue";
        selectCheckbox.setAttribute("aria-label", "Select cue for bulk actions");
        selectCheckbox.checked = selectedCueIds.has(cue.id);
        const summary = document.createElement("span");
        summary.className = "vtt-editor__cue-summary";
        const spatial = cueSpatial(cue);
        const alignNote = cueAlign(cue) === "center" ? "" : ` align ${cueAlign(cue)}`;
        const idNote = cueName(cue) ? `#${cueName(cue)} ` : "";
        summary.textContent = `${idNote}${vttTimestamp(cue.start)} → ${vttTimestamp(cue.end)} · x ${spatial.x}% y ${spatial.y}%${alignNote} · ${cueVoice(cue) ? `${cueVoice(cue)}: ` : ""}${cue.text}`;
        if (overlaps.cueIds.has(cue.id)) {
          item.classList.add("is-overlapping");
          const warning = document.createElement("strong");
          warning.className = "vtt-editor__overlap-label";
          warning.textContent = "Overlaps another cue";
          summary.append(" ", warning);
        }
        if (nearDuplicates.cueIds.has(cue.id)) {
          item.classList.add("is-near-duplicate");
          const warning = document.createElement("strong");
          warning.className = "vtt-editor__duplicate-label";
          warning.textContent = "Near-duplicate timing";
          summary.append(" ", warning);
        }
        if (pastVideoEnd.has(cue.id)) {
          item.classList.add("is-past-video-end");
          const warning = document.createElement("strong");
          warning.className = "vtt-editor__duration-label";
          warning.textContent = "Extends past video end";
          summary.append(" ", warning);
        }
        if (shortCues.has(cue.id)) {
          item.classList.add("is-short-cue");
          const warning = document.createElement("strong");
          warning.className = "vtt-editor__short-cue-label";
          warning.textContent = "Very short cue";
          summary.append(" ", warning);
        }
        if (emptyCueBodies.has(cue.id)) {
          item.classList.add("has-empty-body");
          const warning = document.createElement("strong");
          warning.className = "vtt-editor__empty-body-label";
          warning.textContent = "Needs annotation text";
          summary.append(" ", warning);
        }
        if (fastReadingCues.has(cue.id)) {
          item.classList.add("is-fast-reading");
          const warning = document.createElement("strong");
          warning.className = "vtt-editor__reading-speed-label";
          warning.textContent = "High reading speed";
          summary.append(" ", warning);
        }
        if (cueBodiesWithBlankLines.has(cue.id)) {
          item.classList.add("has-blank-line");
          const warning = document.createElement("strong");
          warning.className = "vtt-editor__blank-line-label";
          warning.textContent = "Blank line splits WebVTT cue";
          summary.append(" ", warning);
        }
        if (cueGaps.cueIds.has(cue.id)) {
          item.classList.add("has-gap-after");
          const warning = document.createElement("strong");
          warning.className = "vtt-editor__gap-label";
          warning.textContent = "Gap before next cue";
          summary.append(" ", warning);
        }
        const actions = document.createElement("span");
        actions.className = "vtt-editor__item-actions";
        const snapStartAction = chronologicalIndex > 0
          ? `<button type="button" data-action="snap-start">Start at previous cue end</button>`
          : "";
        const nextCueActions = chronologicalIndex < sortedCues.length - 1
          ? `<button type="button" data-action="snap-end">End at next cue</button><button type="button" data-action="merge-next">Merge with next</button>`
          : "";
        const moveUpAction = cueIndex > 0 ? `<button type="button" data-action="move-up" aria-label="Move cue up in list">Move up</button>` : "";
        const moveDownAction = cueIndex < editorCues.length - 1 ? `<button type="button" data-action="move-down" aria-label="Move cue down in list">Move down</button>` : "";
        actions.innerHTML = `<button type="button" data-action="go-to">Go to start</button><button type="button" data-action="split">Split at scrub time</button>${snapStartAction}${nextCueActions}<button type="button" data-action="duplicate">Duplicate</button>${moveUpAction}${moveDownAction}<button type="button" data-action="edit">Edit</button><button type="button" data-action="delete">Delete</button>`;
        const cueDuration = cue.end - cue.start;
        const timelineEnd = Number.isFinite(video.duration) && video.duration > 0
          ? Math.max(0, video.duration - cueDuration)
          : Math.max(cue.start, Math.max(...editorCues.map((item) => item.end)) - cueDuration);
        const timeline = document.createElement("label");
        timeline.className = "vtt-editor__timeline";
        timeline.textContent = "Drag timing";
        timeline.innerHTML += `<input type="range" min="0" max="${Math.max(0, timelineEnd)}" step="0.001" value="${cue.start}" data-action="timeline-retime" aria-label="Drag cue timing">`;
        item.append(selectCheckbox, summary, timeline, actions);
        list.append(item);
      });
    vttEditor.querySelector(".vtt-editor__count").textContent = searchQuery.trim()
      ? `${visibleCues.length} of ${editorCues.length} cues match`
      : `${editorCues.length} cue${editorCues.length === 1 ? "" : "s"}`;
    vttEditor.querySelectorAll("[data-search-direction]").forEach((button) => {
      button.disabled = !searchQuery.trim() || visibleCues.length === 0;
    });
    const selectedVisibleCount = visibleCues.filter((cue) => selectedCueIds.has(cue.id)).length;
    const selectAllVisible = vttEditor.querySelector('[data-action="select-all-visible"]');
    selectAllVisible.disabled = visibleCues.length === 0;
    selectAllVisible.checked = visibleCues.length > 0 && selectedVisibleCount === visibleCues.length;
    selectAllVisible.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleCues.length;
    const deleteSelected = vttEditor.querySelector('[data-action="delete-selected"]');
    deleteSelected.disabled = selectedCueIds.size === 0;
    deleteSelected.textContent = `Delete selected (${selectedCueIds.size})`;
    const warning = vttEditor.querySelector(".vtt-editor__overlap-warning");
    warning.hidden = overlaps.pairCount === 0;
    warning.textContent = overlaps.pairCount === 1
      ? "Warning: 1 overlapping cue pair."
      : `Warning: ${overlaps.pairCount} overlapping cue pairs.`;
    const duplicateWarning = vttEditor.querySelector(".vtt-editor__duplicate-warning");
    duplicateWarning.hidden = nearDuplicates.pairCount === 0;
    duplicateWarning.textContent = nearDuplicates.pairCount === 1
      ? "Warning: 1 near-duplicate cue pair."
      : `Warning: ${nearDuplicates.pairCount} near-duplicate cue pairs.`;
    const durationWarning = vttEditor.querySelector(".vtt-editor__duration-warning");
    durationWarning.hidden = pastVideoEnd.size === 0;
    durationWarning.textContent = pastVideoEnd.size === 1
      ? "Warning: 1 cue extends past video end."
      : `Warning: ${pastVideoEnd.size} cues extend past video end.`;
    const shortCueWarning = vttEditor.querySelector(".vtt-editor__short-cue-warning");
    shortCueWarning.hidden = shortCues.size === 0;
    shortCueWarning.textContent = shortCues.size === 1
      ? "Warning: 1 cue is very short."
      : `Warning: ${shortCues.size} cues are very short.`;
    const emptyBodyWarning = vttEditor.querySelector(".vtt-editor__empty-body-warning");
    emptyBodyWarning.hidden = emptyCueBodies.size === 0;
    emptyBodyWarning.textContent = emptyCueBodies.size === 1
      ? "Warning: 1 cue needs annotation text."
      : `Warning: ${emptyCueBodies.size} cues need annotation text.`;
    const readingSpeedWarning = vttEditor.querySelector(".vtt-editor__reading-speed-warning");
    readingSpeedWarning.hidden = fastReadingCues.size === 0;
    readingSpeedWarning.textContent = fastReadingCues.size === 1
      ? "Warning: 1 cue exceeds 20 characters per second."
      : `Warning: ${fastReadingCues.size} cues exceed 20 characters per second.`;
    const blankLineWarning = vttEditor.querySelector(".vtt-editor__blank-line-warning");
    blankLineWarning.hidden = cueBodiesWithBlankLines.size === 0;
    blankLineWarning.textContent = cueBodiesWithBlankLines.size === 1
      ? "Warning: 1 cue body contains a blank line that terminates a WebVTT cue."
      : `Warning: ${cueBodiesWithBlankLines.size} cue bodies contain blank lines that terminate WebVTT cues.`;
    const gapWarning = vttEditor.querySelector(".vtt-editor__gap-warning");
    gapWarning.hidden = cueGaps.gapCount === 0;
    gapWarning.textContent = cueGaps.gapCount === 1
      ? "Warning: 1 gap longer than 1s between cues."
      : `Warning: ${cueGaps.gapCount} gaps longer than 1s between cues.`;
    const summaryList = vttEditor.querySelector(".vtt-editor__validation-summary-list");
    summaryList.replaceChildren();
    validationIssues.forEach(({ cue, labels }) => {
      const item = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = `${vttTimestamp(cue.start)} → ${vttTimestamp(cue.end)} · ${labels.join(", ")}`;
      const jumpButton = document.createElement("button");
      jumpButton.type = "button";
      jumpButton.dataset.action = "validation-jump";
      jumpButton.dataset.cueId = String(cue.id);
      jumpButton.textContent = "Jump to cue";
      item.append(text, jumpButton);
      summaryList.append(item);
    });
    const summaryCount = vttEditor.querySelector(".vtt-editor__validation-summary-count");
    summaryCount.hidden = validationIssues.length === 0;
    summaryCount.textContent = validationIssues.length === 1
      ? "1 cue has an active warning."
      : `${validationIssues.length} cues have active warnings.`;
  }

  function setupVttEditor() {
    vttEditor = document.createElement("aside");
    vttEditor.className = "vtt-editor";
    vttEditor.hidden = !vttEditorEnabled;
    vttEditor.setAttribute("aria-label", "WebVTT cue editor");
    vttEditor.innerHTML = `
      <header><strong>WebVTT cue editor</strong><span class="vtt-editor__live">00:00:00.000</span></header>
      <span class="vtt-editor__shortcuts"><kbd>I</kbd> mark in · <kbd>O</kbd> mark out · <kbd>Ctrl/Cmd</kbd>+<kbd>Enter</kbd> save cue · <kbd>Alt</kbd>+<kbd>↓</kbd>/<kbd>↑</kbd> next/prev cue · <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> nudge cue 100ms · <button type="button" class="vtt-editor__shortcut-help-toggle" data-action="toggle-shortcut-help">All shortcuts (<kbd>?</kbd>)</button></span>
      <form>
        <label>Start (seconds)<input name="start" type="number" min="0" step="0.001" required></label>
        <button type="button" data-set-time="start">Use scrub time</button>
        <label>End (seconds)<input name="end" type="number" min="0" step="0.001" required></label>
        <button type="button" data-set-time="end">Use scrub time</button>
        <label class="vtt-editor__text">Cue text<textarea name="text" rows="2" required></textarea></label>
        <label class="vtt-editor__voice">Speaker (optional)<input name="voice" type="text" autocomplete="off"></label>
        <label class="vtt-editor__cue-id">Cue identifier (optional)<input name="cueName" type="text" autocomplete="off"></label>
        <label class="vtt-editor__align">Text alignment<select name="align"><option value="start">Start</option><option value="center" selected>Center</option><option value="end">End</option></select></label>
        <fieldset class="vtt-editor__position"><legend>Position on video (%)</legend>
          <label>X<input name="x" type="number" min="0" max="100" step="1" value="50" required></label>
          <label>Y<input name="y" type="number" min="0" max="100" step="1" value="8" required></label>
          <label>Width<input name="size" type="number" min="1" max="100" step="1" value="60" required></label>
          <span class="vtt-editor__nudges" aria-label="Nudge cue position"><button type="button" data-nudge-y="-1">↑</button><button type="button" data-nudge-x="-1">←</button><button type="button" data-nudge-x="1">→</button><button type="button" data-nudge-y="1">↓</button></span>
        </fieldset>
        <div class="vtt-editor__form-actions"><button class="vtt-editor__save" type="submit">Add cue</button><button class="vtt-editor__cancel" type="button" hidden>Cancel edit</button></div>
      </form>
      <div class="vtt-editor__toolbar">
        <span class="vtt-editor__count">0 cues</span>
        <strong class="vtt-editor__overlap-warning" role="status" hidden></strong>
        <strong class="vtt-editor__duplicate-warning" role="status" hidden></strong>
        <strong class="vtt-editor__duration-warning" role="status" hidden></strong>
        <strong class="vtt-editor__short-cue-warning" role="status" hidden></strong>
        <strong class="vtt-editor__empty-body-warning" role="status" hidden></strong>
        <strong class="vtt-editor__reading-speed-warning" role="status" hidden></strong>
        <strong class="vtt-editor__blank-line-warning" role="status" hidden></strong>
        <strong class="vtt-editor__gap-warning" role="status" hidden></strong>
        <label class="vtt-editor__import">Import cues .vtt<input type="file" accept="text/vtt,.vtt" data-import></label>
        <label class="vtt-editor__import">Import cues .srt<input type="file" accept=".srt,application/x-subrip,text/srt" data-import-srt></label>
        <label class="vtt-editor__import">Import reference markers .vtt<input type="file" accept="text/vtt,.vtt" data-import-markers></label>
        <label class="vtt-editor__snap"><input type="checkbox" data-snap-markers checked disabled> Snap within 0.250s <span data-marker-count>(no markers)</span></label>
        <span class="vtt-editor__offset"><label>Offset all cues (seconds)<input type="number" step="0.001" value="0" data-offset></label><button type="button" data-action="offset-all">Shift timings</button></span>
        <button type="button" data-export="apply">Apply to video</button>
        <button type="button" data-export="copy">Copy .vtt</button>
        <button type="button" data-export="download">Download .vtt</button>
        <button type="button" data-export="download-srt">Download .srt</button>
        <button type="button" data-action="undo-destructive" disabled>Undo last cue change</button>
        <button type="button" data-action="redo-destructive" disabled>Redo</button>
        <button type="button" data-action="clear-all">Clear all cues</button>
        <label class="vtt-editor__bulk-select"><input type="checkbox" data-action="select-all-visible"> Select all visible</label>
        <button type="button" data-action="delete-selected" disabled>Delete selected (0)</button>
      </div>
      <div class="vtt-editor__search">
        <label>Find cue text<input type="search" autocomplete="off" placeholder="Search cue text" data-cue-search></label>
        <button type="button" data-search-direction="previous" aria-label="Previous matching cue" disabled>Previous</button>
        <button type="button" data-search-direction="next" aria-label="Next matching cue" disabled>Next</button>
      </div>
      <div class="vtt-editor__validation-summary">
        <strong class="vtt-editor__validation-summary-count" role="status" hidden></strong>
        <ol class="vtt-editor__validation-summary-list"></ol>
      </div>
      <ol class="vtt-editor__list"></ol>
      <span class="vtt-editor__status" aria-live="polite">Saved to this browser only.</span>
      <div class="vtt-editor__shortcut-help" hidden role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div class="vtt-editor__shortcut-help-panel">
          <header><strong>Keyboard shortcuts</strong><button type="button" data-action="close-shortcut-help" aria-label="Close keyboard shortcuts">&times;</button></header>
          <dl class="vtt-editor__shortcut-help-list"></dl>
        </div>
      </div>`;

    const form = vttEditor.querySelector("form");
    const setFormTime = (field) => {
      const time = currentScrubTime().toFixed(3);
      form.elements[field].value = time;
      setEditorStatus(`${field === "start" ? "Mark in" : "Mark out"} set at ${vttTimestamp(Number(time))}.`);
    };
    vttEditor.querySelectorAll("[data-set-time]").forEach((button) => {
      button.addEventListener("click", () => setFormTime(button.dataset.setTime));
    });
    const shortcutHelp = vttEditor.querySelector(".vtt-editor__shortcut-help");
    const shortcutHelpList = vttEditor.querySelector(".vtt-editor__shortcut-help-list");
    VTT_EDITOR_SHORTCUTS.forEach((entry) => {
      const dt = document.createElement("dt");
      dt.innerHTML = entry.keys.map((key) => `<kbd>${key}</kbd>`).join("+");
      const dd = document.createElement("dd");
      dd.textContent = entry.description;
      shortcutHelpList.append(dt, dd);
    });
    const setShortcutHelpVisible = (visible) => {
      shortcutHelp.hidden = !visible;
    };
    vttEditor.querySelector('[data-action="toggle-shortcut-help"]').addEventListener("click", () => {
      setShortcutHelpVisible(shortcutHelp.hidden);
    });
    vttEditor.querySelector('[data-action="close-shortcut-help"]').addEventListener("click", () => setShortcutHelpVisible(false));
    shortcutHelp.addEventListener("click", (event) => {
      if (event.target === shortcutHelp) setShortcutHelpVisible(false);
    });
    document.addEventListener("keydown", (event) => {
      if (vttEditor.hidden) return;
      if (event.key === "Escape" && !shortcutHelp.hidden) {
        event.preventDefault();
        setShortcutHelpVisible(false);
        return;
      }
      if (isShortcutHelpToggle(event)) {
        event.preventDefault();
        setShortcutHelpVisible(shortcutHelp.hidden);
        return;
      }
      const field = vttShortcutField(event);
      if (!field) return;
      event.preventDefault();
      setFormTime(field);
    });
    form.addEventListener("keydown", (event) => {
      if (isCueSubmitShortcut(event, form)) {
        event.preventDefault();
        form.requestSubmit();
        return;
      }
      const nudge = cueTimingNudgeDirection(event, form);
      if (nudge) {
        event.preventDefault();
        if (editingCueId === null) {
          setEditorStatus("Open a cue for editing to nudge its timing.");
          return;
        }
        const shifted = nudgeCueTiming({
          start: Number(form.elements.start.value),
          end: Number(form.elements.end.value)
        }, nudge);
        const snapEnabled = vttEditor.querySelector("[data-snap-markers]").checked;
        const snapped = shifted && snapEnabled
          ? snapRetimeToMarkers(shifted, shifted.start, video.duration, referenceMarkers, REFERENCE_MARKER_SNAP_TOLERANCE_SECONDS)
          : shifted;
        if (!snapped) {
          setEditorStatus("Cue needs valid timing and cannot move before 0.000s.");
          return;
        }
        form.elements.start.value = snapped.start.toFixed(3);
        form.elements.end.value = snapped.end.toFixed(3);
        const didSnap = snapped.start !== shifted.start;
        setEditorStatus(didSnap
          ? `Cue snapped to reference marker at ${vttTimestamp(snapped.start)}. Save to keep the change.`
          : `Cue moved ${nudge < 0 ? "earlier" : "later"} by 0.100s. Save to keep the change.`);
        return;
      }
      const direction = cueEditNavigationDirection(event, form);
      if (!direction) return;
      event.preventDefault();
      if (editingCueId === null) {
        setEditorStatus("Open a cue for editing to navigate between cues.");
        return;
      }
      const adjacent = adjacentCueInDirection(editorCues, editingCueId, direction);
      if (!adjacent) {
        setEditorStatus(direction === "next" ? "Already at the last cue." : "Already at the first cue.");
        return;
      }
      startEditingCue(adjacent.cue);
      setEditorStatus(`Editing cue ${adjacent.position} of ${adjacent.total} at ${vttTimestamp(adjacent.cue.start)}.`);
    });
    vttEditor.querySelectorAll("[data-nudge-x], [data-nudge-y]").forEach((button) => {
      button.addEventListener("click", () => {
        const axis = button.dataset.nudgeX ? "x" : "y";
        const delta = Number(button.dataset.nudgeX || button.dataset.nudgeY);
        form.elements[axis].value = clamp(Number(form.elements[axis].value) + delta, 0, 100);
        form.dispatchEvent(new Event("input", { bubbles: true }));
      });
    });
    form.addEventListener("input", () => {
      if (editingCueId === null) return;
      const cue = editorCues.find((item) => item.id === editingCueId);
      Object.assign(cue, {
        x: clamp(Number(form.elements.x.value), 0, 100),
        y: clamp(Number(form.elements.y.value), 0, 100),
        size: clamp(Number(form.elements.size.value), 1, 100)
      });
      updateVttAnnotation();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const start = Number(form.elements.start.value);
      const end = Number(form.elements.end.value);
      const text = form.elements.text.value.trim();
      const voice = form.elements.voice.value.trim();
      const name = form.elements.cueName.value.replace(/-->/g, "").replace(/[\r\n]+/g, " ").trim();
      const align = CUE_TEXT_ALIGN_VALUES.includes(form.elements.align.value) ? form.elements.align.value : "center";
      const x = Number(form.elements.x.value);
      const y = Number(form.elements.y.value);
      const size = Number(form.elements.size.value);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || !text ||
          !Number.isFinite(x) || x < 0 || x > 100 || !Number.isFinite(y) || y < 0 || y > 100 ||
          !Number.isFinite(size) || size < 1 || size > 100) {
        setEditorStatus("Cue needs text and an end after its start.");
        return;
      }
      if (editingCueId === null) {
        setDestructiveUndoSnapshot(editorCues);
        editorCues.push({ id: nextCueId++, start, end, text, x, y, size, voice, align, name });
        setEditorStatus("Cue added. Undo is available.");
      } else {
        const cue = editorCues.find((item) => item.id === editingCueId);
        Object.assign(cue, { start, end, text, x, y, size, voice, align, name });
        setEditorStatus("Cue updated.");
      }
      resetEditorForm({ rollback: false });
      renderEditorCues();
      updateVttAnnotation();
      saveEditorCues();
    });
    vttEditor.querySelector(".vtt-editor__cancel").addEventListener("click", resetEditorForm);
    vttEditor.querySelector("[data-cue-search]").addEventListener("input", (event) => {
      activeSearchCueId = null;
      renderEditorCues();
      const matches = cueTextMatches(editorCues, event.target.value);
      setEditorStatus(`${matches.length} matching cue${matches.length === 1 ? "" : "s"}.`);
    });
    vttEditor.querySelectorAll("[data-search-direction]").forEach((button) => {
      button.addEventListener("click", () => {
        const match = nextCueTextMatch(editorCues, vttEditor.querySelector("[data-cue-search]").value, activeSearchCueId, button.dataset.searchDirection);
        if (!match) {
          setEditorStatus("No matching cues.");
          return;
        }
        activeSearchCueId = match.cue.id;
        const item = vttEditor.querySelector(`[data-cue-id="${match.cue.id}"]`);
        if (item) item.scrollIntoView({ block: "nearest" });
        scrollToVideoTime(match.cue.start);
        setEditorStatus(`Match ${match.position} of ${match.total} at ${vttTimestamp(match.cue.start)}.`);
      });
    });
    vttEditor.querySelector(".vtt-editor__validation-summary-list").addEventListener("click", (event) => {
      const button = event.target.closest('[data-action="validation-jump"]');
      if (!button) return;
      const cue = editorCues.find((candidate) => candidate.id === Number(button.dataset.cueId));
      if (!cue) return;
      const item = vttEditor.querySelector(`.vtt-editor__list [data-cue-id="${cue.id}"]`);
      if (item) item.scrollIntoView({ block: "nearest" });
      setEditorStatus(
        scrollToVideoTime(cue.start)
          ? `Moved to cue start at ${vttTimestamp(cue.start)}.`
          : "Video timing is not ready yet."
      );
    });
    vttEditor.querySelector(".vtt-editor__list").addEventListener("input", (event) => {
      const slider = event.target.closest('[data-action="timeline-retime"]');
      const item = event.target.closest("li");
      if (!slider || !item) return;
      const cue = editorCues.find((candidate) => candidate.id === Number(item.dataset.cueId));
      const snapEnabled = vttEditor.querySelector("[data-snap-markers]").checked;
      const retimed = snapEnabled
        ? snapRetimeToMarkers(cue, Number(slider.value), video.duration, referenceMarkers, REFERENCE_MARKER_SNAP_TOLERANCE_SECONDS)
        : retimeCueFromTimeline(cue, Number(slider.value), video.duration);
      if (!retimed) return;
      Object.assign(cue, retimed);
      updateVttAnnotation();
      setEditorStatus(`Cue moved to ${vttTimestamp(cue.start)}; duration preserved.`);
    });
    vttEditor.querySelector(".vtt-editor__list").addEventListener("change", (event) => {
      if (!event.target.matches('[data-action="timeline-retime"]')) return;
      renderEditorCues();
      saveEditorCues();
    });
    vttEditor.querySelector(".vtt-editor__list").addEventListener("click", (event) => {
      const button = event.target.closest("button");
      const item = event.target.closest("li");
      if (!button || !item) return;
      const id = Number(item.dataset.cueId);
      const cue = editorCues.find((candidate) => candidate.id === id);
      if (button.dataset.action === "move-up" || button.dataset.action === "move-down") {
        const direction = button.dataset.action === "move-up" ? "up" : "down";
        const reordered = moveCueInList(editorCues, id, direction);
        if (!reordered) return;
        editorCues = reordered;
        renderEditorCues();
        saveEditorCues();
        setEditorStatus(`Moved cue ${direction} in the list; timing unchanged.`);
        return;
      }
      if (button.dataset.action === "go-to") {
        setEditorStatus(
          scrollToVideoTime(cue.start)
            ? `Moved to cue start at ${vttTimestamp(cue.start)}.`
            : "Video timing is not ready yet."
        );
        return;
      }
      if (button.dataset.action === "delete") {
        setDestructiveUndoSnapshot(editorCues);
        editorCues = editorCues.filter((cue) => cue.id !== id);
        if (editingCueId === id) resetEditorForm();
        renderEditorCues();
        updateVttAnnotation();
        saveEditorCues();
        setEditorStatus("Cue deleted.");
        return;
      }
      if (button.dataset.action === "duplicate") {
        const clone = duplicateCue(cue, nextCueId++);
        setDestructiveUndoSnapshot(editorCues);
        editorCues.push(clone);
        renderEditorCues();
        updateVttAnnotation();
        saveEditorCues();
        setEditorStatus(`Duplicated cue at ${vttTimestamp(clone.start)}.`);
        return;
      }
      if (button.dataset.action === "snap-start") {
        const snapped = snapCueStartToPreviousEnd(editorCues, id);
        if (!snapped) {
          setEditorStatus("The previous cue cannot form a valid start time.");
          return;
        }
        editorCues = snapped;
        if (editingCueId === id) resetEditorForm({ rollback: false });
        renderEditorCues();
        updateVttAnnotation();
        saveEditorCues();
        setEditorStatus("Cue start aligned to the previous cue end.");
        return;
      }
      if (button.dataset.action === "snap-end") {
        const snapped = snapCueEndToNextStart(editorCues, id);
        if (!snapped) {
          setEditorStatus("The next cue cannot form a valid end time.");
          return;
        }
        editorCues = snapped;
        if (editingCueId === id) resetEditorForm({ rollback: false });
        renderEditorCues();
        updateVttAnnotation();
        saveEditorCues();
        setEditorStatus("Cue end aligned to the next cue start.");
        return;
      }
      if (button.dataset.action === "merge-next") {
        const sorted = [...editorCues].sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id);
        const next = sorted[sorted.findIndex((item) => item.id === id) + 1];
        const merged = mergeCueWithNext(editorCues, id);
        if (!merged) {
          setEditorStatus("There is no next cue to merge with.");
          return;
        }
        setDestructiveUndoSnapshot(editorCues);
        if (editingCueId === id || (next && editingCueId === next.id)) resetEditorForm({ rollback: false });
        editorCues = merged;
        renderEditorCues();
        updateVttAnnotation();
        saveEditorCues();
        setEditorStatus("Merged cue with the next cue.");
        return;
      }
      if (button.dataset.action === "split") {
        const time = currentScrubTime();
        const split = splitCueAtTime(cue, time, nextCueId);
        if (!split) {
          setEditorStatus("Scrub time must be strictly inside this cue to split it.");
          return;
        }
        if (editingCueId === id) resetEditorForm({ rollback: false });
        nextCueId += 1;
        editorCues.splice(editorCues.indexOf(cue), 1, ...split);
        renderEditorCues();
        updateVttAnnotation();
        saveEditorCues();
        setEditorStatus(`Split cue at ${vttTimestamp(time)}.`);
        return;
      }
      startEditingCue(cue);
    });
    vttEditor.querySelector('[data-action="offset-all"]').addEventListener("click", () => {
      const input = vttEditor.querySelector("[data-offset]");
      const offset = Number(input.value);
      const shifted = offsetCueTimings(editorCues, offset);
      if (!shifted) {
        setEditorStatus("Offset must be a number and cannot move a cue before 0.000s.");
        return;
      }
      editorCues = shifted;
      renderEditorCues();
      updateVttAnnotation();
      saveEditorCues();
      setEditorStatus(`Shifted ${editorCues.length} cue${editorCues.length === 1 ? "" : "s"} by ${offset.toFixed(3)}s.`);
    });
    vttEditor.querySelector("[data-import]").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      let parsed;
      try {
        parsed = parseVttCues(await file.text());
      } catch {
        setEditorStatus("Could not read file.");
        return;
      }
      if (!parsed.length) {
        setEditorStatus("No valid cues found in that file.");
        return;
      }
      parsed.forEach((cue) => editorCues.push({ id: nextCueId++, ...cue }));
      renderEditorCues();
      updateVttAnnotation();
      saveEditorCues();
      setEditorStatus(`Imported ${parsed.length} cue${parsed.length === 1 ? "" : "s"}.`);
    });
    vttEditor.querySelector("[data-import-srt]").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      let parsed;
      try {
        parsed = parseSrtCues(await file.text());
      } catch {
        setEditorStatus("Could not read file.");
        return;
      }
      if (!parsed.length) {
        setEditorStatus("No valid cues found in that file.");
        return;
      }
      parsed.forEach((cue) => editorCues.push({ id: nextCueId++, ...cue }));
      renderEditorCues();
      updateVttAnnotation();
      saveEditorCues();
      setEditorStatus(`Imported ${parsed.length} cue${parsed.length === 1 ? "" : "s"} from SRT.`);
    });
    vttEditor.querySelector("[data-import-markers]").addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      try {
        referenceMarkers = referenceMarkersFromVtt(await file.text());
      } catch {
        referenceMarkers = [];
      }
      const toggle = vttEditor.querySelector("[data-snap-markers]");
      toggle.disabled = referenceMarkers.length === 0;
      vttEditor.querySelector("[data-marker-count]").textContent = referenceMarkers.length
        ? `(${referenceMarkers.length} markers)`
        : "(no markers)";
      setEditorStatus(referenceMarkers.length
        ? `Loaded ${referenceMarkers.length} reference markers; cues were not imported.`
        : "No valid reference markers found in that file.");
    });
    vttEditor.querySelector('[data-action="undo-destructive"]').addEventListener("click", (event) => {
      if (!destructiveUndoSnapshot) return;
      redoSnapshot = snapshotCues(editorCues);
      editorCues = snapshotCues(destructiveUndoSnapshot);
      destructiveUndoSnapshot = null;
      event.currentTarget.disabled = true;
      const redoButton = vttEditor.querySelector('[data-action="redo-destructive"]');
      if (redoButton) redoButton.disabled = false;
      resetEditorForm({ rollback: false });
      renderEditorCues();
      updateVttAnnotation();
      saveEditorCues();
      setEditorStatus("Last cue change undone. Redo is available.");
    });
    vttEditor.querySelector('[data-action="redo-destructive"]').addEventListener("click", (event) => {
      if (!redoSnapshot) return;
      const cuesToRestore = redoSnapshot;
      destructiveUndoSnapshot = snapshotCues(editorCues);
      const undoButton = vttEditor.querySelector('[data-action="undo-destructive"]');
      if (undoButton) undoButton.disabled = false;
      editorCues = snapshotCues(cuesToRestore);
      redoSnapshot = null;
      event.currentTarget.disabled = true;
      resetEditorForm({ rollback: false });
      renderEditorCues();
      updateVttAnnotation();
      saveEditorCues();
      setEditorStatus("Redo applied.");
    });
    vttEditor.querySelector('[data-action="clear-all"]').addEventListener("click", () => {
      if (!editorCues.length) {
        setEditorStatus("No cues to clear.");
        return;
      }
      if (!window.confirm(`Delete all ${editorCues.length} cue(s) and clear saved storage?`)) return;
      setDestructiveUndoSnapshot(editorCues);
      editorCues = [];
      selectedCueIds.clear();
      resetEditorForm();
      renderEditorCues();
      updateVttAnnotation();
      saveEditorCues();
      setEditorStatus("All cues cleared.");
    });
    vttEditor.querySelector(".vtt-editor__list").addEventListener("change", (event) => {
      const checkbox = event.target.closest('[data-action="select-cue"]');
      const item = event.target.closest("li");
      if (!checkbox || !item) return;
      const id = Number(item.dataset.cueId);
      if (checkbox.checked) selectedCueIds.add(id);
      else selectedCueIds.delete(id);
      renderEditorCues();
    });
    vttEditor.querySelector('[data-action="select-all-visible"]').addEventListener("change", (event) => {
      const searchQuery = vttEditor.querySelector("[data-cue-search]").value;
      const visible = cueTextMatches(editorCues, searchQuery);
      if (event.target.checked) visible.forEach((cue) => selectedCueIds.add(cue.id));
      else visible.forEach((cue) => selectedCueIds.delete(cue.id));
      renderEditorCues();
    });
    vttEditor.querySelector('[data-action="delete-selected"]').addEventListener("click", () => {
      if (!selectedCueIds.size) return;
      const count = selectedCueIds.size;
      if (!window.confirm(`Delete ${count} selected cue(s)?`)) return;
      setDestructiveUndoSnapshot(editorCues);
      const idsToDelete = new Set(selectedCueIds);
      editorCues = deleteCuesByIds(editorCues, idsToDelete);
      if (editingCueId !== null && idsToDelete.has(editingCueId)) resetEditorForm();
      selectedCueIds.clear();
      renderEditorCues();
      updateVttAnnotation();
      saveEditorCues();
      setEditorStatus(`Deleted ${count} selected cue(s).`);
    });
    vttEditor.querySelector('[data-export="apply"]').addEventListener("click", () => {
      replaceActiveAnnotationTrack(buildVtt());
      updateVttAnnotation();
      setEditorStatus(`Applied ${editorCues.length} cue${editorCues.length === 1 ? "" : "s"} to the video.`);
    });
    vttEditor.querySelector('[data-export="copy"]').addEventListener("click", async () => {
      try {
        await copyVttFile(navigator.clipboard, buildVtt());
        setEditorStatus(`Copied complete WebVTT file with ${editorCues.length} cue${editorCues.length === 1 ? "" : "s"}.`);
      } catch {
        setEditorStatus("Clipboard unavailable; copy permission required.");
      }
    });
    vttEditor.querySelector('[data-export="download"]').addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([buildVtt()], { type: "text/vtt" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "annotations.vtt";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setEditorStatus("annotations.vtt downloaded.");
    });
    vttEditor.querySelector('[data-export="download-srt"]').addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([buildSrt()], { type: "application/x-subrip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "annotations.srt";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setEditorStatus("annotations.srt downloaded.");
    });
    document.body.append(vttEditor);
    vttEditorToggle.setAttribute("aria-expanded", String(!vttEditor.hidden));
    vttEditorToggle.textContent = vttEditor.hidden ? "Abrir editor WebVTT" : "Cerrar editor WebVTT";
    vttEditorToggle.addEventListener("click", () => {
      vttEditor.hidden = !vttEditor.hidden;
      vttEditorToggle.setAttribute("aria-expanded", String(!vttEditor.hidden));
      vttEditorToggle.textContent = vttEditor.hidden ? "Abrir editor WebVTT" : "Cerrar editor WebVTT";
    });

    const restored = loadPersistedCues();
    if (restored.length) {
      editorCues = restored.map((cue) => ({ id: nextCueId++, ...cue }));
      renderEditorCues();
      updateVttAnnotation();
      setEditorStatus(`Restored ${restored.length} cue${restored.length === 1 ? "" : "s"} from this browser's storage.`);
    }
  }

  function updatePreview(progress, targetTime, activeCaption) {
    if (!preview) return;
    preview.querySelector(".annotation-preview__time").textContent =
      `${progress.toFixed(3)} / ${targetTime.toFixed(3)}s`;
    preview.querySelector(".annotation-preview__active").textContent = activeCaption
      ? `Active: ${activeCaption.el.textContent.trim()}`
      : "No active caption";
  }

  function updateVttCue(targetTime) {
    if (vttCue) {
      vttCue.querySelector(".vtt-cue__time").textContent = `${vttTimestamp(targetTime)}${cueStart === null ? "" : ` (start: ${vttTimestamp(cueStart)})`}`;
    }
    if (vttEditor) vttEditor.querySelector(".vtt-editor__live").textContent = vttTimestamp(targetTime);
  }

  function setTrackHeight(durationSeconds) {
    const vh = clamp(durationSeconds * VH_PER_SECOND, MIN_VH, MAX_VH);
    track.style.height = `${vh}vh`;
  }

  function scrollProgress() {
    const rect = track.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    if (scrollable <= 0) return 0;
    return clamp(-rect.top / scrollable, 0, 1);
  }

  function updateVttAnnotation() {
    const activeCues = annotationTrack.track.activeCues;
    const previews = activeCues ? Array.from(activeCues, (cue) => ({
      text: cue.text,
      x: Number.isFinite(cue.position) ? cue.position : 50,
      y: typeof cue.line === "number" && !cue.snapToLines ? cue.line : 8,
      size: Number.isFinite(cue.size) ? cue.size : 60,
      align: typeof cue.align === "string" ? cue.align : "center"
    })) : [];
    editorCues
      .filter((cue) => video.currentTime >= cue.start && video.currentTime < cue.end)
      .forEach((cue) => previews.push({ text: cue.text, ...cueSpatial(cue), align: cueAlign(cue) }));
    vttAnnotation.replaceChildren(...previews.map((cue) => {
      const element = document.createElement("span");
      element.className = "scrolly__vtt-cue";
      element.textContent = cue.text;
      element.style.left = `${cue.x}%`;
      element.style.top = `${cue.y}%`;
      element.style.width = `${cue.size}%`;
      element.style.textAlign = cue.align || "center";
      return element;
    }));
  }

  function updateCaptions(progress) {
    let activeCaption = null;
    captionAnchors.forEach((item, i) => {
      const next = captionAnchors[i + 1];
      const end = next ? next.at - 0.02 : 1;
      const visible = progress >= item.at && progress < end;
      item.el.classList.toggle("is-visible", visible);
      if (visible) activeCaption = item;
    });
    return activeCaption;
  }

  function render() {
    ticking = false;
    if (!inView || !isFinite(video.duration) || video.duration <= 0) return;

    const progress = scrollProgress();
    const targetTime = progress * video.duration;

    if (Math.abs(video.currentTime - targetTime) > 0.03) {
      video.currentTime = targetTime;
    }

    progressBar.style.width = `${progress * 100}%`;
    updateVttAnnotation();
    updateVttCue(targetTime);
    updatePreview(progress, targetTime, updateCaptions(progress));
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(render);
    }
  }

  function replaceActiveAnnotationTrack(vttText) {
    if (annotationObjectUrl) URL.revokeObjectURL(annotationObjectUrl);
    annotationObjectUrl = URL.createObjectURL(new Blob([vttText], { type: "text/vtt" }));
    customAnnotationLoaded = true;
    annotationTrack.track.mode = "disabled";
    annotationTrack.src = annotationObjectUrl;
    annotationTrack.track.mode = "hidden";
    vttAnnotation.textContent = "";
  }

  function loadVideoSource(src, { revoke } = {}) {
    if (revoke && objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    annotationTrack.track.mode = customAnnotationLoaded ? "hidden" : "disabled";
    vttAnnotation.textContent = "";
    video.src = src;
    video.load();
    video.addEventListener(
      "loadedmetadata",
      () => {
        setTrackHeight(video.duration);
        video.currentTime = 0;
        onScroll();
      },
      { once: true }
    );
  }

  video.addEventListener("durationchange", renderEditorCues);
  annotationTrack.track.mode = "hidden";
  annotationTrack.track.addEventListener("cuechange", updateVttAnnotation);
  setupPreview();
  setupVttCue();
  setupVttEditor();

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    objectUrl = URL.createObjectURL(file);
    loadVideoSource(objectUrl, { revoke: false });
    track.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  vttFileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (annotationObjectUrl) URL.revokeObjectURL(annotationObjectUrl);
    annotationObjectUrl = URL.createObjectURL(file);
    customAnnotationLoaded = true;
    annotationTrack.track.mode = "disabled";
    annotationTrack.src = annotationObjectUrl;
    annotationTrack.track.mode = "hidden";
    vttAnnotation.textContent = "";
    track.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        inView = entry.isIntersecting;
        if (inView) onScroll();
      });
    },
    { threshold: 0 }
  );
  observer.observe(track);

  window.addEventListener("scroll", onScroll, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      // rAF is throttled/paused while hidden, so currentTime can go stale;
      // resync as soon as focus returns instead of waiting for the next
      // manual scroll, which is what made the catch-up jump feel jarring.
      ticking = false;
      onScroll();
    }
  });

  if (video.readyState >= 1) {
    setTrackHeight(video.duration);
  } else {
    video.addEventListener("loadedmetadata", () => setTrackHeight(video.duration), { once: true });
  }
})();
