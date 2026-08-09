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

## T-049.5: local WebVTT annotation import

### Decision

Add a native local `.vtt` file chooser to attach existing timed annotations to the current video.

- The browser turns the selected file into a temporary object URL and assigns it to the existing
  metadata `<track>`; native `TextTrack` playback/rendering remains the sole annotation path.
- It works for the checked-in default video and an uploaded local video, closing the practical
  interop gap where the default VTT is deliberately disabled for unrelated footage.
- No VTT parsing/editor, validation flow, persistence, upload, backend, account, or dependency.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| Native file input + object URL + `<track>` | Reuses browser/WebVTT primitives; supports files exported by caption tools; zero dependency | Selected |
| Build a VTT editor/import review screen | Requires cue list, validation, editing and export UX | Out of scope |
| Upload VTT/video to a service | Adds storage, privacy and backend concerns with no need for this preview slice | Reject |

## T-049.6: FFmpeg silence-to-WebVTT cue suggestions

### Decision

Use FFmpeg's existing [`silencedetect`](https://ffmpeg.org/ffmpeg-filters.html#silencedetect)
filter to draft portable WebVTT cues for sustained quiet intervals.

```bash
tools/suggest-silence-vtt.sh my-play.mp4 -35 0.5 > quiet-intervals.vtt
```

- Argument 2 is the silence threshold in dB; argument 3 is the minimum quiet interval in seconds.
  Tune both to the recording, then load the generated VTT through the existing local WebVTT input.
- Cues say `TODO: review quiet interval`: silence is only an audio-event candidate, not a claim that a
  play, replay, or commentary annotation belongs there. Review/delete/replace them in an external
  VTT-capable tool before use.
- The helper requires an audio stream and emits standard WebVTT to stdout. It adds no runtime
  dependency, browser controls, VTT parser/editor, persistence, upload, account, or backend.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| FFmpeg `silencedetect` → WebVTT | Existing local tool; produces portable audio-event timing candidates | Selected |
| Audio transcription/ASR service | Could draft prose, but adds model/vendor/upload and review concerns | Defer |
| Browser audio analysis UI | Needs audio decode, tuning controls and authoring state | Reject |
| Full annotation editor | Requires cue management, validation, persistence and export UX | Out of scope |

## T-049.7: FFmpeg freeze-to-WebVTT cue suggestions

### Decision

Use FFmpeg's existing [`freezedetect`](https://ffmpeg.org/ffmpeg-filters.html#freezedetect)
filter to draft portable WebVTT cues for frozen-video intervals.

```bash
tools/suggest-freeze-vtt.sh my-play.mp4 -60 0.5 > frozen-intervals.vtt
```

- Argument 2 is the image-difference noise tolerance in dB; argument 3 is the minimum frozen
  duration in seconds. Tune both to the source, then load the generated VTT through the existing
  local WebVTT input.
- Cues say `TODO: review frozen-video interval`: a freeze may be a transition, pause, replay
  artifact, or damaged source; it is not a claim that a sports annotation belongs there.
  Review/delete/replace them in an external VTT-capable tool before use.
- The helper requires a video stream and emits standard WebVTT to stdout. It adds no runtime
  dependency, browser controls, VTT parser/editor, persistence, upload, account, or backend.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| FFmpeg `freezedetect` → WebVTT | Existing local tool; produces portable visual-stall timing candidates | Selected |
| FFmpeg scene detection | Finds visual changes, already covered in T-049.1; does not identify sustained static frames | Excluded as duplicate |
| Frame-analysis browser UI | Needs decode, tuning controls and authoring state | Reject |
| Sports CV/ASR service | Adds vendor/model/upload review and does not specifically solve frozen-frame timing | Defer |

## T-049.8: FFmpeg black-video-to-WebVTT cue suggestions

### Decision

Use FFmpeg's existing [`blackdetect`](https://ffmpeg.org/ffmpeg-filters.html#blackdetect)
filter to draft portable WebVTT cues for sustained black-video intervals.

```bash
tools/suggest-black-vtt.sh my-play.mp4 0.10 0.5 > black-intervals.vtt
```

- Argument 2 is the pixel blackness threshold from `0` to `1`; argument 3 is the minimum
  black interval in seconds. The helper uses FFmpeg's default requirement that 98% of pixels
  pass that threshold. Tune both to the source, then load the generated VTT through the
  existing local WebVTT input.
- Cues say `TODO: review black-video interval`: black frames can be an edit, fade, source
  issue, or broadcast boundary, not a sports event. Review/delete/replace them in an external
  VTT-capable tool before use.
- The helper requires a video stream and emits standard WebVTT to stdout. It adds no runtime
  dependency, browser controls, VTT parser/editor, persistence, upload, account, or backend.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| FFmpeg `blackdetect` → WebVTT | Existing local tool; produces portable edit/boundary timing candidates | Selected |
| FFmpeg `freezedetect` | Finds static frames, already covered in T-049.7; does not identify black intervals | Excluded as duplicate |
| Browser frame-analysis UI | Needs decode, tuning controls and authoring state | Reject |
| Sports CV/ASR service | Adds vendor/model/upload and does not specifically solve black-frame timing | Defer |

## T-049.19: FFmpeg loud-peak-to-WebVTT cue suggestions

### Decision

Use FFmpeg's existing [`astats`](https://ffmpeg.org/ffmpeg-filters.html#astats) filter to draft
portable WebVTT cues for sustained loud audio intervals.

```bash
tools/suggest-loudpeak-vtt.sh my-play.mp4 -18 0.5 > loud-intervals.vtt
```

- Argument 2 is the RMS threshold in dBFS (no greater than `0`); argument 3 is the minimum loud
  interval in seconds. Audio is measured in 100ms windows. Tune both to the recording, then load
  the generated VTT through the existing local WebVTT import.
- Cues say `TODO: review loud/crowd-reaction interval`: a loud peak may be crowd reaction,
  commentary, music, clipping, or noise, not proof of a sports highlight. Review/delete/replace
  each suggestion in the existing local editor before use.
- The helper requires an audio stream and emits standard WebVTT to stdout. It adds no runtime
  dependency, browser/editor change, persistence, upload, account, or backend.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| FFmpeg `astats` → WebVTT | Existing local tool; fixed-window RMS metadata gives directly parseable loud intervals | Selected |
| FFmpeg `ebur128` | Better program-loudness metering, but its 400ms momentary window smears short interval boundaries | Reject for candidate timing |
| Browser audio analysis or sports-event service | Adds runtime state or upload/vendor complexity; loudness still needs human review | Reject |

## T-049.9: in-page WebVTT cue editor

### Decision

Sebas's 2026-07-24 explicit override puts full local cue authoring in scope. Build it from native
browser primitives because the existing `?vtt-cue` timing helper proved the workflow and no library
or service is needed.

- Open `/?vtt-editor`; the fixed panel shows the live scrub timestamp.
- Capture start/end from the current scrub position, enter cue text, then add it to the in-memory list.
- Edit supports text changes and retiming (including capturing a new scrub position); cues can also
  be deleted. Authored active cues render over the video immediately.
- Export sorts cues by start/end and generates standard `WEBVTT`. Clipboard copy and an
  `annotations.vtt` browser download use native APIs.
- State is intentionally page-memory only. No backend, account, upload, framework, external library,
  or parser/import coupling.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| Native in-page state + Clipboard/Blob download | Covers complete local authoring/export with zero dependency | Selected |
| External VTT editor | Mature, but breaks the requested against-live-scrub in-page workflow | Reject for this slice |
| Persistent browser storage | Could survive reloads, but adds migration/stale-video identity concerns without a requirement | Defer |

## T-049.10: import WebVTT cues into the in-page editor

### Decision

Close the interop gap between the FFmpeg suggestion tools (T-049.6/.7/.8), the local WebVTT
import (T-049.5), and the T-049.9 in-page editor: those cues could only be played back
passively, never edited/retimed/deleted/re-exported.

- The `?vtt-editor` panel gained an "Import .vtt" file input. A small native WebVTT cue-block
  parser (`parseVttCues`/`parseVttTimestamp` in `script.js`) reads standard `HH:MM:SS.mmm`/
  `MM:SS.mmm` timing lines, ignoring the `WEBVTT` header, `NOTE` blocks, cue identifiers, and
  trailing cue settings, and appends the parsed cues into the existing in-memory `editorCues`
  list.
- Imported cues are immediately editable/retimeable/deletable/exportable through the same
  controls as manually authored cues; no separate import-review UI.
- No parser library, backend, persistence, or account. WebVTT stays the interchange format
  already used across every earlier T-049.x slice.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| Small native WebVTT cue-block parser + append to `editorCues` | Reuses the standard cue-timing syntax already used by every prior slice; zero dependency | Selected |
| External WebVTT parser library | More complete (styling/regions), but this project's cue subset doesn't need it | Reject |
| Auto-import default/loaded track into the editor on open | Removes a click, but silently mixes playback and authoring state without an explicit action | Reject |

## T-049.16: warn about cues beyond video duration

### Decision

When the loaded video exposes a finite duration, mark every editor cue whose start or end exceeds it.

- Each affected list item shows **Extends past video end**; the toolbar reports the affected count.
- Detection runs through the normal render path after authoring, editing, import, restore, and video duration changes.
- The warning is advisory only. Saving, applying, and downloading remain allowed because WebVTT permits such timings.
- Unknown/`NaN` video duration produces no warning. No backend, account, upload, dependency, framework, or new persistence.

## T-049.24: warn about blank lines inside WebVTT cue bodies

### Decision

Mark editor cues whose text contains an empty or whitespace-only line between text lines.

- WebVTT uses a blank line to terminate a cue block. Exporting paragraph-separated text therefore splits the authored body instead of preserving it as one cue.
- Adjacent non-empty multiline text remains valid and is not flagged. LF and CRLF input, including whitespace-only separator lines, are covered.
- Each affected list item shows **Blank line splits WebVTT cue**; the toolbar reports the affected cue count.
- Advisory only: editing, applying, and downloading remain available so the reviewer controls the correction. No text mutation, backend, dependency, framework, upload, account, or persistence change.
