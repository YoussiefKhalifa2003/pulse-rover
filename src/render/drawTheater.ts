import type { MissionLog } from '../mission/types';

export function drawTheaterOverlay(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number;
    height: number;
    callout: string;
    cold: boolean;
    simLabel: string;
    dim: number;
  },
): void {
  const { width, height } = opts;

  // Dim plate over video already drawn
  if (opts.dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${opts.dim})`;
    ctx.fillRect(0, 0, width, height);
  }

  // Letterbox
  const bar = Math.max(28, height * 0.08);
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(0, 0, width, bar);
  ctx.fillRect(0, height - bar, width, bar);

  ctx.fillStyle = 'rgba(0,230,255,0.9)';
  ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('INSTANT REPLAY', 18, bar * 0.62);
  ctx.fillStyle = 'rgba(200,220,230,0.75)';
  ctx.font = '500 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(opts.simLabel, width - 120, bar * 0.62);

  if (opts.cold) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 42px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('INSTANT REPLAY', width * 0.5, height * 0.48);
    ctx.font = '500 14px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(180,210,230,0.85)';
    ctx.fillText('Reconstructed from mission telemetry', width * 0.5, height * 0.54);
    ctx.textAlign = 'left';
  }

  if (opts.callout && !opts.cold) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '800 36px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(opts.callout, 22, height * 0.72 + 2);
    ctx.fillStyle = 'rgba(0,255,220,0.95)';
    ctx.fillText(opts.callout, 20, height * 0.72);
    ctx.restore();
  }

  // Ghost hint
  ctx.fillStyle = 'rgba(140,160,170,0.55)';
  ctx.font = '500 10px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Space skip · Esc exit', 18, height - bar * 0.35);
}

export function drawGhostRoute(
  ctx: CanvasRenderingContext2D,
  log: MissionLog,
): void {
  if (log.route.length < 2) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,200,255,0.28)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(log.route[0].x, log.route[0].y);
  for (let i = 1; i < log.route.length; i++) {
    ctx.lineTo(log.route[i].x, log.route[i].y);
  }
  ctx.stroke();
  ctx.restore();
}
