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
