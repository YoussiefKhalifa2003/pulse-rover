# Pulse-Rover

**AR desk companion** — **MagDock**: open a flat palm and an autonomous micro-rover evaluates, hesitates, Maglocks onto your hand, rides with you (cargo can stack), then disembarks to finish delivery.

No robotics hardware. Browser only.

## Quick start

```bash
npm install
npm run dev
```

## How to play

1. **Engage** and allow the webcam.
2. Hold a **flat open palm** toward the camera — Landing Pad appears.
3. Watch **evaluate → hesitate → Maglock** (not an instant teleport).
4. **Lift** your hand — rover stays aboard (airborne). **Set down** to disembark.
5. Optional: **pinch** to paint a route; **Deploy Core** for a delivery mission (core can ride the hand stack while secured).
6. After deliver: quiet `DELIVERED` hold. Press **R** for optional Instant Replay.

Keys: `C` clear · `M` mute · `Esc` exit replay · `R` replay.

Filming: `?clean=1` + OBS / Game Bar / ShadowPlay.

## Why it’s different

Most MediaPipe demos are air-draw or particles on a hand. Pulse-Rover MagDocks an **autonomous mission agent** onto a live hand as a **mobile base**.

## Stack

Vite + TypeScript · MediaPipe Hand Landmarker (2 hands) · Canvas 2D · Web Audio

## URL flags

| Flag | Effect |
|------|--------|
| `?clean=1` | Hide toolbar / live HUD |
| `?coach=0` | Skip first-run coach |

## LinkedIn

See [`LINKEDIN.md`](LINKEDIN.md).

## License

MIT
