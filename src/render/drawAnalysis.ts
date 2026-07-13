import type { RoverState } from '../rover/types';
import type { RoverAnalysis } from '../rover/types';
import type { PlasmaPath } from '../path/PlasmaPath';
import type { TipState } from '../vision/TipPipeline';
import { CONFIG } from '../config';

/**
 * Live "robot vision" overlay — nodes, focus, lookahead, absorb radius.
 */
export function drawAnalysis(
  ctx: CanvasRenderingContext2D,
  path: PlasmaPath,
  analysis: RoverAnalysis,
  now: number,
): void {
  const pts = path.points;
  if (pts.length === 0 && !analysis.holding) return;

  const pulse = (Math.sin(now * 0.008) + 1) * 0.5;
  const strokeId = analysis.activeStrokeId;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  let seq = 0;
  for (let i = 0; i < pts.length; i++) {
    const w = pts[i];
    if (strokeId !== null && w.strokeId !== strokeId) {
      ctx.strokeStyle = 'rgba(120,140,160,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 4, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }

    seq++;
    const isFocus = i === analysis.followIndex;
    const isNear =
      analysis.followIndex >= 0 && Math.abs(i - analysis.followIndex) <= 2;

    if (isFocus) {
      ctx.strokeStyle = `rgba(255,200,80,${0.75 + pulse * 0.25})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 12 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,120,0.9)';
      ctx.beginPath();
      ctx.arc(w.x, w.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isNear) {
      ctx.strokeStyle = `rgba(0,230,255,${0.55 + pulse * 0.2})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(0,200,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (seq % 5 === 0 || isFocus) {
      ctx.fillStyle = isFocus
        ? 'rgba(255,220,120,0.95)'
        : 'rgba(160,210,230,0.55)';
      ctx.font = '600 9px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(String(seq), w.x + 8, w.y - 8);
    }
  }

  if (analysis.lookahead && !analysis.holding) {
    const t = analysis.lookahead;
    ctx.strokeStyle = `rgba(255,100,140,${0.55 + pulse * 0.35})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(t.x - 8, t.y);
    ctx.lineTo(t.x + 8, t.y);
    ctx.moveTo(t.x, t.y - 8);
    ctx.lineTo(t.x, t.y + 8);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,100,140,0.35)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(analysis.roverX, analysis.roverY);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = analysis.holding
    ? `rgba(180,200,210,${0.25 + pulse * 0.15})`
    : `rgba(0,255,200,${0.3 + pulse * 0.2})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(
    analysis.roverX,
    analysis.roverY,
    CONFIG.ABSORB_RADIUS_PX,
    0,
    Math.PI * 2,
  );
  ctx.stroke();

  const fov = 0.55;
  const range = 90;
  ctx.fillStyle = analysis.holding
    ? 'rgba(160,180,200,0.08)'
    : 'rgba(0,220,255,0.1)';
  ctx.beginPath();
  ctx.moveTo(analysis.roverX, analysis.roverY);
  ctx.arc(
    analysis.roverX,
    analysis.roverY,
    range,
    analysis.turretAngle - fov,
    analysis.turretAngle + fov,
  );
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function drawAnalysisHud(
  ctx: CanvasRenderingContext2D,
  analysis: RoverAnalysis,
  state: RoverState,
  opts: {
    width: number;
    height: number;
    clean: boolean;
    painting: boolean;
    tipMode: TipState['mode'];
    bestTimeMs?: number;
  },
): void {
  if (opts.clean) return;

  const lines: string[] = [];
  const phase = analysis.drivePhase;
  const cl = analysis.missionChecklist;

  if (opts.painting || analysis.holding) {
    lines.push(
      opts.tipMode === 'hover'
        ? 'MODE  HOVER — open hand (no ink)'
        : 'MODE  PAINT — pinch to ink · release commits',
    );
    lines.push('Finish the stroke, then rover approaches start');
  } else if (phase === 'approach') {
    lines.push('MODE  APPROACH — driving to path start');
    lines.push(`NODES  ${analysis.nodeTotal} locked · start highlighted`);
  } else if (phase === 'seekCargo') {
    lines.push('MODE  SEEK — fetching plasma core');
  } else if (phase === 'secure') {
    lines.push('MODE  SECURE — locking cargo');
  } else if (phase === 'tow') {
    lines.push('MODE  TOW — delivering to drop zone');
  } else if (phase === 'deliver') {
    lines.push('MODE  DELIVER — releasing cargo');
  } else if (phase === 'follow' || analysis.nodeTotal > 0) {
    lines.push(`MODE  DRIVE — ${state.toUpperCase()}`);
    lines.push(
      `NODE  ${Math.max(1, analysis.nodeIndex)} / ${analysis.nodeTotal}`,
    );
  } else {
    lines.push('MODE  IDLE — pinch a path · deploy core for delivery');
  }

  if (analysis.missionElapsedMs > 0) {
    lines.push(`TIME  ${(analysis.missionElapsedMs / 1000).toFixed(1)} s`);
  }
  if (opts.bestTimeMs && Number.isFinite(opts.bestTimeMs)) {
    lines.push(`BEST  ${(opts.bestTimeMs / 1000).toFixed(1)} s`);
  }

  lines.push(`${cl.approachStart ? '[x]' : '[ ]'} Approach start`);
  lines.push(`${cl.secured ? '[x]' : '[ ]'} Secure core`);
  lines.push(`${cl.delivered ? '[x]' : '[ ]'} Deliver to zone`);

  ctx.save();
  ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
  const boxW = 320;
  const boxH = 18 + lines.length * 16;
  const x = 14;
  const y = 54;
  ctx.fillStyle = 'rgba(8,12,16,0.72)';
  roundRect(ctx, x, y, boxW, boxH, 4);
  ctx.fill();
  lines.forEach((line, i) => {
    const isCheck = line.startsWith('[');
    ctx.fillStyle = isCheck
      ? line.startsWith('[x]')
        ? 'rgba(80,230,140,0.95)'
        : 'rgba(160,180,190,0.75)'
      : i === 0
        ? 'rgba(0,230,255,0.95)'
        : 'rgba(200,220,230,0.85)';
    ctx.font =
      i === 0
        ? '600 11px "Segoe UI", system-ui, sans-serif'
        : '500 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(line, x + 12, y + 14 + i * 16);
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
