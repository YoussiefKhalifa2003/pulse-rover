import type { PalmGeom } from '../vision/handGeometry';
import type { MagDockPhase } from '../rover/types';

export function drawPalmPad(
  ctx: CanvasRenderingContext2D,
  geom: PalmGeom,
  opts: {
    phase: MagDockPhase;
    confidence: number;
    statusLine: string;
    now: number;
  },
): void {
  const pulse = (Math.sin(opts.now * 0.008) + 1) * 0.5;
  const { center, quad, angle } = geom;
  const active =
    opts.phase !== 'free' || opts.confidence > 0.35;

  if (!active && opts.confidence < 0.2) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Pad fill
  const alpha =
    opts.phase === 'airborne'
      ? 0.35 + pulse * 0.2
      : opts.phase === 'boarded' || opts.phase === 'hardDock'
        ? 0.28 + pulse * 0.15
        : 0.12 + opts.confidence * 0.2;
  ctx.fillStyle = `rgba(0,220,255,${alpha})`;
  ctx.beginPath();
  ctx.moveTo(quad[0].x, quad[0].y);
  for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle =
    opts.phase === 'hardDock' || opts.phase === 'boarded'
      ? `rgba(255,200,80,${0.7 + pulse * 0.3})`
      : `rgba(0,230,255,${0.4 + opts.confidence * 0.5})`;
  ctx.lineWidth =
    opts.phase === 'softDock' || opts.phase === 'hardDock' ? 2.5 : 1.5;
  ctx.stroke();

  // Lock ring
  if (
    opts.phase === 'softDock' ||
    opts.phase === 'hardDock' ||
    opts.phase === 'boarded' ||
    opts.phase === 'airborne'
  ) {
    ctx.strokeStyle = `rgba(255,180,60,${0.55 + pulse * 0.35})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 28 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Approach chevrons during seek
  if (opts.phase === 'seekingPad' || opts.phase === 'hesitating') {
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    ctx.strokeStyle = 'rgba(0,255,220,0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const y = -20 - i * 12 - pulse * 6;
      ctx.beginPath();
      ctx.moveTo(-10, y);
      ctx.lineTo(0, y + 8);
      ctx.lineTo(10, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Confidence bar + status
  if (opts.statusLine || opts.confidence > 0.2) {
    const bx = center.x - 55;
    const by = center.y + 42;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(8,12,16,0.75)';
    ctx.fillRect(bx, by, 110, 28);
    ctx.fillStyle = 'rgba(40,50,60,0.9)';
    ctx.fillRect(bx + 6, by + 16, 98, 5);
    ctx.fillStyle = 'rgba(0,230,255,0.95)';
    ctx.fillRect(bx + 6, by + 16, 98 * opts.confidence, 5);
    ctx.fillStyle = 'rgba(200,230,240,0.95)';
    ctx.font = '600 9px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(opts.statusLine || 'Landing Pad', bx + 6, by + 12);
  }

  ctx.restore();
}

export function drawMagDockHud(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number;
    height: number;
    clean: boolean;
    phase: MagDockPhase;
    confidence: number;
    statusLine: string;
  },
): void {
  if (opts.clean) return;
  if (opts.phase === 'free' && opts.confidence < 0.25) return;

  const x = opts.width - 240;
  const y = 54;
  ctx.save();
  ctx.fillStyle = 'rgba(8,12,16,0.78)';
  ctx.fillRect(x, y, 220, 72);
  ctx.strokeStyle = 'rgba(0,230,255,0.4)';
  ctx.strokeRect(x, y, 220, 72);
  ctx.fillStyle = 'rgba(0,230,255,0.95)';
  ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('MAGDOCK', x + 12, y + 18);
  ctx.fillStyle = 'rgba(200,220,230,0.9)';
  ctx.font = '500 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(opts.statusLine || opts.phase.toUpperCase(), x + 12, y + 38);
  ctx.fillStyle = 'rgba(40,50,60,0.95)';
  ctx.fillRect(x + 12, y + 48, 196, 8);
  ctx.fillStyle = 'rgba(0,230,255,0.95)';
  ctx.fillRect(x + 12, y + 48, 196 * opts.confidence, 8);
  ctx.restore();
}

export function drawQuietDeliver(
  ctx: CanvasRenderingContext2D,
  opts: { width: number; height: number; label: string },
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, opts.height * 0.42, opts.width, 48);
  ctx.fillStyle = 'rgba(0,255,200,0.95)';
  ctx.font = '700 20px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(opts.label, opts.width * 0.5, opts.height * 0.42 + 32);
  ctx.textAlign = 'left';
  ctx.restore();
}
