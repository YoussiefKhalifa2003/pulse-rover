import type { PlasmaPath } from '../path/PlasmaPath';
import type { Waypoint } from '../path/Waypoint';

/** Cyan → violet → ember red based on age t∈[0,1] */
export function plasmaColor(t: number, pulse: number): string {
  const a = Math.max(0, 1 - t * t) * (0.75 + pulse * 0.25);
  let r: number;
  let g: number;
  let b: number;

  if (t < 0.45) {
    const u = t / 0.45;
    r = lerp(0, 160, u);
    g = lerp(230, 80, u);
    b = lerp(255, 255, u);
  } else if (t < 0.75) {
    const u = (t - 0.45) / 0.3;
    r = lerp(160, 255, u);
    g = lerp(80, 60, u);
    b = lerp(255, 90, u);
  } else {
    const u = (t - 0.75) / 0.25;
    r = lerp(255, 180, u);
    g = lerp(60, 20, u);
    b = lerp(90, 30, u);
  }

  return `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function drawPlasma(
  ctx: CanvasRenderingContext2D,
  path: PlasmaPath,
  now: number,
): void {
  const pts = path.points;
  if (pts.length === 0) return;

  const pulse = (Math.sin(now * 0.006) + 1) * 0.5;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';

  // Draw each stroke separately so lifts don't connect
  let i = 0;
  while (i < pts.length) {
    const strokeId = pts[i].strokeId;
    const start = i;
    while (i < pts.length && pts[i].strokeId === strokeId) i++;
    const stroke = pts.slice(start, i);
    drawStroke(ctx, path, stroke, now, pulse);
  }

  ctx.restore();
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  path: PlasmaPath,
  stroke: readonly Waypoint[],
  now: number,
  pulse: number,
): void {
  if (stroke.length === 1) {
    drawNode(ctx, stroke[0], path.ageOf(stroke[0], now), now);
    return;
  }

  for (let pass = 0; pass < 3; pass++) {
    const width = pass === 0 ? 20 : pass === 1 ? 9 : 3.2;
    const alphaMul = pass === 0 ? 0.22 : pass === 1 ? 0.5 : 1;

    ctx.beginPath();
    for (let i = 0; i < stroke.length; i++) {
      const p = stroke[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    const mid = stroke[Math.floor(stroke.length / 2)];
    const age = path.ageOf(mid, now);
    ctx.strokeStyle = scaleAlpha(plasmaColor(age, pulse), alphaMul);
    ctx.lineWidth = width;
    ctx.stroke();
  }

  for (let i = 1; i < stroke.length; i++) {
    const a = stroke[i - 1];
    const b = stroke[i];
    const age = (path.ageOf(a, now) + path.ageOf(b, now)) * 0.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = plasmaColor(age, pulse);
    ctx.lineWidth = 2.8;
    ctx.stroke();
  }
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  p: Waypoint,
  age: number,
  now: number,
): void {
  const pulse = (Math.sin(now * 0.006) + 1) * 0.5;
  ctx.fillStyle = plasmaColor(age, pulse);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
  ctx.fill();
}

function scaleAlpha(rgba: string, mul: number): string {
  const m = rgba.match(/rgba\((\d+),(\d+),(\d+),([0-9.]+)\)/);
  if (!m) return rgba;
  const a = Math.min(1, parseFloat(m[4]) * mul);
  return `rgba(${m[1]},${m[2]},${m[3]},${a.toFixed(3)})`;
}
