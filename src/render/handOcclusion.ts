import type { PalmGeom } from '../vision/handGeometry';

/** Soft finger stubs so boarded rover can appear under fingers. */
export function drawHandOcclusion(
  ctx: CanvasRenderingContext2D,
  geom: PalmGeom,
  roverY: number,
): void {
  // If fingertips are "closer" (smaller z) than wrist, draw overlays above rover
  if (geom.meanTipZ >= geom.wristZ - 0.01) return;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (const t of geom.tipPoints) {
    if (t.y > roverY + 8) continue; // tip below rover — less useful
    const g = ctx.createRadialGradient(t.x, t.y, 2, t.x, t.y, 16);
    g.addColorStop(0, 'rgba(40,30,25,0.45)');
    g.addColorStop(1, 'rgba(40,30,25,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
