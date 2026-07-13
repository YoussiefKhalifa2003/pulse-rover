import { CONFIG } from '../config';
import type { RoverSnapshot } from '../rover/types';

export function drawUnderglow(
  ctx: CanvasRenderingContext2D,
  rover: RoverSnapshot,
  now: number,
): void {
  const boost = rover.state === 'Overdrive' || rover.cargoAttached;
  const locked = rover.state === 'LockedOn';
  const base = boost
    ? CONFIG.UNDERGLOW_BOOST_COLOR
    : rover.glowTint ?? CONFIG.UNDERGLOW_COLOR;
  const c = base;

  const pulse =
    rover.state === 'Standby'
      ? 0.35 + Math.sin(now * 0.004) * 0.15
      : locked
        ? 0.85 + Math.sin(now * 0.012) * 0.15
        : boost
          ? 1
          : 0.55;

  const radius = 48 * (boost ? 1.35 : 1) * rover.suspension;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(
    rover.x,
    rover.y + 8,
    4,
    rover.x,
    rover.y + 8,
    radius,
  );
  g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${(0.55 * pulse).toFixed(3)})`);
  g.addColorStop(0.45, `rgba(${c.r},${c.g},${c.b},${(0.22 * pulse).toFixed(3)})`);
  g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(rover.x, rover.y + 10, radius * 1.15, radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
