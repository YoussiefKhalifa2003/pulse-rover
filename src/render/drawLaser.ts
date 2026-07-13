import type { RoverSnapshot } from '../rover/types';

export function drawLaser(
  ctx: CanvasRenderingContext2D,
  rover: RoverSnapshot,
  now: number,
): void {
  if (rover.state !== 'LockedOn' && rover.state !== 'Overdrive') return;
  if (!rover.lockTarget) return;

  const turretLen = 10;
  const ox = rover.x + Math.cos(rover.turretAngle) * turretLen;
  const oy = rover.y + Math.sin(rover.turretAngle) * turretLen;
  const tx = rover.lockTarget.x;
  const ty = rover.lockTarget.y;
  const flicker = 0.7 + Math.sin(now * 0.04) * 0.3;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  ctx.strokeStyle = `rgba(255,80,120,${0.25 * flicker})`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255,200,220,${0.85 * flicker})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  // Lock diamond on target
  ctx.translate(tx, ty);
  ctx.rotate(now * 0.003);
  ctx.strokeStyle = `rgba(0,230,255,${0.7 * flicker})`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-7, -7, 14, 14);
  ctx.restore();
}
