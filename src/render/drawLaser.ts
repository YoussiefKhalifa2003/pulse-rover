import type { TipState } from '../vision/TipPipeline';
import type { RoverSnapshot } from '../rover/types';

export function drawLaser(
  ctx: CanvasRenderingContext2D,
  rover: RoverSnapshot,
  tip: TipState,
  now: number,
): void {
  const hoverLaser =
    tip.visible &&
    tip.hovering &&
    !tip.painting &&
    (rover.state === 'Waiting' ||
      rover.state === 'Recon' ||
      rover.hoverTracking);

  const locked =
    (rover.state === 'LockedOn' || rover.state === 'Overdrive') &&
    !!rover.lockTarget;

  if (!locked && !hoverLaser) return;
  if (!rover.lockTarget && !tip.visible) return;

  const turretLen = 10;
  const ox = rover.x + Math.cos(rover.turretAngle) * turretLen;
  const oy = rover.y + Math.sin(rover.turretAngle) * turretLen;
  const tx = rover.lockTarget?.x ?? tip.x;
  const ty = rover.lockTarget?.y ?? tip.y;
  const flicker = 0.7 + Math.sin(now * 0.04) * 0.3;
  const dim = hoverLaser && !locked ? 0.35 : 1;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  ctx.strokeStyle = `rgba(255,80,120,${0.25 * flicker * dim})`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255,200,220,${0.85 * flicker * dim})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  if (locked) {
    ctx.translate(tx, ty);
    ctx.rotate(now * 0.003);
    ctx.strokeStyle = `rgba(0,230,255,${0.7 * flicker})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-7, -7, 14, 14);
  }

  ctx.restore();
}
