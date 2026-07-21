# Iteration 8 — Transcript-centric clip editor

**Objective:** turn the player modal into a full editor where the **transcript is
the timeline** and the editing surface: build clips (single or multi-segment
"lines of thought", plus a summary) by selecting text, preview them with playback
governed by the active item, and generate the 9:16 clips.

**Status:** implemented and verified E2E (clip rendering incl. multi-segment and
summary; on-demand generation wiring; deterministic logic — segmentation, snap,
sectionize, playback governor mapping). The LLM generation itself needs a
configured provider key.

## 1. Architecture (native, no rich-text lib)

- **`useClipEditor` + `ClipEditorProvider`** (React context): single source of
  truth for transcript, clips, selection, playback and generation — no prop
  drilling. `apps/web/app/lib/clip-editor-context.tsx`.
- **Decorator registry** (`lib/decorators.ts`): each decorator contributes
  classes to a word (playhead, clip spans). Resolves one exclusive background +
  additive accents; extensible for future overlays (e.g. captions).
- **Keyboard command layer**: space (play/pause), ←/→ (±5s), `C` create, `F`
  replace-active, `A` add-segment, `[`/`]` trim, Del delete, Cmd/Ctrl+S save, Esc.

## 2. Editing from the transcript

- Drag over words to select → floating bar: **+ Nuevo clip**, **+ Añadir a
  activo** (append a segment → line of thought), **Fijar** (replace).
- Click a word to seek; drag the colored **handles** of the active item to trim
  each segment; **Cortes limpios** snaps every range to full sentences.
- Words are colored per clip via the decorator registry; the active clip is
  emphasized and shows numbered segment badges.

## 3. Clips model

- A clip is an ordered list of **segments** (contract: `Highlight.segments`,
  `Clip.segments`). 1 = simple cut; N = stitched clip. `summary: true` marks the
  recap. `start/end` are the envelope. See Iterations 5–6 (multi-segment + FFmpeg
  concat render) and the deterministic summary builder (`buildSummary`).

## 4. On-demand generation

Settings panel (behavior only) triggers `POST /highlights/generate`; single-pass
detector returns lines of thought. Detail in
[`fase-7-generacion-on-demand.md`](./fase-7-generacion-on-demand.md).

## 5. Governed preview

- Selecting an item makes its **segments the playback timeline**: playback plays
  each segment in composer order, jumps between them, and **loops** after the
  last. Positions outside the segments snap in. With **no item selected** the
  video plays normally (full source); a **"Ver video completo"** control and
  clicking a word outside the item both deselect.
- **Virtual segment timeline bar** (`SegmentBar`): shows only the active item's
  segments (widths ∝ duration), a **draggable playhead** in virtual time, and
  **per-segment source-time labels**. Click/drag to seek within the item.
- **Follow/pin** toggle in the (sticky) transcript header: auto-scrolls to the
  playing word; **auto-unpins on manual scroll**.
- Implemented via `handleTimeUpdate` (advance/loop/enter) + smart `seek`
  (inside → stay governed, outside → deselect) in the context.

## 6. Live status

- Generation panel shows the live phase (queued → analyzing) while generating.
- Clips panel shows live render progress (`ready/total`, failures) with a grace
  window so the delete→re-render gap doesn't stall the indicator.

## Deliverables

`lib/clip-editor-context.tsx` (state, playback governor, generation) ·
`lib/decorators.ts` · `lib/editor.ts` (EditClip, palette, snap, buildSummary) ·
`components/transcript-editor.tsx` · `components/composer.tsx` (+ dnd-kit segment
reorder) · `components/generation-settings.tsx` · `components/video-player.tsx`
(video stage + `SegmentBar`) · `components/clips-panel.tsx` (live progress).
