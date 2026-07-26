# Tasks

Concrete repo-local work for sport-frames.

Fields:
- `id`: stable handle for future chats
- `status`: current execution state
- `goal`: concrete outcome
- `source`: where it came from
- `workspace`: repo path or task workspace
- `next_step`: immediate next action
- `notes`: short implementation context
- `tags`: labels for cross-task search

---

## Items

### T-049.9 - In-page WebVTT cue editor
- status: `done`
- goal: author, edit, retime, delete, preview, copy, and download a sorted WebVTT cue list against the live scrub position
- source: `T-049 explicit criterion override; Sebas 2026-07-24; redispatched 2026-07-26`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: `?vtt-editor` adds in-memory cue CRUD, live scrub timestamp capture, active authored-cue preview, sorted `WEBVTT` generation, Clipboard copy, and `.vtt` Blob download; no backend, account, upload, persistence, external library, or framework
  - verified 2026-07-26: `node --check`; `git diff --check`; headless Chromium exercised unsorted add/sorted output, edit+retime, delete, live active-cue rendering, scrub-time capture, Clipboard export payload, and download action; static HTTP returned `200 text/html` and `200 text/vtt`
- tags: [project:sport-frames, type:vtt-cue-editor, criterion:live-annotations]

### T-049.8 - FFmpeg black-video-to-WebVTT cue suggestions
- status: `done`
- goal: generate review-only WebVTT cue candidates for sustained black-video intervals using FFmpeg's existing `blackdetect` filter, without an authoring UI, storage layer, or backend
- source: `T-049 standing criterion; Sebas 2026-07-24`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: `tools/suggest-black-vtt.sh` converts FFmpeg `blackdetect` intervals into review-only portable WebVTT `TODO` cues; no runtime dependency, browser controls, parser/editor, persistence, upload, or backend
  - verified 2026-07-24: `bash -n`; real synthetic MP4 with a 1s black section emitted `00:00:01.000 --> 00:00:02.000`; FFmpeg remux + `ffprobe` read its subtitle packet; invalid threshold rejected; `node --check script.js`; `git diff --check`; real static server returned `200` for `/` and `docs/live-annotations.md`
- tags: [project:sport-frames, type:ffmpeg-black-video-webvtt-suggestions, criterion:live-annotations]

### T-049.7 - FFmpeg freeze-to-WebVTT cue suggestions
- status: `done`
- goal: generate review-only WebVTT cue candidates for frozen-video intervals using FFmpeg's existing `freezedetect` filter, without an authoring UI, storage layer, or backend
- source: `T-049 standing criterion; Sebas 2026-07-23`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: `tools/suggest-freeze-vtt.sh` converts FFmpeg `freezedetect` visual intervals into review-only portable WebVTT `TODO` cues; no runtime dependency, browser controls, parser/editor, persistence, upload, or backend
  - verified 2026-07-23: `bash -n`; real synthetic MP4 with 1s frozen image emitted `00:00:00.000 --> 00:00:01.000`; FFmpeg remux + `ffprobe` read its subtitle packet; invalid duration rejected; `node --check script.js`; `git diff --check`; real static server returned `200` for `/` and `docs/live-annotations.md`
- tags: [project:sport-frames, type:ffmpeg-freeze-webvtt-suggestions, criterion:live-annotations]

### T-049.6 - FFmpeg silence-to-WebVTT cue suggestions
- status: `done`
- goal: generate review-only WebVTT cue candidates for sustained quiet intervals using FFmpeg's existing `silencedetect` filter, without an authoring UI, storage layer, or backend
- source: `T-032 standing criterion; Sebas 2026-07-22`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: `tools/suggest-silence-vtt.sh` converts FFmpeg `silencedetect` audio intervals into review-only portable WebVTT `TODO` cues; no runtime dependency, browser controls, parser/editor, persistence, upload, or backend
  - verified 2026-07-22: `bash -n`; real synthetic MP4 with 2s silence emitted `00:00:01.002 --> 00:00:03.000`; FFmpeg remux + `ffprobe` read its subtitle packet; invalid duration rejected; `git diff --check`; real static server returned `200` for `/` and `docs/live-annotations.md`
- tags: [project:sport-frames, type:ffmpeg-silence-webvtt-suggestions, criterion:live-annotation-generation]

### T-049.5 - Local WebVTT annotation import
- status: `done`
- goal: load an existing local WebVTT annotation file against the current video without building an authoring UI, storage layer, or backend
- source: `T-032 standing criterion; Sebas 2026-07-21`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: native local `.vtt` file input creates a temporary object URL for the existing metadata TextTrack, so a VTT exported by another tool can annotate the default or uploaded local video without upload, storage, editor, backend, or dependency
  - verified 2026-07-21: `node --check script.js`; `git diff --check`; Python HTMLParser confirmed the `.vtt` file input; real static HTTP server returned `200 text/html` for `/` and `200 text/vtt` for `/assets/default.vtt`
- tags: [project:sport-frames, type:local-webvtt-import, criterion:live-annotation-generation]

### T-049.1 - Suggest scroll caption anchors from video scene changes
- status: `done`
- goal: add a zero-dependency workflow that converts FFmpeg scene-change candidates into `data-at` caption anchor suggestions
- source: `T-049; Sebas 2026-07-19 standing criterion: live annotations`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: `tools/suggest-caption-anchors.sh` wraps FFmpeg `select`/`scene` and emits paste-ready normalized `data-at` caption elements; research/decision in `docs/live-annotations.md`
  - verified 2026-07-19: `bash -n tools/suggest-caption-anchors.sh`; `./tools/suggest-caption-anchors.sh assets/default.mp4 0.09 2` emitted a valid opening anchor plus `data-at="0.210"` from the 3.080s scene-score candidate; static server returned HTTP 200 for `/` and `/docs/live-annotations.md`
- tags: [project:sport-frames, type:scene-anchor-suggestions, criterion:live-annotations]

### T-049.2 - Live annotation preview and one-click anchor copy
- status: `done`
- goal: add an opt-in, real-time browser preview that shows current scrub progress/time and copies a paste-ready caption anchor without creating an authoring UI
- source: `T-049; Sebas 2026-07-19 standing criterion: live annotations`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: `?annotation-preview` adds a native URL/Clipboard API panel with live normalized progress, target video second, active caption, and one-click paste-ready `data-at`; no state, edit controls, services, or dependency
  - verified 2026-07-20: `node --check script.js`; `git diff --check`; `bash -n tools/suggest-caption-anchors.sh`; real FFmpeg run `./tools/suggest-caption-anchors.sh assets/default.mp4 0.09 2` emitted opening plus `data-at="0.210"`; headless Chromium opened `/?annotation-preview` against `assets/default.mp4`, updated to `0.086 / 1.258s`, and copied valid `data-at="0.086"`; HTTP 200
- tags: [project:sport-frames, type:live-anchor-preview, criterion:live-annotations]

### T-049.3 - Native WebVTT timed annotation playback
- status: `done`
- goal: add a narrow, portable timed-annotation layer using an existing browser/video standard, without an authoring UI, storage layer, or backend service
- source: `T-049; Sebas 2026-07-19 standing criterion: live annotations`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: checked-in `assets/default.vtt` loads through native HTML `TextTrack` metadata; active WebVTT cues render during scroll scrubbing; annotations disable for an unrelated uploaded local video
  - verified 2026-07-20: `node --check script.js`; `git diff --check`; real `assets/default.mp4` plus `assets/default.vtt` remuxed with FFmpeg and `ffprobe` read all three cue packets at `0.000/4.500`, `4.500/5.000`, and `9.500/5.167` seconds; static server returned HTTP 200 with `text/vtt`
- tags: [project:sport-frames, type:webvtt-timed-playback, criterion:live-annotations]

### T-049.4 - Copy a timed WebVTT cue from live scrub positions
- status: `done`
- goal: add a narrow, standards-based live timing assist that creates a paste-ready WebVTT cue without building an authoring product
- source: `T-049; Sebas 2026-07-21 standing criterion: live annotations`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: `?vtt-cue` adds an opt-in two-click native Clipboard workflow: mark the live scrubbed cue start, move forward, then copy a `HH:MM:SS.mmm --> HH:MM:SS.mmm` WebVTT cue with TODO body; timing is temporary and in-memory only
  - verified 2026-07-21: `node --check script.js`; `git diff --check`; Python `HTMLParser` parsed `index.html`; HTTP 200 from a real static server for `/?vtt-cue`; source/output reviewed to ensure forward-only timing and valid zero-padded WebVTT timestamps
- tags: [project:sport-frames, type:webvtt-cue-timing-helper, criterion:live-annotations]
