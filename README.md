# Pulse-Rover

**AR desk proving ground** — paint a glowing plasma tether with your index finger on a live webcam feed, and watch a sci-fi micro-rover lock on, absorb the path, charge up, and overdrive across your desk.

No robotics hardware. Browser only.

![Pulse-Rover](public/favicon.svg)

## Quick start

```bash
npm install
npm run dev
```

## How to play

1. Click **Engage** and allow the webcam.
2. **Pinch thumb + index** and drag to paint. Release to end a stroke (new strokes stay separate).
3. **C** or **Clear path** wipes all ink. **Right-drag** or hold **E** erases locally.
4. Mouse drag also paints if you prefer.

The rover follows strokes, absorbs plasma into its charge meter, then **Overdrive**s. Without a path it does short Recon bursts and stays on-screen (letterboxed playfield + edge bounce).

## How it works

| Layer | Role |
|-------|------|
| Vision | MediaPipe Hand Landmarker in a Web Worker tracks landmark 8 (index tip) |
| Logic | Decaying waypoints (10s), density-based speed, four-state rover AI |
| Render | Mirrored webcam + Canvas 2D plasma, underglow, laser lock, procedural rover |

### Rover states

- **Recon** — short bursts, turret sweep, explores the desk
- **Locked-On** — steers along the tether, absorbs plasma, fills the charge meter
- **Overdrive** — 3s boost when charge hits 100% (bridges gaps)
- **Standby** — after ~30s idle: lowers suspension, headlights off, low-power pulse

### Plasma tether

Drawn paths glow cyan → violet → ember red over **10 seconds**, then evaporate. Dense squiggles slow the rover; long sweeping arcs let it cruise.

## Stack

- Vite + TypeScript (vanilla)
- `@mediapipe/tasks-vision` `0.10.21` (self-hosted WASM + `.task` in `public/mediapipe/`)
- Canvas 2D overlay
- Web Audio cues (optional; safe when muted)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local development server |
| `npm run build` | Typecheck + production build → `dist/` |
| `npm run preview` | Preview the production build |
| `npm run deploy` | Build and publish `dist/` to GitHub Pages via `gh-pages` |

### GitHub Pages

1. Create a GitHub repo and push this project.
2. Run `npm run deploy`.
3. In the repo **Settings → Pages**, set source to the `gh-pages` branch.
4. Share the Pages URL on LinkedIn.

`vite.config.ts` uses `base: './'` so assets resolve on project pages.

## Project layout

```
src/
  app/GameApp.ts          # orchestration + game loop
  camera/CameraService.ts
  vision/                 # worker, tip pipeline, paint gate
  path/PlasmaPath.ts      # waypoints + decay
  rover/                  # physics + state machine
  render/                 # plasma, rover, laser, underglow, HUD
  audio/AudioCues.ts
  ui/                     # boot overlay + styles
  config.ts               # all tunables
```

Tune feel in [`src/config.ts`](src/config.ts) (lifetime, lock radius, speeds, standby timeout, underglow color).

## LinkedIn capture checklist (20–40s)

1. Good overhead or 45° desk lighting; clear background.
2. Open `?clean=1` for a chrome-free frame.
3. Cold start → Engage → paint a sweeping arc → rover locks on.
4. Keep painting until the rear meter fills → Overdrive fires.
5. Pause drawing briefly so Recon/Standby is visible (optional).
6. Export muted-friendly video; caption with 3 bullets (problem / approach / stack) + GitHub link.

### Suggested post bullets

- Built a webcam AR sandbox where a finger-painted plasma path guides an autonomous micro-rover — no robots required.
- MediaPipe hand tracking in a Web Worker + decaying path AI + Canvas 2D underglow/laser FX.
- Stack: Vite, TypeScript, `@mediapipe/tasks-vision`.

## Architecture note

Inference never blocks the UI thread: the main loop submits `ImageBitmap` frames to a worker with **back-pressure** (drop if busy). Domain modules (`path/`, `rover/`) are DOM-free so behavior can be tuned independently of rendering.

## License

MIT — build on it, demo it, ship it.
