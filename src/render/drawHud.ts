import type { TipState } from '../vision/TipPipeline';
import type { DrivePhase, RoverState } from '../rover/types';

export function drawReticle(
  ctx: CanvasRenderingContext2D,
  tip: TipState,
  now: number,
): void {
  if (!tip.visible) return;

  const pulse = (Math.sin(now * 0.008) + 1) * 0.5;
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.globalCompositeOperation = 'lighter';

  if (tip.erasing) {
    ctx.strokeStyle = `rgba(255,120,80,${0.7 + pulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.stroke();
  } else if (tip.painting) {
    // Bright cyan flare on paint
    ctx.strokeStyle = `rgba(0,255,220,${0.75 + pulse * 0.25})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 14 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(180,255,255,${0.4 + pulse * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 22 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,255,220,0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Dim ring on hover
    ctx.strokeStyle = `rgba(160,200,220,${0.28 + pulse * 0.18})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(180,210,230,${0.3 + pulse * 0.15})`;
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawHud(
  ctx: CanvasRenderingContext2D,
  opts: {
    state: RoverState;
    charge: number;
    handVisible: boolean;
    painting: boolean;
    hovering: boolean;
    erasing: boolean;
    mode: TipState['mode'];
    drivePhase: DrivePhase;
    clean: boolean;
    fps: number;
    width: number;
    height: number;
  },
): void {
  if (opts.clean) return;

  const { width, height } = opts;
  ctx.save();
  ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'top';

  const modeChip = modeLabel(opts);
  const padX = 10;
  const padY = 6;
  const tw = ctx.measureText(modeChip).width;
  const chipW = tw + padX * 2;
  const chipH = 22;
  const x = width - chipW - 16;
  const y = 14;

  ctx.fillStyle = 'rgba(10,14,18,0.7)';
  roundChip(ctx, x, y, chipW, chipH, 4);
  ctx.fill();
  ctx.fillStyle = modeColor(opts);
  ctx.fillText(modeChip, x + padX, y + padY);

  // Charge bar
  ctx.fillStyle = 'rgba(10,14,18,0.55)';
  roundChip(ctx, x, y + 28, chipW, 8, 3);
  ctx.fill();
  ctx.fillStyle =
    opts.charge > 0.95 ? 'rgba(255,154,40,0.95)' : 'rgba(0,224,255,0.85)';
  ctx.fillRect(x + 2, y + 30, Math.max(0, (chipW - 4) * opts.charge), 4);

  // Hints
  ctx.fillStyle = 'rgba(10,14,18,0.62)';
  roundChip(ctx, 14, height - 52, Math.min(440, width - 28), 38, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,220,230,0.9)';
  ctx.font = '500 12px "Segoe UI", system-ui, sans-serif';

  ctx.fillText(
    opts.erasing
      ? 'Erasing tether…'
      : opts.painting
        ? 'PAINT — pinch held · release to commit route'
        : opts.hovering
          ? 'HOVER — open hand · pinch thumb+index to paint'
          : opts.handVisible
            ? 'Hand seen · open to hover · pinch to paint'
            : 'Pinch to paint · Deploy Core · paint near core to deliver',
    24,
    height - 44,
  );
  ctx.font = '500 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(160,180,190,0.85)';
  ctx.fillText(
    'Mouse drag paints · Place Core click · C clears path · Esc exits place',
    24,
    height - 26,
  );

  ctx.restore();
}

function modeLabel(opts: {
  painting: boolean;
  hovering: boolean;
  erasing: boolean;
  drivePhase: DrivePhase;
  state: RoverState;
}): string {
  if (opts.erasing) return 'ERASE';
  if (opts.painting) return 'PAINT';
  if (opts.hovering) return 'HOVER';
  if (opts.drivePhase !== 'idle') {
    return opts.drivePhase.toUpperCase();
  }
  if (opts.state === 'Waiting') return 'WAITING';
  return opts.state.toUpperCase();
}

function modeColor(opts: {
  painting: boolean;
  hovering: boolean;
  drivePhase: DrivePhase;
  state: RoverState;
}): string {
  if (opts.painting) return '#00ffd8';
  if (opts.hovering) return '#9ab8c8';
  if (opts.drivePhase === 'secure' || opts.drivePhase === 'tow') return '#ff9a28';
  if (opts.drivePhase === 'deliver') return '#5fe0a0';
  return stateColor(opts.state);
}

function stateColor(state: RoverState): string {
  switch (state) {
    case 'LockedOn':
      return '#00e0ff';
    case 'Overdrive':
      return '#ff9a28';
    case 'Waiting':
      return '#7ad0ff';
    case 'Standby':
      return '#6a8a9a';
    default:
      return '#a8c0d0';
  }
}

function roundChip(
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
