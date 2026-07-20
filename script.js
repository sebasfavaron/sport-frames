(() => {
  const track = document.getElementById("scrolly");
  const video = document.getElementById("scrolly-video");
  const progressBar = document.getElementById("scrolly-progress-bar");
  const captions = Array.from(document.querySelectorAll(".scrolly__caption"));
  const fileInput = document.getElementById("file-input");
  const previewEnabled = new URLSearchParams(window.location.search).has("annotation-preview");
  const captionAnchors = captions
    .map((el) => ({ el, at: parseFloat(el.dataset.at) }))
    .filter((item) => Number.isFinite(item.at))
    .sort((a, b) => a.at - b.at);

  const VH_PER_SECOND = 40; // more = slower scroll per video-second = finer scrubbing
  const MIN_VH = 250;
  const MAX_VH = 3000;

  let objectUrl = null;
  let inView = false;
  let ticking = false;
  let preview = null;

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const anchorHtml = (progress) =>
    `<p class="scrolly__caption" data-at="${progress.toFixed(3)}" data-side="left">TODO: caption</p>`;

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

  function updatePreview(progress, targetTime, activeCaption) {
    if (!preview) return;
    preview.querySelector(".annotation-preview__time").textContent =
      `${progress.toFixed(3)} / ${targetTime.toFixed(3)}s`;
    preview.querySelector(".annotation-preview__active").textContent = activeCaption
      ? `Active: ${activeCaption.el.textContent.trim()}`
      : "No active caption";
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

  setupPreview();

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    objectUrl = URL.createObjectURL(file);
    loadVideoSource(objectUrl, { revoke: false });
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
