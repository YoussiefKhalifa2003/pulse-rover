import type { MissionAnalysis } from '../mission/MissionScore';

export function drawMissionAnalysis(
  ctx: CanvasRenderingContext2D,
  analysis: MissionAnalysis,
  opts: {
    width: number;
    height: number;
    progress: number;
    now: number;
  },
): void {
  const reveal = Math.min(1, opts.progress * 1.4);
  const x = opts.width - 268;
  const y = 52;
  const w = 250;
  const h = 128;

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = 'rgba(6,10,14,0.82)';
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,230,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = 'rgba(0,230,255,0.95)';
  ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('MISSION ANALYSIS', x + 12, y + 18);

  const rows: [string, string, number?][] = [
    ['Efficiency', `${analysis.efficiencyPct}%`, analysis.efficiency],
    ['Trajectory', analysis.trajectory],
    ['Grip Quality', `${analysis.gripPct}%`, analysis.gripQuality],
    ['Delivery', analysis.delivery],
    ['Mission Time', analysis.missionTimeLabel],
  ];

  rows.forEach((row, i) => {
    const ry = y + 36 + i * 18;
    ctx.fillStyle = 'rgba(160,180,190,0.85)';
    ctx.font = '500 10px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(row[0], x + 12, ry);
    ctx.fillStyle = 'rgba(220,240,250,0.95)';
    ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(row[1], x + w - 12, ry);
    ctx.textAlign = 'left';

    if (row[2] !== undefined) {
      const barW = 90;
      const bx = x + 100;
      const by = ry - 7;
      ctx.fillStyle = 'rgba(40,50,60,0.9)';
      ctx.fillRect(bx, by, barW, 5);
      ctx.fillStyle = 'rgba(0,230,255,0.9)';
      ctx.fillRect(bx, by, barW * row[2] * reveal, 5);
    }
  });

  ctx.restore();
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
