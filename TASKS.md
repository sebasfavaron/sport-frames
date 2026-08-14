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

### T-049.29 - Align a WebVTT cue end to the next cue start
- status: `done`
- goal: let reviewers remove a timing gap or overlap between consecutive annotations with one exact boundary-alignment action instead of manually copying the next cue's timestamp
- source: `T-049; Sebas 2026-07-19 standing criterion: live annotations`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: every cue except the last chronological cue now offers **End at next cue**. The action sets that cue's end to the exact start of the next cue in sorted playback order, closing a gap or trimming an overlap while preserving text, start, spatial values, ids, and source array order. Same-start boundaries that would produce an invalid zero-duration cue are rejected without mutation. A successful alignment refreshes the sorted list and live preview and persists through existing localStorage. No automatic batch repair, text merge, backend, dependency, framework, upload, account, or new persistence mechanism
  - verified 2026-08-14: `node --check script.js`; every `tools/verify-*.js` harness including new `tools/verify-cue-end-snap.js`; `bash -n tools/*.sh`; `git diff --check`. The new harness extracts the shipped alignment helper verbatim and proves overlap trimming, gap closing, chronological-next selection from unsorted input, complete cue-data/source-order preservation, source immutability, and rejection for the last cue, same-start next cue, and unknown id; it also asserts conditional action/list/preview/localStorage wiring. A real static HTTP server returned `200` for `/?vtt-editor`, `/script.js`, and `/style.css`; the fetched `/script.js` passed `node --check` and contained the alignment helper and action
- tags: [project:sport-frames, type:vtt-editor-cue-end-alignment, criterion:live-annotations]

### T-049.28 - Split a WebVTT cue at the live scrub time
- status: `done`
- goal: let reviewers divide one long annotation at the current video position without manually copying its text and spatial placement or re-entering both timing ranges
- source: `T-049; Sebas 2026-07-19 standing criterion: live annotations`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: every cue gained a native **Split at scrub time** action. When the live scrub position is strictly inside that cue, the action replaces it with two contiguous cues covering the exact original range; both preserve text and spatial values, the first preserves the original id, and the second receives a fresh id. Boundary/outside/not-ready positions are rejected without mutation. A successful split refreshes the sorted list and live preview and persists through existing localStorage. No text splitting, automatic timing choice, backend, dependency, framework, upload, account, or new persistence mechanism
  - verified 2026-08-13: `node --check script.js`; every `tools/verify-*.js` harness including new `tools/verify-cue-split.js`; `bash -n tools/*.sh`; `git diff --check`. The new harness extracts the shipped split helper verbatim and proves exact contiguous coverage, text/spatial preservation, original/fresh id handling, source immutability, and rejection at both boundaries, outside the cue, and for non-finite time; it also asserts live-scrub/action/list/preview/localStorage wiring. A real static HTTP server returned `200` for `/?vtt-editor`, `/script.js`, and `/style.css`; the fetched `/script.js` passed `node --check` and contained the split helper and action
- tags: [project:sport-frames, type:vtt-editor-cue-split, criterion:live-annotations]

### T-049.27 - Offset all WebVTT cue timings
- status: `done`
- goal: let reviewers synchronize an authored or imported annotation track by shifting every cue start and end by the same signed number of seconds instead of retiming cues individually
- source: `T-049 standing criterion; Sebas 2026-08-12`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: the editor toolbar gained a native **Offset all cues (seconds)** input and **Shift timings** action. A finite positive or negative offset shifts every cue boundary equally while preserving duration, text, position, size, and ids; a shift that would move any cue before `0.000s` is rejected without mutation. A successful shift immediately refreshes the sorted list and live annotation preview and persists through the existing localStorage path. No automatic synchronization detection, media analysis, per-cue editing change, backend, dependency, framework, upload, account, or new persistence mechanism
  - verified 2026-08-12: `node --check script.js`; every `tools/verify-*.js` harness including new `tools/verify-cue-timing-offset.js`; `bash -n tools/*.sh`; `git diff --check`. The new harness extracts the shipped offset helper verbatim and proves positive and negative shifts, exact-zero acceptance, before-zero and non-finite rejection, complete cue-data preservation, source immutability, and toolbar/preview/list/localStorage wiring. A real static HTTP server returned `200` for `/?vtt-editor`, `/script.js`, and `/style.css`; the fetched `/script.js` passed `node --check` and contained the offset helper and action
- tags: [project:sport-frames, type:vtt-editor-bulk-timing-offset, criterion:live-annotation-generation]

### T-049.26 - Escape reserved WebVTT cue payload characters
- status: `done`
- goal: preserve literal reviewer-authored `&`, `<`, and `>` characters through WebVTT export, native track parsing, and re-import instead of letting the WebVTT cue parser treat plain annotation text as entities or markup
- source: `T-032 daily orchestrator; 2026-08-11`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: WebVTT export now escapes reserved cue payload characters in reviewer text (`&` first, then `<` and `>`), while import decodes the corresponding `&amp;`, `&lt;`, and `&gt;` entities in round-trip-safe order. Editor summaries and live previews remain raw literal text rendered through existing `textContent` paths. No timing, spatial positioning, warning, backend, dependency, framework, upload, account, or persistence change
  - verified 2026-08-11: `node --check script.js`; every `tools/verify-*.js` harness including new `tools/verify-vtt-cue-text-entities.js`; `bash -n tools/*.sh`; `git diff --check`. The new harness extracts the shipped escape/unescape helpers verbatim and proves exact export plus lossless re-import for ampersand, less-than, greater-than, mixed/reserved-entity-looking, and no-reserved-character cases; it also asserts `buildVtt`/`parseVttCues` wiring and raw-text `textContent` rendering. A real static HTTP server returned `200` for `/?vtt-editor`, `/script.js`, and `/style.css`; the fetched `/script.js` passed `node --check` and contained both export escaping and import decoding
- tags: [project:sport-frames, type:vtt-cue-text-entity-escaping, criterion:live-annotations]

### T-049.25 - Duplicate a WebVTT cue in the editor
- status: `done`
- goal: let reviewers clone an existing editor cue back-to-back after itself, so authoring a run of similar/consecutive annotations (e.g. near-identical scoreboard or repeated-event captions) doesn't require retyping text and spatial position and re-entering timing from scratch for each one
- source: `T-049 standing criterion; Sebas 2026-08-10`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: every editor cue list item gained a native **Duplicate** action alongside the existing Go to start/Edit/Delete actions. It appends a new cue whose start equals the original's end (so the clone sits immediately after it, preserving the original's duration) and copies its text and spatial (x/y/size) values verbatim under a fresh id; the new cue re-renders, refreshes the live preview, and persists to localStorage through the existing save path, then is retimed/edited/repositioned/deleted like any other cue. No auto-merge, backend, dependency, framework, upload, account, or new persistence mechanism
  - verified 2026-08-10: `node --check script.js`; every `tools/verify-*.js` harness including new `tools/verify-cue-duplicate.js`; `bash -n tools/*.sh`; `git diff --check`; `tools/verify-cue-duplicate.js` extracts the shipped `duplicateCue` verbatim and proves back-to-back start placement, duration/text/spatial preservation, id substitution, and the zero-duration edge case, then asserts the list-item Duplicate control and click-handler wiring (clone, push, re-render, live-preview refresh, persistence, status line) are all present in the shipped script. A real static HTTP server served `/?vtt-editor`, `/script.js`, and `/style.css` with `200`; the fetched `/script.js` passed `node --check` and contained `duplicateCue` and the Duplicate button. `ffprobe` read the real `assets/default.mp4` duration as `14.666667s`
- tags: [project:sport-frames, type:vtt-editor-cue-duplicate, criterion:live-annotations]

### T-049.24 - Warn about blank lines inside WebVTT cue bodies
- status: `done`
- goal: flag cue text whose paragraph-style blank lines will terminate the WebVTT cue block, so reviewers can fix an export that cannot preserve the authored body as one cue
- source: `T-049 standing criterion; Sebas 2026-08-09`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: the editor detects LF or CRLF blank/whitespace-only lines inside cue text, marks affected cues with an amber **Blank line splits WebVTT cue** label, and reports the affected count in the toolbar. This follows WebVTT's blank-line cue-block terminator while allowing valid adjacent non-empty multiline cue text. Detection is advisory only; no text mutation, blocked export, backend, dependency, framework, upload, account, or persistence change
  - verified 2026-08-09: `node --check script.js`; every `tools/verify-*.js` harness; `bash -n tools/*.sh`; `git diff --check`; `tools/verify-blank-line-warning.js` extracts the shipped detector and proves safe single-line and adjacent multiline bodies, LF/CRLF and whitespace-only blank-line detection, missing-text separation, mixed-cue selection, and per-cue/accessible-toolbar wiring. A real static HTTP server served `/?vtt-editor`, `/script.js`, and `/style.css`; the fetched script passed `node --check` and the served assets contained the detector and warning styles
- tags: [project:sport-frames, type:vtt-editor-blank-line-warning, criterion:live-annotations]

### T-049.23 - Undo accidental WebVTT cue deletion
- status: `done`
- goal: let reviewers recover once from an accidental cue deletion or confirmed clear-all after the editor has already persisted that destructive action to local browser storage
- source: `T-049 standing criterion; Sebas 2026-08-08`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: the editor keeps one in-memory snapshot immediately before single-cue delete or confirmed clear-all and enables **Undo delete** to restore the complete prior cue list, including timing, text, and spatial values. Restore refreshes the list/live preview and localStorage, then consumes and disables the one-shot undo. A later destructive action replaces the older snapshot; add/edit/import history, redo, multi-level history, backend, account, upload, dependency, and framework remain out of scope
  - verified 2026-08-08: `node --check script.js`; every `tools/verify-*.js` harness; `bash -n tools/*.sh`; `git diff --check`; `tools/verify-destructive-undo.js` extracts the shipped snapshot helper and proves independent full-cue cloning, exact single-delete restoration, multi-cue clear-all restoration, snapshot-before-mutation wiring, one-shot consumption, and preview/localStorage refresh wiring. `ffprobe` read the real `assets/default.mp4` duration as `14.666667s`; a real static HTTP server served `/?vtt-editor`, `/script.js`, and `/style.css`, and the fetched script passed `node --check` and contained the undo control
- tags: [project:sport-frames, type:vtt-editor-destructive-undo, criterion:live-annotations]

### T-049.22 - Spatial positioning for WebVTT editor cues
- status: `done`
- goal: let reviewers place each cue on the video frame and preserve that placement through live preview, browser reload, import, apply, and `.vtt` download
- source: `T-049 standing criterion; Sebas 2026-08-07`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: cue editing now exposes X, Y, and width percentages plus 1% arrow nudges; edits render live as independently positioned overlays. Export uses only standard WebVTT `line`, `position`, `size`, and `align` cue settings (`line/position` center alignment), with no custom format extension. Import parses those settings, legacy cues receive stable defaults, and localStorage preserves spatial values. Cancel restores the pre-edit position
  - verified 2026-08-07: `node --check script.js`; every `tools/verify-*.js` harness; `git diff --check`; `tools/verify-vtt-spatial-position.js` extracts the shipped parser/export/storage functions and proves a `x=23/y=71/size=42` cue exports as native settings, parses identically, survives localStorage reload, and re-exports byte-identically. A real static HTTP server served the page/script/CSS and the same exercise passed against the fetched `/script.js`. Direct headless Chromium was attempted via `/usr/lib/chromium/chromium`, but this Pi build hung before DOM output and timed out
- tags: [project:sport-frames, type:vtt-cue-spatial-position, criterion:live-annotations]

### T-049.21 - Warn about excessive WebVTT cue reading speed
- status: `done`
- goal: flag cues whose text density exceeds a practical reading-speed ceiling, so reviewers can catch annotations that are individually valid but cannot comfortably be read during their allotted time
- source: `T-049 standing criterion; Sebas 2026-08-07`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: the editor flags cue text above 20 trimmed characters per second with an amber **High reading speed** label and reports the affected cue count in the toolbar. The exact 20 cps boundary remains valid; invalid zero-duration cues remain the existing duration concern rather than receiving a misleading speed warning. Detection is visual-only; no text/timing mutation, blocked export, backend, dependency, framework, upload, account, or persistence change
  - verified 2026-08-07: `node --check script.js`; `node tools/verify-reading-speed-warning.js`; all five existing warning harnesses; `git diff --check`; the Node harness extracts the shipped detector and proves ordinary speed, exact-boundary acceptance, above-boundary detection, trimmed outer whitespace, zero-duration handling, mixed cue selection, and render/accessible-toolbar wiring; real static HTTP served `/?vtt-editor`, `/script.js`, and `/style.css` with the detector and warning styles. Real Chromium and Firefox headless UI checks were attempted, but Chromium still fails before page load on this Pi (`unrecognized flag --no-decommit-pooled-pages`) and Firefox hung without producing a screenshot
- tags: [project:sport-frames, type:vtt-editor-reading-speed-warning, criterion:live-annotations]

### T-049.20 - Warn about near-duplicate WebVTT cue timings
- status: `done`
- goal: identify cue pairs whose start and end times are effectively the same after combining suggestion files, so reviewers can spot duplicate candidates without treating every ordinary overlap as a duplicate or blocking export
- source: `T-049 standing criterion; Sebas 2026-08-06`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: the editor detects every cue pair whose start times and end times are each within an inclusive 100ms tolerance, regardless of cue text, marks affected cues with an amber **Near-duplicate timing** label, and reports the pair count in the toolbar. This targets repeated imports and combined outputs from distinct `tools/suggest-*-vtt.sh` generators while leaving broader overlaps to the existing T-049.15 warning. Detection is visual-only; no automatic merge, timing mutation, blocked export, backend, dependency, framework, upload, account, or persistence change
  - verified 2026-08-06: `node --check script.js`; `node tools/verify-near-duplicate-warning.js`; all four existing warning harnesses; `git diff --check`; the Node harness extracts the shipped detector and proves exact timing with different text, inclusive 100ms boundary tolerance, one-boundary-outside rejection, ordinary-overlap rejection, and all-pair counting; a real static HTTP server returned `200` for `/?vtt-editor`, `/script.js`, and `/style.css`, with the served assets containing the detector and warning styles
- tags: [project:sport-frames, type:vtt-editor-near-duplicate-warning, criterion:live-annotations]

### T-049.19 - FFmpeg loud-peak-to-WebVTT cue suggestions
- status: `done`
- goal: generate review-only WebVTT cue candidates for sustained loud audio intervals using FFmpeg's existing `astats` filter, without browser changes, an authoring UI, storage layer, or backend
- source: `T-049 standing criterion; Sebas 2026-08-05`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: `tools/suggest-loudpeak-vtt.sh` measures 100ms audio windows with FFmpeg `astats`, groups consecutive windows at or above a configurable dBFS RMS threshold, and converts qualifying sustained intervals into portable WebVTT cues saying `TODO: review loud/crowd-reaction interval`; no runtime dependency, browser/editor change, persistence, upload, account, or backend
  - verified 2026-08-05: `bash -n`; real synthetic 3s MP4 with quiet/loud/quiet 1s sections emitted exactly `00:00:01.000 --> 00:00:02.000` at `-30dBFS`, matching independent `astats` output (~`-47.1/-21.1/-47.1dBFS`) and `ffprobe` duration; FFmpeg remux + `ffprobe` read the subtitle packet; invalid positive/nonnumeric threshold and zero/nonnumeric duration rejected; missing/no-audio input rejected; `node --check script.js`; `git diff --check`
- tags: [project:sport-frames, type:ffmpeg-loudpeak-webvtt-suggestions, criterion:live-annotations]

### T-049.17 - Warn about empty WebVTT cue bodies
- status: `done`
- goal: flag editor cues whose text is empty, whitespace-only, or still the literal `TODO` placeholder so unfinished annotations remain visible during review without blocking save, apply, or download
- source: `T-049 standing criterion; Sebas 2026-08-04`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: cues with empty/whitespace-only text or a trimmed body equal to literal `TODO` are marked with an amber **Needs annotation text** label and reported as an aggregate count in the toolbar, matching the overlap and duration-bounds warning pattern. The shared render path covers add, edit, delete, import, clear, and restore. Warnings are visual-only; save, apply, and download remain unblocked. No backend, dependency, framework, upload, account, or new persistence
  - verified 2026-08-04: `node --check script.js`; `node tools/verify-empty-cue-body-warning.js`; existing overlap, duration-bounds, and short-cue harnesses; `git diff --check`; the Node harness extracts shipped `findEmptyCueBodies` verbatim and proves empty, whitespace-only, literal/trimmed `TODO`, normal text, non-literal `TODO: review`, and missing-text cases, then asserts per-cue and toolbar wiring; a real static HTTP server returned `200` for `/?vtt-editor` and `/script.js`, with the served script containing `findEmptyCueBodies`
- tags: [project:sport-frames, type:vtt-editor-empty-cue-body-warning, criterion:live-annotations]

### T-049.18 - Warn about suspiciously short WebVTT cues
- status: `done`
- goal: flag editor cues whose duration is below a plausible-caption floor so a mis-click or typo during entry (near-zero-length cue) is visible during review without blocking valid WebVTT export
- source: `T-049 standing criterion; Sebas 2026-08-04`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: every cue whose `end - start` is below 150ms (`SHORT_CUE_THRESHOLD_SECONDS`) is marked with an amber **Very short cue** label and reported as an aggregate count in the toolbar, matching the overlap (T-049.15) and duration-bounds (T-049.16) warning pattern. The normal render path covers add, edit, delete, import, clear, and restore. Cues remain saveable, applicable, and downloadable; no backend, dependency, framework, upload, account, or new persistence
  - verified 2026-08-04: `node --check script.js`; `node tools/verify-short-cue-warning.js`; existing overlap and duration-bounds harnesses unaffected; `git diff --check`; the Node harness extracts the shipped `findShortCues` verbatim and proves above-threshold, exactly-at-threshold, below-threshold, and zero-duration cases, plus a mixed-cue-set case, then asserts render/toolbar wiring; a real static HTTP server returned `200` for `/?vtt-editor` and `/script.js` with the detector code present
- tags: [project:sport-frames, type:vtt-editor-short-cue-warning, criterion:live-annotations]

### T-049.16 - Warn about WebVTT cues beyond video duration
- status: `done`
- goal: flag editor cues whose start or end exceeds the loaded video's known duration so silently unreachable annotations are visible during review without blocking valid WebVTT export
- source: `T-049 standing criterion; Sebas 2026-08-03`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: when `video.duration` is finite, the editor marks every cue whose start or end exceeds it with an amber **Extends past video end** label and reports the affected count in the toolbar. The normal render path covers add, edit, delete, import, clear, and restore; `durationchange` refreshes warnings when video metadata/source changes. Unknown/`NaN` duration yields no warning. Cues remain saveable, applicable, and downloadable; no backend, dependency, framework, upload, account, or new persistence
  - verified 2026-08-03: `node --check script.js`; `node tools/verify-duration-bounds-warning.js`; existing overlap harness; `git diff --check`; the Node harness extracts shipped `findCuesPastVideoEnd` verbatim and proves unavailable/`NaN` duration, in-range cues, end past duration, start past duration, and exact-end validity, plus render/import/duration-change wiring; real static HTTP returned `200` for `/?vtt-editor` and `/script.js` with the detector present
- tags: [project:sport-frames, type:vtt-editor-duration-bounds-warning, criterion:live-annotations]

### T-049.15 - Warn about overlapping WebVTT cues
- status: `done`
- goal: flag overlapping cue timings in the editor so a reviewer can catch accidental simultaneous annotations before applying or downloading the WebVTT file
- source: `T-049 standing criterion; Sebas 2026-08-02`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: the editor now detects every pair of cues whose time ranges intersect, marks each involved cue with an amber **Overlaps another cue** warning, and reports the total number of overlapping pairs in the toolbar. Cues that only touch at an end/start boundary are not flagged. Detection refreshes through the existing render path after add, edit, delete, import, clear, and restore; overlaps remain valid/exportable because WebVTT permits them. No auto-retiming, blocked export, backend, dependency, framework, or new persistence
  - verified 2026-08-02: `node --check script.js`; `node tools/verify-overlap-warning.js`; `git diff --check`; the Node harness extracts the shipped `findCueOverlaps` verbatim and proves empty/non-overlapping input, touching boundaries, unsorted overlap, one-to-many overlap, and all-pair overlap counts, then asserts per-cue marker and accessible aggregate-warning wiring; a real static server returned the editor page, overlap detector code, and warning styles
- tags: [project:sport-frames, type:vtt-editor-overlap-warning, criterion:live-annotations]

### T-049.14 - Jump from a WebVTT cue to its live video position
- status: `done`
- goal: let a reviewer jump the scroll-scrubbed video directly to a cue's start from the editor list, so checking or retiming a cue does not require manually finding it again
- source: `T-049 standing criterion; Sebas 2026-07-31`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: every editor cue now has a native **Go to start** action that maps its start timestamp onto the existing scroll-scrub track, scrolls there, requests the normal render path, and reports the selected WebVTT timestamp. Invalid/unloaded video timing is rejected without scrolling. No playback controls, timeline, backend, dependency, framework, or new persistence
  - verified 2026-07-31: `node --check script.js`; `git diff --check`; a Node harness extracted the shipped `scrollToVideoTime` verbatim and proved exact 25% cue-time-to-scroll mapping, duration-end clamping, normal render request, and the not-ready guard, then asserted list-action wiring; a real static server returned the editor page and shipped **Go to start** code; `ffprobe` read the real `assets/default.mp4` duration as `14.666667s`
- tags: [project:sport-frames, type:vtt-editor-cue-start-navigation, criterion:live-annotations]

### T-049.13 - Keyboard mark-in/mark-out in the WebVTT cue editor
- status: `done`
- goal: let a reviewer capture the current live scrub time into the editor's start/end fields with standard `I`/`O` keys, without leaving the video to click either timing button
- source: `T-049 standing criterion; Sebas 2026-07-30`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: with the editor open, unmodified `I` writes the current scrub time to Start and `O` writes it to End through the same timing path as the existing buttons; the panel shows the key map and reports the captured timestamp. Shortcuts are disabled while the editor is hidden, while typing in an input/textarea/select/contenteditable target, on key repeat, and with Alt/Ctrl/Meta, so cue text and browser/OS shortcuts remain untouched. No playback controls, global shortcut system, backend, dependency, or framework
  - verified 2026-07-30: `node --check script.js`; `bash -n tools/*.sh`; `git diff --check`; a Node harness extracted the shipped `vttShortcutField` verbatim and proved case-insensitive `I`→start / `O`→end plus unrelated-key, editable-target, repeat, and modifier guards, then asserted hidden-editor and `setFormTime` listener wiring; a real static server returned `200` for `/?vtt-editor` and `/script.js`, serving the new shortcut code; `ffprobe` read the real `assets/default.mp4` duration as `14.666667s`. Full headless Chromium interaction was attempted, but this Pi's Chromium again failed before page load (`unrecognized flag --no-decommit-pooled-pages` child errors), consistent with T-049.10-.12's recorded environment limitation
- tags: [project:sport-frames, type:vtt-editor-keyboard-mark-in-out, criterion:live-annotations]

### T-049.12 - VTT editor discoverability, non-occluding layout, apply-as-active export, drop default.vtt
- status: `done`
- goal: address explicit live-usage feedback on the T-049.9/.10/.11 in-page WebVTT editor: (1) make the editor reachable via an in-page button instead of only the `?vtt-editor` query param, (2) keep the editor from covering the video by making the cue list scroll within a bounded height and giving the panel some transparency, (3) change the export flow so it replaces the video's currently active `.vtt` instead of only offering a clipboard-style copy, and (4) stop auto-loading `assets/default.vtt` as a canned default annotation track
- source: `T-049 explicit user feedback; Sebas 2026-07-27 (verbatim, see resolved mailbox entry for full text)`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: (1) the always-visible **Abrir editor WebVTT** button now opens/closes the editor while `?vtt-editor` remains a direct-open shortcut; (2) the cue list has its own bounded `min(16rem, 32vh)` vertical scroll area and the fixed panel background is reduced to `rgba(11, 11, 13, 0.82)`; (3) clipboard-only **Copy VTT** became **Apply to video**, which builds a native VTT Blob, revokes the prior annotation object URL, and replaces/enables the video's metadata track (download remains available); (4) the HTML track has no `assets/default.vtt` source/default flag and default-video loading no longer enables a canned track. README updated to match. LocalStorage persistence and the zero-backend/zero-dependency model remain unchanged
  - verified 2026-07-28: no repo test/QA harness exists; `node --check script.js`; `git diff --check`; real static HTTP server returned `200`; source/DOM/CSS assertions confirmed the in-page toggle wiring, hidden-state override, bounded scroll, translucent panel, apply-not-copy control, absent track `src`, and absent default-video activation branch; an extracted `replaceActiveAnnotationTrack` harness with mocked URL/track state confirmed old URL revocation, Blob-backed `src` replacement, hidden-mode activation, custom-track state, stale annotation clearing, and exact generated VTT Blob payload. Full browser interaction was attempted with local headless Chromium but `Page.navigate` again hung until timeout with zero DOM output, matching the environment limitation recorded in T-049.10/.11
- tags: [project:sport-frames, type:vtt-editor-ux-and-default-removal, criterion:live-annotations]

### T-049.11 - Persist the in-page WebVTT editor's cues across reloads
- status: `done`
- goal: keep the T-049.9 in-page cue editor's cue list across page reloads/navigation using `localStorage`, so authored/imported cues aren't lost on refresh, without adding a backend, account, or upload
- source: `T-049 standing criterion; Sebas 2026-07-27`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: `?vtt-editor` now auto-saves `editorCues` (start/end/text only, ids stripped) to `localStorage["sport-frames:vtt-editor-cues"]` (`saveEditorCues`) after every add/update/delete/import, and restores + validates them (`loadPersistedCues`: rejects non-array/corrupt JSON and any cue with a non-finite/negative start, `end<=start`, or blank/missing text) on `setupVttEditor` init; a new "Clear all cues" toolbar button (native `confirm()`) wipes both the in-memory list and the saved storage, since refresh no longer resets state the way it used to; `setItem` failures (quota/unavailable storage, e.g. private browsing) are caught and surfaced via the existing status line without breaking in-memory editing; the pre-existing uncommitted `VTT_EDITOR_STORAGE_KEY` constant (added in a prior slice, unused until now) is what this wires up
  - verified 2026-07-27: `node --check script.js`; `git diff --check`; extracted `loadPersistedCues`/`saveEditorCues` verbatim from the shipped `script.js` via a small Node harness with a mocked `localStorage` and confirmed: empty storage returns `[]`; save-then-load round-trips start/end/text (ids not persisted); corrupt JSON and non-array JSON both fall back to `[]`; a mixed batch of invalid cues (end<=start, negative start, empty/whitespace-only/missing text) is filtered down to only the valid entry; a throwing `setItem` (quota/unavailable) is caught and surfaces the "local storage is unavailable" status without throwing. Full in-page browser exercise (actual reload persistence, Clear-all confirm dialog) not run: this repo's headless Chromium is known-broken in this environment (`Page.navigate` hangs even on a trivial local page, per T-049.10's note) — logic verified at the function level instead
- tags: [project:sport-frames, type:vtt-editor-local-persistence, criterion:live-annotations]

### T-049.10 - Import WebVTT cues into the in-page editor
- status: `done`
- goal: parse an existing `.vtt` file's cues directly into the T-049.9 in-page editor's cue list so cues from the FFmpeg suggestion tools (T-049.6/.7/.8) or any externally-authored WebVTT file can be reviewed, edited, retimed, deleted, and re-exported instead of only played back passively
- source: `T-049 standing criterion; Sebas 2026-07-27`
- workspace: `/home/sebas/work/projects/sport-frames`
- next_step:
  - select the next narrow live-annotation improvement
- notes:
  - completed: `?vtt-editor` panel gained an "Import .vtt" file input; a small native WebVTT cue-block parser (`parseVttCues`/`parseVttTimestamp` in `script.js`) reads `HH:MM:SS.mmm`/`MM:SS.mmm` timing lines, ignores the `WEBVTT` header, `NOTE` blocks, cue identifiers, and trailing cue settings, and appends valid cues into the existing in-memory `editorCues` list for edit/retime/delete/export; no parser library, backend, persistence, or account
  - verified 2026-07-27: `node --check script.js`; `git diff --check`; extracted the shipped `parseVttCues`/`parseVttTimestamp` source verbatim from `script.js` and ran it in Node against the real checked-in `assets/default.vtt` (all 3 cues parsed with exact start/end/text matching the T-049.3-documented timings) and a real FFmpeg `tools/suggest-black-vtt.sh` output for a synthetic black-frame MP4 (`ffmpeg`-generated, `blackdetect`), which parsed to the expected single `TODO: review black-video interval` cue at `0.000-2.000s`; edge cases (`NOTE`-only file, header-only file, `end<=start`, `MM:SS.mmm` short form with trailing cue settings, cue identifier + multi-line text) all matched expected pass/reject behavior; real static HTTP server returned `200 text/html` for `/` and `200 text/vtt` for `/assets/default.vtt`, and the served `/script.js` contains the new `parseVttCues`/`data-import` code. Full in-page browser exercise (file-input change event, click-to-import, clipboard round-trip) was attempted via headless Chromium but abandoned: `Page.navigate` hung indefinitely and reproducibly on this ARM/Raspberry-Pi Chromium build even navigating to a trivial local plain-HTML page on a completely fresh instance (tried `--headless=new` and legacy `--headless`, with and without sandbox) - a pre-existing environment limitation, not a defect in this change
- tags: [project:sport-frames, type:vtt-editor-import, criterion:live-annotations]

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
