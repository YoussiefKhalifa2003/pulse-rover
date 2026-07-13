import type { Cargo } from '../world/Cargo';

export function drawCargo(
  ctx: CanvasRenderingContext2D,
  cargo: Cargo,
  now: number,
): void {
  if (!cargo.present) return;

  const pulse = (Math.sin(now * 0.007) + 1) * 0.5;
  const r = cargo.size * 0.5;
  const { x, y, status } = cargo;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Outer status ring
  const ring =
    status === 'delivered'
      ? `rgba(80,220,140,${0.45 + pulse * 0.25})`
      : status === 'secured'
        ? `rgba(255,180,60,${0.55 + pulse * 0.3})`
        : status === 'targeted'
          ? `rgba(255,200,80,${0.5 + pulse * 0.35})`
          : `rgba(255,160,40,${0.35 + pulse * 0.25})`;
  ctx.strokeStyle = ring;
  ctx.lineWidth = status === 'targeted' || status === 'secured' ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r + 8 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();

  // Core glow
  const g = ctx.createRadialGradient(x, y, 2, x, y, r + 6);
  g.addColorStop(0, 'rgba(255,230,160,0.95)');
  g.addColorStop(0.45, 'rgba(255,150,40,0.75)');
  g.addColorStop(1, 'rgba(255,100,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r + 6, 0, Math.PI * 2);
  ctx.fill();

  // Solid plasma core
  ctx.globalCompositeOperation = 'source-over';
  const body = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, r);
  body.addColorStop(0, '#ffe8a0');
  body.addColorStop(0.5, '#ff9a28');
  body.addColorStop(1, '#c45a10');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,200,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Tiny label
  ctx.fillStyle = 'rgba(255,230,180,0.85)';
  ctx.font = '600 9px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    status === 'delivered' ? 'DELIVERED' : 'CORE',
    x,
    y + r + 16,
  );

  ctx.restore();
}
