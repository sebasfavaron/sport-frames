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

## T-049.55: Tesseract OCR-to-WebVTT cue suggestions

### Decision

Add a sixth suggester that reads on-screen text (scoreboard/caption graphics) instead of a
timing-only signal, closing the "every suggester today emits generic `TODO:` text, none produce
cue *content*" gap. Speech-to-text was the first-choice option (transcribing commentary/crowd
audio into cue text is a more direct annotation source than OCR), but it was not feasible within
this slice's budget on this machine — see "Speech-to-text: why not this slice" below. OCR was
feasible because [Tesseract](https://tesseract-ocr.github.io/) was already installed system-wide
(`tesseract-ocr` 5.5.0 via apt, with `eng`/`spa` language data), so this slice needed zero install
effort, unlike every speech option considered.

```bash
tools/suggest-ocr-vtt.sh my-play.mp4 0.10 0.5 eng > on-screen-text.vtt
```

- Reuses the exact scene-cut candidate detector from `suggest-scenecut-vtt.sh`/T-049.53
  (arguments 2 and 3 have the same meaning: scene-score threshold, and cue duration/minimum gap
  between candidates). Argument 4 is the Tesseract language code (default `eng`; `spa` and
  `eng+spa` are also installed).
- At each surviving candidate, it extracts the exact frame with FFmpeg and runs Tesseract OCR on
  it (`--psm 6`, "assume a uniform block of text", which fits a scoreboard/caption graphic better
  than full-page layout analysis). A frame with no recognized text produces no cue.
- Unlike every other suggester in this file, the cue body **is** the recognized text, prefixed
  `OCR:` so a reviewer can tell content was machine-read, not authored — for example `OCR: HOME 2
  AWAY 1`. It is still not a claim that a play happened: OCR can misread characters, catch a
  sponsor/broadcast graphic instead of a scoreboard, or catch nothing if the cut boundary lands
  before the graphic finishes rendering in. Review/edit/delete each suggestion in the in-page
  editor or an external VTT-capable tool before use, the same as every prior suggester.
- `tools/suggest-all-vtt.sh` now runs it as a sixth suggester (tag `ocr`), lowest dedup priority
  (an OCR cue that lands within 0.1s of another suggester's cue is folded into that cue as
  `[also flagged by: ocr]` rather than kept standalone, since a scoreboard appearing is very often
  also a scene cut). If Tesseract is not installed, `suggest-all-vtt.sh` skips it with a stderr
  warning instead of failing the run, matching the existing missing-audio/video-stream skip
  behavior for the other suggesters.
- No model weights, browser CV, new runtime dependency, backend, account, or upload: Tesseract is
  an existing, already-installed local CLI; the wrapper only orchestrates it and FFmpeg's existing
  frame-extraction capability.

### Speech-to-text: why not this slice

Checked first, per this slice's preference order, since transcribing commentary/crowd audio is a
more direct source of annotation-worthy text than reading on-screen graphics. Not feasible within
~20 minutes of setup effort on this machine, `ballbox-first` (Raspberry Pi 5, aarch64, 8 GB RAM,
no GPU):

- None of `whisper.cpp`, `faster-whisper`, or `vosk` were already installed (checked `command -v`
  for `whisper`/`whisper-cli`/`main`, and `pip3 list` for `faster-whisper`/`vosk`: all missing).
  Every option in this list therefore needed a fresh install, unlike Tesseract.
- At install time, the machine measured **167 MiB of 7.9 GiB RAM free, with 2.0 GiB of 2.0 GiB
  swap already in use** (`free -h`; a `wifi-presence-log` process and a headless Chromium
  WhatsApp-Web session were the top consumers). This machine runs other people's protected
  infrastructure (see `~/NORTH-STAR.md`'s blast-radius inventory) concurrently with this repo's
  work; building or first-running a new speech model here risks OOM-killing something else on the
  box, not just this task, which the machine-budget guidance for this box explicitly warns
  against.
- `faster-whisper` pulls in `ctranslate2` (a compiled inference runtime) plus `onnxruntime` and
  `tokenizers`; `vosk` pulls a prebuilt shared library. Neither is a pure-Python quick `pip
  --user` install on aarch64 the way a pure-Python package would be, and evaluating actual wheel
  availability/build time for this specific board was itself more than a few minutes of the
  budget. `whisper.cpp` avoids the Python dependency chain entirely (it is a small, quick-to-build
  C++ project with a tiny/base `ggml` model under 80 MB), but compiling anything and then loading
  a model into working memory on a box already at ~98% RAM+swap utilization is exactly the
  condition to avoid, not just the slowest option.
- Recommendation for a future slice: retry `whisper.cpp` (tiny/base `ggml` model, quantized
  `q5_0` if needed to stay well under 80 MB) specifically, once `free -h` shows the box has
  headroom again — it is the lightest-weight option of the three and needs no Python packaging.
  Build and run it once as a standalone check before wiring a `tools/suggest-speech-vtt.sh`
  wrapper, so a bad memory measurement fails fast instead of inside the wrapper's test harness.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| Tesseract OCR on FFmpeg scene-cut keyframes | Already installed, zero incremental install/runtime-memory cost on a memory-constrained shared box; produces real cue text (scoreboard/caption graphics) | Selected |
| `whisper.cpp` / `faster-whisper` / `vosk` speech-to-text | Would be a more direct annotation source (commentary/crowd audio), but none were installed and the machine had ~2% RAM+swap headroom at check time — see above | Defer to a future slice, once the box has memory headroom |
| Full-page Tesseract layout analysis (default `--psm`) | Assumes a page of prose; a scoreboard/caption graphic is a small uniform text block, so `--psm 6` reads it more reliably | Reject in favor of `--psm 6` |
| OCR every frame (not just scene-cut candidates) | Would catch text that appears without a visual cut, but multiplies FFmpeg+Tesseract calls per second of footage for a first slice with no evidence that gap matters yet | Defer |

## T-049.54: merge all FFmpeg suggesters into one deduplicated WebVTT

### Decision

Add one wrapper that orchestrates the five existing suggesters (T-049.1/.6/.7/.8/.53) instead of
building a new detection signal.

```bash
tools/suggest-all-vtt.sh my-play.mp4 > all-suggestions.vtt
```

- Runs `suggest-scenecut-vtt.sh`, `suggest-black-vtt.sh`, `suggest-freeze-vtt.sh`,
  `suggest-silence-vtt.sh`, and `suggest-loudpeak-vtt.sh` with their own default thresholds, then
  merges every cue into one time-sorted WebVTT.
- Two cues whose start and end each land within 0.1s (the same tolerance T-049.20's near-duplicate
  editor warning already uses) are collapsed into one, keeping the higher-priority suggester's
  identifier/body and appending `[also flagged by: NAME]` for the dropped one, so the source
  signal stays visible without duplicate near-identical review items — for example, a hard cut to
  a black frame is both a `scenecut` and a `black` candidate at almost the same instant.
- A suggester whose required stream is missing (silence/loud-peak on a video with no audio track)
  is skipped with a stderr warning; any other failure aborts the whole run with that suggester's
  exit status.
- No new detection signal, threshold, model, browser CV, dependency, backend, account, or upload:
  it only orchestrates tools that already exist and merges their already-TODO-tagged output.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| Wrapper that runs the five existing suggesters and merges/dedupes their WebVTT output | Closes the practical "run five tools, merge `.vtt` files by hand" gap with zero new detection logic | Selected |
| Shared confidence/threshold preset file for the suggesters | Real ergonomics gap, but each suggester's threshold is already a single documented CLI argument with a sensible default; a preset file adds a new file format/parsing step for a problem that's mostly already solved | Defer |
| A genuinely new signal (for example FFmpeg `crop`/motion-vector-based camera-pan detection) | Would add coverage, but the immediate gap named in this slice's dispatch was integration across existing signals, not another one | Defer |
| One-click "run all suggesters" button inside the in-page editor | Needs the editor (a browser page) to shell out to FFmpeg, which breaks the project's static-page-with-no-backend model; the CLI wrapper still loads into the editor via the existing Import .vtt (T-049.10) | Reject |

## T-049.53: FFmpeg scene-cut-to-WebVTT cue suggestions

### Decision

Give the scene-change detector from T-049.1 a WebVTT-emitting sibling, matching the
black/freeze/silence/loud-peak suggesters instead of the older HTML caption-anchor output.

```bash
tools/suggest-scenecut-vtt.sh my-play.mp4 0.30 0.5 > scene-cuts.vtt
```

- Argument 2 is the FFmpeg scene-score threshold (`0`–`1`), same semantics as
  `suggest-caption-anchors.sh`; argument 3 is both the emitted cue duration and the minimum gap
  used to de-duplicate nearby cuts.
- Cues say `TODO: review scene cut (score …)`: a scene cut is a visual-change candidate, not a
  claim that a play happened there. Review/delete/replace them in the in-page editor or an
  external VTT-capable tool before use.
- The helper reuses the exact `select='gt(scene,X)'` + `metadata=print` pipeline T-049.1 already
  validated; only the output format changes (WebVTT to stdout instead of paste-ready HTML), so it
  loads through the existing local WebVTT import (T-049.5) or the editor's Import .vtt (T-049.10)
  like every other signal-based suggester. No model, browser CV, new dependency, backend, account,
  or upload.

### Options considered

| Approach | Fit | Decision |
| --- | --- | --- |
| Reuse T-049.1's scene detector, emit WebVTT | Closes the format gap: every other signal (T-049.6/.7/.8/.19) already emits editor-loadable WebVTT; scene cuts only ever produced HTML anchors | Selected |
| Audio-energy onset/transient detector | A genuinely new signal, but T-049.19's `astats` RMS-window loud-peak suggester already covers the practical audio-energy case for this codebase | Defer |
| One-click "load suggestion .vtt as draft cues for review" in the editor | Already substantially covered: T-049.10 imports any `.vtt` (including suggestion output) straight into `editorCues`, and T-049.44 layers suggestion timestamps in as snap-to markers | Reject as duplicate |
| Sports CV/highlight-detection service | Could label plays directly, but needs vendor/model/upload evaluation and still needs editorial review | Out of scope |

## T-049.16: warn about cues beyond video duration

### Decision

When the loaded video exposes a finite duration, mark every editor cue whose start or end exceeds it.

- Each affected list item shows **Extends past video end**; the toolbar reports the affected count.
- Detection runs through the normal render path after authoring, editing, import, restore, and video duration changes.
- The warning is advisory only. Saving, applying, and downloading remain allowed because WebVTT permits such timings.
- Unknown/`NaN` video duration produces no warning. No backend, account, upload, dependency, framework, or new persistence.

## T-049.38: per-cue text alignment via the standard WebVTT `align:` cue setting

### Decision

Expose the previously hardcoded `align:center` cue setting as a per-cue **Text alignment**
select (`start` / `center` / `end`).

- Export emits the standard WebVTT `align:` cue setting; import parses `align:(start|center|end|left|right)`,
  normalising the deprecated `left` / `right` to `start` / `end`.
- `center` is the default: a cue with no explicit alignment stores no `align` key, persists no
  `align` key, and exports byte-identically to before this slice.
- The alignment carries through Duplicate and Merge with next (first cue's alignment) like the
  speaker label, and the live in-page preview applies it as CSS `text-align`.
- No new line/position anchor controls, no region support, no backend, account, upload,
  dependency, framework, or new persistence mechanism.

## T-049.40: copy the complete WebVTT file

### Decision

Add a **Copy .vtt** action beside Apply and Download in the existing editor export toolbar.

- It writes the complete, start-time-sorted `WEBVTT` payload from the shared `buildVtt()` path to the native Clipboard API.
- Copy failure is visible and does not alter cues. Apply and Download remain unchanged.
- No per-cue copy, alternate export format, backend, account, upload, dependency, framework, or persistence change.

## T-049.39: optional per-cue identifier line

### Decision

Expose the standard [WebVTT cue identifier](https://www.w3.org/TR/webvtt1/#webvtt-cue-identifier)
— the optional line before the timing line — as a per-cue **Cue identifier** text field.

- Export writes the identifier as a plain line immediately before `HH:MM:SS.mmm -->`; import
  captures a non-empty, non-`-->`, non-`WEBVTT`/`NOTE` line whose next line contains `-->` and
  strips it from the cue block. Each cue keeps only its own identifier.
- A cue with no identifier stores no `name` key, persists no `name` key, and exports
  byte-identically to before this slice.
- The shared `cueName` helper sanitises the value on every path: `-->` removed, newlines
  collapsed to a space, trimmed, non-string coerced to `""`.
- The identifier carries through Duplicate and Merge with next (first cue's identifier) like the
  speaker label and alignment. It is player/shot-list metadata, so the in-page overlay is
  unchanged.
- No identifier autocomplete or uniqueness enforcement, no `::cue(name)` styling UI, no region
  support, no backend, account, upload, dependency, framework, or new persistence mechanism.

## T-049.24: warn about blank lines inside WebVTT cue bodies

### Decision

Mark editor cues whose text contains an empty or whitespace-only line between text lines.

- WebVTT uses a blank line to terminate a cue block. Exporting paragraph-separated text therefore splits the authored body instead of preserving it as one cue.
- Adjacent non-empty multiline text remains valid and is not flagged. LF and CRLF input, including whitespace-only separator lines, are covered.
- Each affected list item shows **Blank line splits WebVTT cue**; the toolbar reports the affected cue count.
- Advisory only: editing, applying, and downloading remain available so the reviewer controls the correction. No text mutation, backend, dependency, framework, upload, account, or persistence change.

## T-049.44: snap cue retiming to imported suggestion boundaries

### Decision

Let the editor load a suggestion-tool `.vtt` as temporary reference markers, without adding its
TODO cues to the authored cue list.

- Every unique cue start and end becomes a reference marker. The editor reports the marker count.
- When enabled, timeline dragging and Alt+Left/Right timing nudges snap the moved cue's nearest
  start or end to a marker within 0.250s while preserving cue duration and metadata.
- The marker track stays in page memory only. It is not exported or saved to localStorage, and users
  can disable snapping. This connects the existing FFmpeg suggestion files to manual review without
  auto-applying suggestions, a backend, upload, account, library, or framework.

## T-049.42: drag a cue to retime it on the video timeline

### Decision

Add one native range control per cue to move its timing across the loaded video's duration.

- Dragging changes start and end together, so cue duration and all text/spatial metadata stay unchanged.
- When the cue fits within a known video duration, movement is clamped so it cannot start before zero or end after the video. The existing sorted render path handles crossings with other cues.
- The control changes no cue shape or WebVTT syntax. If it is not used, export is byte-identical; after use, only existing start/end values change.
- No custom drag library, separate timeline view, backend, account, upload, dependency, framework, or new persistence mechanism.

## T-049.41: flag uncovered gaps between consecutive cues

### Decision

Mark the cue whose end leaves an uncovered stretch longer than `CUE_GAP_THRESHOLD_SECONDS`
(1s) before the next annotation begins.

- Gap detection sweeps cues in start order and measures each cue's start against the running
  coverage frontier (the maximum end seen so far), so a cue fully contained inside a longer cue
  never opens a phantom gap and overlaps (negative delta) are never gaps.
- A gap of exactly 1s is within tolerance; only a strictly longer gap is flagged. The cue that
  precedes the gap shows **Gap before next cue**; the toolbar reports the gap count.
- Display only, no auto-fix: this is the counterpart to the T-049.15 overlap warning. It adds no
  cue key, changes no export byte, and does not round-trip anything — `buildVtt`, `parseVttCues`,
  and `saveEditorCues` are untouched.
- No minimum-coverage enforcement, blocked export, backend, dependency, framework, upload,
  account, or persistence change.
