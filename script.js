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
  let editingCueId = null;
  let nextCueId = 1;
  const VTT_EDITOR_STORAGE_KEY = "sport-frames:vtt-editor-cues";

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

  function buildVtt() {
    const body = [...editorCues]
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id)
      .map((cue) => `${vttTimestamp(cue.start)} --> ${vttTimestamp(cue.end)}\n${cue.text}`)
      .join("\n\n");
    return `WEBVTT\n\n${body}${body ? "\n" : ""}`;
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
    while (i < lines.length) {
      const arrowIndex = lines[i].indexOf("-->");
      if (arrowIndex === -1) {
        i++;
        continue;
      }
      const start = parseVttTimestamp(lines[i].slice(0, arrowIndex));
      const end = parseVttTimestamp(lines[i].slice(arrowIndex + 3).trim().split(/\s+/)[0] || "");
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

  function saveEditorCues() {
    try {
      localStorage.setItem(
        VTT_EDITOR_STORAGE_KEY,
        JSON.stringify(editorCues.map(({ start, end, text }) => ({ start, end, text })))
      );
    } catch {
      setEditorStatus("Cue saved in memory, but local storage is unavailable.");
    }
  }

  function resetEditorForm() {
    if (!vttEditor) return;
    editingCueId = null;
    vttEditor.querySelector("form").reset();
    vttEditor.querySelector(".vtt-editor__save").textContent = "Add cue";
    vttEditor.querySelector(".vtt-editor__cancel").hidden = true;
  }

  function renderEditorCues() {
    if (!vttEditor) return;
    const list = vttEditor.querySelector(".vtt-editor__list");
    const overlaps = findCueOverlaps(editorCues);
    list.replaceChildren();
    [...editorCues]
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id - b.id)
      .forEach((cue) => {
        const item = document.createElement("li");
        item.dataset.cueId = String(cue.id);
        const summary = document.createElement("span");
        summary.textContent = `${vttTimestamp(cue.start)} → ${vttTimestamp(cue.end)}  ${cue.text}`;
        if (overlaps.cueIds.has(cue.id)) {
          item.classList.add("is-overlapping");
          const warning = document.createElement("strong");
          warning.className = "vtt-editor__overlap-label";
          warning.textContent = "Overlaps another cue";
          summary.append(" ", warning);
        }
        const actions = document.createElement("span");
        actions.className = "vtt-editor__item-actions";
        actions.innerHTML = `<button type="button" data-action="go-to">Go to start</button><button type="button" data-action="edit">Edit</button><button type="button" data-action="delete">Delete</button>`;
        item.append(summary, actions);
        list.append(item);
      });
    vttEditor.querySelector(".vtt-editor__count").textContent = `${editorCues.length} cue${editorCues.length === 1 ? "" : "s"}`;
    const warning = vttEditor.querySelector(".vtt-editor__overlap-warning");
    warning.hidden = overlaps.pairCount === 0;
    warning.textContent = overlaps.pairCount === 1
      ? "Warning: 1 overlapping cue pair."
      : `Warning: ${overlaps.pairCount} overlapping cue pairs.`;
  }

  function setupVttEditor() {
    vttEditor = document.createElement("aside");
    vttEditor.className = "vtt-editor";
    vttEditor.hidden = !vttEditorEnabled;
    vttEditor.setAttribute("aria-label", "WebVTT cue editor");
    vttEditor.innerHTML = `
      <header><strong>WebVTT cue editor</strong><span class="vtt-editor__live">00:00:00.000</span></header>
      <span class="vtt-editor__shortcuts"><kbd>I</kbd> mark in · <kbd>O</kbd> mark out</span>
      <form>
        <label>Start (seconds)<input name="start" type="number" min="0" step="0.001" required></label>
        <button type="button" data-set-time="start">Use scrub time</button>
        <label>End (seconds)<input name="end" type="number" min="0" step="0.001" required></label>
        <button type="button" data-set-time="end">Use scrub time</button>
        <label class="vtt-editor__text">Cue text<textarea name="text" rows="2" required></textarea></label>
        <div class="vtt-editor__form-actions"><button class="vtt-editor__save" type="submit">Add cue</button><button class="vtt-editor__cancel" type="button" hidden>Cancel edit</button></div>
      </form>
      <div class="vtt-editor__toolbar">
        <span class="vtt-editor__count">0 cues</span>
        <strong class="vtt-editor__overlap-warning" role="status" hidden></strong>
        <label class="vtt-editor__import">Import .vtt<input type="file" accept="text/vtt,.vtt" data-import></label>
        <button type="button" data-export="apply">Apply to video</button>
        <button type="button" data-export="download">Download .vtt</button>
        <button type="button" data-action="clear-all">Clear all cues</button>
      </div>
      <ol class="vtt-editor__list"></ol>
      <span class="vtt-editor__status" aria-live="polite">Saved to this browser only.</span>`;

    const form = vttEditor.querySelector("form");
    const setFormTime = (field) => {
      const time = currentScrubTime().toFixed(3);
      form.elements[field].value = time;
      setEditorStatus(`${field === "start" ? "Mark in" : "Mark out"} set at ${vttTimestamp(Number(time))}.`);
    };
    vttEditor.querySelectorAll("[data-set-time]").forEach((button) => {
      button.addEventListener("click", () => setFormTime(button.dataset.setTime));
    });
    document.addEventListener("keydown", (event) => {
      if (vttEditor.hidden) return;
      const field = vttShortcutField(event);
      if (!field) return;
      event.preventDefault();
      setFormTime(field);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const start = Number(form.elements.start.value);
      const end = Number(form.elements.end.value);
      const text = form.elements.text.value.trim();
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || !text) {
        setEditorStatus("Cue needs text and an end after its start.");
        return;
      }
      if (editingCueId === null) {
        editorCues.push({ id: nextCueId++, start, end, text });
        setEditorStatus("Cue added.");
      } else {
        const cue = editorCues.find((item) => item.id === editingCueId);
        Object.assign(cue, { start, end, text });
        setEditorStatus("Cue updated.");
      }
      resetEditorForm();
      renderEditorCues();
      updateVttAnnotation();
      saveEditorCues();
    });
    vttEditor.querySelector(".vtt-editor__cancel").addEventListener("click", resetEditorForm);
    vttEditor.querySelector(".vtt-editor__list").addEventListener("click", (event) => {
      const button = event.target.closest("button");
      const item = event.target.closest("li");
      if (!button || !item) return;
      const id = Number(item.dataset.cueId);
      const cue = editorCues.find((candidate) => candidate.id === id);
      if (button.dataset.action === "go-to") {
        setEditorStatus(
          scrollToVideoTime(cue.start)
            ? `Moved to cue start at ${vttTimestamp(cue.start)}.`
            : "Video timing is not ready yet."
        );
        return;
      }
      if (button.dataset.action === "delete") {
        editorCues = editorCues.filter((cue) => cue.id !== id);
        if (editingCueId === id) resetEditorForm();
        renderEditorCues();
        updateVttAnnotation();
        saveEditorCues();
        setEditorStatus("Cue deleted.");
        return;
      }
      editingCueId = id;
      form.elements.start.value = cue.start.toFixed(3);
      form.elements.end.value = cue.end.toFixed(3);
      form.elements.text.value = cue.text;
      vttEditor.querySelector(".vtt-editor__save").textContent = "Update cue";
      vttEditor.querySelector(".vtt-editor__cancel").hidden = false;
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
    vttEditor.querySelector('[data-action="clear-all"]').addEventListener("click", () => {
      if (!editorCues.length) {
        setEditorStatus("No cues to clear.");
        return;
      }
      if (!window.confirm(`Delete all ${editorCues.length} cue(s) and clear saved storage?`)) return;
      editorCues = [];
      resetEditorForm();
      renderEditorCues();
      updateVttAnnotation();
      saveEditorCues();
      setEditorStatus("All cues cleared.");
    });
    vttEditor.querySelector('[data-export="apply"]').addEventListener("click", () => {
      replaceActiveAnnotationTrack(buildVtt());
      updateVttAnnotation();
      setEditorStatus(`Applied ${editorCues.length} cue${editorCues.length === 1 ? "" : "s"} to the video.`);
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
    const trackText = activeCues ? Array.from(activeCues, (cue) => cue.text) : [];
    const editorText = editorCues
      .filter((cue) => video.currentTime >= cue.start && video.currentTime < cue.end)
      .map((cue) => cue.text);
    vttAnnotation.textContent = [...trackText, ...editorText].join(" ");
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
