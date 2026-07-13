import type { DropZone } from '../world/DropZone';

export function drawDropZone(
  ctx: CanvasRenderingContext2D,
  zone: DropZone,
  now: number,
  highlight = false,
): void {
  const pulse = (Math.sin(now * 0.005) + 1) * 0.5;
  const { x, y, w, h } = zone;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  ctx.fillStyle = highlight
    ? `rgba(40,200,120,${0.12 + pulse * 0.08})`
    : `rgba(40,180,100,${0.08 + pulse * 0.05})`;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = highlight
    ? `rgba(80,255,160,${0.55 + pulse * 0.3})`
    : `rgba(60,220,130,${0.4 + pulse * 0.2})`;
  ctx.lineWidth = highlight ? 2.5 : 1.5;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.setLineDash([]);

  // Corner ticks
  const t = 10;
  ctx.lineWidth = 2;
  ctx.beginPath();
  // TL
  ctx.moveTo(x, y + t);
  ctx.lineTo(x, y);
  ctx.lineTo(x + t, y);
  // TR
  ctx.moveTo(x + w - t, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + t);
  // BR
  ctx.moveTo(x + w, y + h - t);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - t, y + h);
  // BL
  ctx.moveTo(x + t, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - t);
  ctx.stroke();

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(140,230,180,0.75)';
  ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('DROP ZONE', x + 8, y + 14);

  ctx.restore();
}
