import type { MissionAnalysis } from '../mission/MissionScore';
import type { MissionLog } from '../mission/types';
import type { SessionStats } from '../mission/MissionScore';

export function drawDebrief(
  ctx: CanvasRenderingContext2D,
  opts: {
    width: number;
    height: number;
    analysis: MissionAnalysis;
    log: MissionLog;
    session: SessionStats;
  },
): void {
  const { width, height, analysis, log, session } = opts;
  ctx.save();
  ctx.fillStyle = 'rgba(4,8,12,0.72)';
  ctx.fillRect(0, 0, width, height);

  const cardW = Math.min(420, width - 40);
  const cardH = 320;
  const x = (width - cardW) * 0.5;
  const y = (height - cardH) * 0.5;

  ctx.fillStyle = 'rgba(8,12,16,0.94)';
  roundRect(ctx, x, y, cardW, cardH, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,224,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#00e0ff';
  ctx.font = '800 22px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PULSE-ROVER', width * 0.5, y + 36);

  ctx.fillStyle = 'rgba(200,220,230,0.85)';
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('OPS DEBRIEF', width * 0.5, y + 56);

  // Stars
  const starStr = '★'.repeat(analysis.stars) + '☆'.repeat(3 - analysis.stars);
  ctx.fillStyle = '#ffb040';
  ctx.font = '700 28px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(starStr, width * 0.5, y + 96);

  ctx.fillStyle = 'rgba(230,240,250,0.95)';
  ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(analysis.missionTimeLabel, width * 0.5, y + 128);

  ctx.font = '500 12px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(170,190,200,0.9)';
  ctx.fillText(
    `Efficiency ${analysis.efficiencyPct}% · ${analysis.trajectory} · Grip ${analysis.gripPct}%`,
    width * 0.5,
    y + 150,
  );
  ctx.fillText(
    `Cores delivered ${session.coresDelivered} · Best ${
      Number.isFinite(session.bestTimeMs)
        ? (session.bestTimeMs / 1000).toFixed(1) + ' s'
        : '—'
    }`,
    width * 0.5,
    y + 170,
  );

  // Sparkline
  drawSparkline(ctx, log, width * 0.5 - 140, y + 190, 280, 54);

  ctx.fillStyle = 'rgba(160,180,190,0.85)';
  ctx.font = '500 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('R replay · Enter run again · P save PNG', width * 0.5, y + 270);
  ctx.fillText('Capture tip: ?clean=1 + OBS / Game Bar', width * 0.5, y + 290);

  ctx.textAlign = 'left';
  ctx.restore();
}

function drawSparkline(
  ctx: CanvasRenderingContext2D,
  log: MissionLog,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const pts = log.route;
  if (pts.length < 2) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const dx = Math.max(1, maxX - minX);
  const dy = Math.max(1, maxY - minY);

  ctx.strokeStyle = 'rgba(0,220,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const px = x + ((pts[i].x - minX) / dx) * w;
    const py = y + ((pts[i].y - minY) / dy) * h;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
