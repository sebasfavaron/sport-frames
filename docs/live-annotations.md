# Live/dynamic annotation research — T-049.1

## Decision

Use FFmpeg's existing `scene` score to suggest initial `data-at` anchors offline.

- Fits current zero-build/no-dependency page: FFmpeg is only an optional authoring CLI; runtime stays static HTML/CSS/JS.
- Produces paste-ready elements for the existing caption mechanism.
- Timing is assisted, copy remains human-reviewed. Scene change/motion does not reliably mean "goal", "player", or "key play".
- No upload, service account, browser CV, or annotation UI.

## Implemented workflow

```bash
tools/suggest-caption-anchors.sh my-play.mp4 0.12 2 > captions.html
```

- Argument 2: FFmpeg scene-score threshold. Start at `0.30` for cuts; lower it (for example `0.12`) for continuous sports footage with camera motion.
- Argument 3: minimum seconds between suggestions.
- Review the frames, replace `TODO` text, then paste the generated `<p>` elements inside `.scrolly__captions` in `index.html`.
- `data-at` is already normalized scroll progress, so no manual seconds-to-progress conversion is needed.

## Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| FFmpeg `select` + `scene` | Existing local tool; no runtime dependency; returns timestamped visual-change candidates | Selected |
| PySceneDetect | Better detector choices/CSV/UI, but adds Python install and duplicate value for this first slice | Defer |
| Browser live authoring controls | Could record current scrub position, but needs state/export UX and is a new authoring surface | Defer |
| Sports CV/telestrator SaaS | Can label plays/objects, but needs upload/API/vendor evaluation and still needs editorial review | Out of scope |

Sources: [FFmpeg select filter](https://ffmpeg.org/ffmpeg-filters.html#select_002c-aselect), [FFmpeg metadata filter](https://ffmpeg.org/ffmpeg-filters.html#metadata_002c-ametadata), [PySceneDetect](https://www.scenedetect.com/).

## T-049.2: live annotation preview

### Decision

Add an opt-in preview using native browser APIs, not an annotation product.

- Open `/?annotation-preview`. The fixed panel updates with current normalized scroll progress, video second, and active existing caption during each scroll scrub.
- **Copy current anchor** uses the [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText) to copy a paste-ready `<p data-at="…">` element at the live position.
- This is an authoring assist only: no caption editing, storage, accounts, upload, synchronization, or runtime dependency. Clipboard permission/failure is visibly reported.
- It reuses the current page's native URL query and Clipboard APIs. A library would add install/runtime surface without solving a missing problem.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| Native query + Clipboard API | Existing browser capabilities; zero dependency; live values match the scrubbed video | Selected |
| Full caption authoring UI | Requires editing, validation, persistence/export and interaction design | Out of scope |
| Live ASR/OCR service | Could suggest text, but adds model/vendor/upload evaluation and is independent from the immediate timing-preview gap | Defer |

## T-049.3: native WebVTT timed annotation playback

### Decision

Use the browser's existing `TextTrack` / [WebVTT](https://www.w3.org/TR/webvtt1/) support for
reviewed, time-based annotation playback on the checked-in default video.

- `assets/default.vtt` is a portable cue file; the hidden metadata track exposes its active cue
  while scroll scrubbing changes `video.currentTime`, and the page renders that cue above the video.
- It separates reviewed prose/timing from markup and is compatible with tools that already import
  or export WebVTT. Runtime remains native static HTML/CSS/JS.
- The checked-in track disables itself for an uploaded local video, preventing default-video copy
  from being shown against unrelated footage.
- No VTT editor, upload/persistence layer, generated transcript, account, API, or backend.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| Native `<track>` + WebVTT | Browser standard; portable timed-cue format; zero dependency | Selected |
| Embed cue text in JavaScript | Smaller first diff but not interoperable with existing caption/video tools | Reject |
| In-browser VTT editor/import/export UI | Needs validation, source selection, state and export interactions | Out of scope |
| ASR/transcription service | Could create draft copy but adds vendor/upload/model review concerns | Defer |

## T-049.4: WebVTT cue timing helper

### Decision

Add an opt-in two-click cue timing helper using the existing [WebVTT cue timing
syntax](https://www.w3.org/TR/webvtt1/#webvtt-cue-timings), not another annotation system.

- Open `/?vtt-cue`, scroll to a cue start, click **Mark cue start**, then scroll forward and click
  **Copy WebVTT cue**. It copies a paste-ready `HH:MM:SS.mmm --> HH:MM:SS.mmm` cue with a `TODO` body.
- Timing is held only in the current page and the generated text uses the native Clipboard API. There
  is no editor, file state, export flow, account, upload, service, or dependency.
- This is distinct from the normalized HTML caption-anchor copy: it speeds authoring of the portable
  time-based WebVTT layer already played by the page.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| Native two-click WebVTT cue timing | Produces standard cue syntax at the real scrub time; zero runtime dependency | Selected |
| WebVTT editor/import/export product | Requires cue list, validation, file state and export UX | Out of scope |
| Live ASR service | Suggests prose, but needs vendor/model/upload review and does not solve cue timing alone | Defer |
