# Pulse-Rover

**AR desk proving ground** — hover with an open hand, **pinch to paint** a plasma tether, deploy a Plasma Core, and watch a sci-fi micro-rover approach, secure, tow, and deliver.

No robotics hardware. Browser only.

![Pulse-Rover](public/favicon.svg)

## Quick start

```bash
npm install
npm run dev
```

## How to play

1. Click **Engage** and allow the webcam.
2. **Open hand** = hover (reticle + turret track; no ink).
3. **Pinch thumb + index** and drag to paint. Release to commit the route.
4. **Deploy Core** places cargo (or **Place Core** then click). A green **Drop Zone** appears by default (**Reset Zone** restores it).
5. After commit: rover approaches path start → follows → secures the core (auto-seeks if the path missed) → tows into the zone → delivers.
6. **C** / **Clear path** wipes ink and aborts the drive (cargo/zone stay). **Esc** exits Place Core. Right-drag / **E** erases locally.
7. Mouse left-drag still paints intentionally.

Filming: open `?clean=1` to hide toolbar / HUD chrome (cargo, zone, rover stay visible).

## How it works

| Layer | Role |
|-------|------|
| Vision | MediaPipe Hand Landmarker; pinch gate (landmarks 4–8) with EMA + hysteresis |
| Path | Decaying waypoints, pin-while-driving, frozen route copy |
| Mission | Delivery planner: approach → follow → seek/secure → tow → deliver |
| Render | Mirrored webcam + plasma, cargo, drop zone, gripper, analysis HUD |

### Rover drive phases

- **approach** — drive to path start (no teleport)
- **follow** — sequential waypoints at cruise speed
- **seekCargo** — fetch core if the path never passed near it
- **secure** — brief clamp + parent cargo to bumper
- **tow** / **deliver** — haul into drop zone and release

Idle states: **Waiting** (while drawing), **Recon**, **Standby**.

## Stack

- Vite + TypeScript (vanilla)
- `@mediapipe/tasks-vision` `0.10.21` (self-hosted WASM + `.task` in `public/mediapipe/`)
- Canvas 2D overlay
- Web Audio cues

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
  vision/                 # tip pipeline, pinch paint gate
  path/PlasmaPath.ts      # waypoints + pin/decay
  world/                  # Cargo, DropZone, Mission planner
  rover/                  # route drive + delivery phases
  render/                 # plasma, cargo, zone, rover, HUD
  audio/AudioCues.ts
  ui/                     # boot overlay + styles
  config.ts               # all tunables (pinch, cargo, speeds)
```

Tune feel in [`src/config.ts`](src/config.ts).

## LinkedIn capture checklist (20–40s)

1. Good overhead or 45° desk lighting; clear background.
2. Open `?clean=1` for a chrome-free frame.
3. Engage → open hand (hover, no ink) → Deploy Core → pinch a path through/near the core toward the drop zone → release.
4. Watch approach → secure clamp → tow → deliver chime.
5. Export muted-friendly video; caption with 3 bullets + GitHub link.

### Suggested post bullets

- Built a webcam AR desk agent: pinch-to-paint plasma routes + a micro-rover that fetches and delivers a plasma core.
- MediaPipe pinch gate (EMA + hysteresis) + deterministic route copy + parent-bound cargo (no physics engine).
- Stack: Vite, TypeScript, `@mediapipe/tasks-vision`.

## License

MIT — build on it, demo it, ship it.
