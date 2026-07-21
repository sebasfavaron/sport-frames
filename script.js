(() => {
  const track = document.getElementById("scrolly");
  const video = document.getElementById("scrolly-video");
  const progressBar = document.getElementById("scrolly-progress-bar");
  const annotationTrack = document.getElementById("scrolly-annotations");
  const vttAnnotation = document.getElementById("scrolly-vtt-annotation");
  const captions = Array.from(document.querySelectorAll(".scrolly__caption"));
  const fileInput = document.getElementById("file-input");
  const vttFileInput = document.getElementById("vtt-file-input");
  const params = new URLSearchParams(window.location.search);
  const previewEnabled = params.has("annotation-preview");
  const vttCueEnabled = params.has("vtt-cue");
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

  function updatePreview(progress, targetTime, activeCaption) {
    if (!preview) return;
    preview.querySelector(".annotation-preview__time").textContent =
      `${progress.toFixed(3)} / ${targetTime.toFixed(3)}s`;
    preview.querySelector(".annotation-preview__active").textContent = activeCaption
      ? `Active: ${activeCaption.el.textContent.trim()}`
      : "No active caption";
  }

  function updateVttCue(targetTime) {
    if (!vttCue) return;
    vttCue.querySelector(".vtt-cue__time").textContent = `${vttTimestamp(targetTime)}${cueStart === null ? "" : ` (start: ${vttTimestamp(cueStart)})`}`;
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
    vttAnnotation.textContent = activeCues && activeCues.length
      ? Array.from(activeCues, (cue) => cue.text).join(" ")
      : "";
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

  function loadVideoSource(src, { revoke } = {}) {
    if (revoke && objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    annotationTrack.track.mode = (src === "assets/default.mp4" || customAnnotationLoaded)
      ? "hidden"
      : "disabled";
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
