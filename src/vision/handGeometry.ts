import { HandLandmark } from './landmarks';
import type { Landmark } from './landmarks';
import { landmarkToCanvas } from './TipPipeline';

export interface PalmGeom {
  center: { x: number; y: number };
  angle: number;
  scale: number;
  flatness: number;
  extension: number;
  tilt: number;
  quad: { x: number; y: number }[];
  tipPoints: { x: number; y: number; z: number }[];
  meanTipZ: number;
  wristZ: number;
}

export function palmCenterNorm(landmarks: Landmark[]): {
  x: number;
  y: number;
  z: number;
} {
  const ids = [
    HandLandmark.WRIST,
    HandLandmark.INDEX_MCP,
    HandLandmark.MIDDLE_MCP,
    HandLandmark.RING_MCP,
    HandLandmark.PINKY_MCP,
  ];
  let x = 0;
  let y = 0;
  let z = 0;
  for (const id of ids) {
    x += landmarks[id].x;
    y += landmarks[id].y;
    z += landmarks[id].z;
  }
  const n = ids.length;
  return { x: x / n, y: y / n, z: z / n };
}

/** 0–1 how extended fingers are (open palm high). */
export function fingerExtension(landmarks: Landmark[]): number {
  const pairs: [number, number][] = [
    [HandLandmark.INDEX_TIP, HandLandmark.INDEX_PIP],
    [HandLandmark.MIDDLE_TIP, HandLandmark.MIDDLE_PIP],
    [HandLandmark.RING_TIP, HandLandmark.RING_PIP],
    [HandLandmark.PINKY_TIP, HandLandmark.PINKY_PIP],
  ];
  let sum = 0;
  for (const [tip, pip] of pairs) {
    const d = Math.hypot(
      landmarks[tip].x - landmarks[pip].x,
      landmarks[tip].y - landmarks[pip].y,
    );
    sum += Math.min(1, d / 0.08);
  }
  return sum / pairs.length;
}

/** Pinch closeness thumb–index in landmark space. */
export function pinchDist(landmarks: Landmark[]): number {
  const a = landmarks[HandLandmark.THUMB_TIP];
  const b = landmarks[HandLandmark.INDEX_TIP];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function measurePalm(
  landmarks: Landmark[],
  width: number,
  height: number,
): PalmGeom {
  const c = palmCenterNorm(landmarks);
  const center = landmarkToCanvas(c.x, c.y, width, height);
  const wrist = landmarks[HandLandmark.WRIST];
  const mid = landmarks[HandLandmark.MIDDLE_MCP];
  const angle = Math.atan2(mid.y - wrist.y, -(mid.x - wrist.x)); // mirrored X sense

  const idx = landmarks[HandLandmark.INDEX_MCP];
  const pnk = landmarks[HandLandmark.PINKY_MCP];
  const span =
    Math.hypot(
      (1 - idx.x) * width - (1 - pnk.x) * width,
      idx.y * height - pnk.y * height,
    ) || 1;
  const scale = span / Math.min(width, height);

  const extension = fingerExtension(landmarks);
  const tips = [
    HandLandmark.INDEX_TIP,
    HandLandmark.MIDDLE_TIP,
    HandLandmark.RING_TIP,
    HandLandmark.PINKY_TIP,
  ];
  let meanTipZ = 0;
  const tipPoints: { x: number; y: number; z: number }[] = [];
  for (const id of tips) {
    const t = landmarks[id];
    meanTipZ += t.z;
    const p = landmarkToCanvas(t.x, t.y, width, height);
    tipPoints.push({ ...p, z: t.z });
  }
  meanTipZ /= tips.length;
  // Facing camera / flat: tips not much closer than wrist (MediaPipe z: smaller = closer)
  const facing = Math.max(0, Math.min(1, 1 - (wrist.z - meanTipZ) * 8));
  const flatness = extension * 0.65 + facing * 0.35;
  const tilt = meanTipZ - wrist.z;

  const quadIds = [
    HandLandmark.INDEX_MCP,
    HandLandmark.PINKY_MCP,
    HandLandmark.PINKY_TIP,
    HandLandmark.INDEX_TIP,
  ];
  // Better palm quad: wrist-ish corners
  const q = [
    landmarkToCanvas(
      landmarks[HandLandmark.INDEX_MCP].x,
      landmarks[HandLandmark.INDEX_MCP].y,
      width,
      height,
    ),
    landmarkToCanvas(
      landmarks[HandLandmark.PINKY_MCP].x,
      landmarks[HandLandmark.PINKY_MCP].y,
      width,
      height,
    ),
    landmarkToCanvas(
      (landmarks[HandLandmark.PINKY_MCP].x + landmarks[HandLandmark.WRIST].x) *
        0.5,
      (landmarks[HandLandmark.PINKY_MCP].y + landmarks[HandLandmark.WRIST].y) *
        0.5 +
        0.04,
      width,
      height,
    ),
    landmarkToCanvas(
      (landmarks[HandLandmark.INDEX_MCP].x + landmarks[HandLandmark.WRIST].x) *
        0.5,
      (landmarks[HandLandmark.INDEX_MCP].y + landmarks[HandLandmark.WRIST].y) *
        0.5 +
        0.04,
      width,
      height,
    ),
  ];
  void quadIds;

  return {
    center,
    angle,
    scale,
    flatness,
    extension,
    tilt,
    quad: q,
    tipPoints,
    meanTipZ,
    wristZ: wrist.z,
  };
}
