import type { PlasmaPath } from '../path/PlasmaPath';
import type { RoverSnapshot } from '../rover/types';
import type { TipState } from '../vision/TipPipeline';
import type { Cargo } from '../world/Cargo';
import type { DropZone } from '../world/DropZone';
import { drawAnalysis, drawAnalysisHud } from './drawAnalysis';
import { drawCargo } from './drawCargo';
import { drawDropZone } from './drawDropZone';
import { drawHud, drawReticle } from './drawHud';
import { drawLaser } from './drawLaser';
import { drawPlasma } from './drawPlasma';
import { drawRover } from './drawRover';
import { drawUnderglow } from './drawUnderglow';

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private clean: boolean;

  constructor(canvas: HTMLCanvasElement, clean: boolean) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    this.clean = clean;
  }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  drawVideo(video: HTMLVideoElement | null): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();
    } else {
      const g = ctx.createRadialGradient(
        w * 0.5,
        h * 0.4,
        40,
        w * 0.5,
        h * 0.5,
        Math.max(w, h) * 0.7,
      );
      g.addColorStop(0, '#1a2830');
      g.addColorStop(1, '#07090c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawFrame(opts: {
    path: PlasmaPath;
    rover: RoverSnapshot;
    tip: TipState;
    now: number;
    fps: number;
    video: HTMLVideoElement | null;
    drawing: boolean;
    cargo: Cargo;
    dropZone: DropZone;
  }): void {
    const { ctx } = this;
    const { path, rover, tip, now, fps, video, drawing, cargo, dropZone } =
      opts;

    this.drawVideo(video);
    drawDropZone(
      ctx,
      dropZone,
      now,
      cargo.present &&
        (cargo.status === 'targeted' ||
          cargo.status === 'secured' ||
          rover.drivePhase === 'tow' ||
          rover.drivePhase === 'deliver'),
    );
    drawCargo(ctx, cargo, now);
    drawPlasma(ctx, path, now);
    drawAnalysis(ctx, path, rover.analysis, now);
    drawUnderglow(ctx, rover, now);
    if (!drawing && !rover.analysis.holding) {
      drawLaser(ctx, rover, tip, now);
    } else if (tip.hovering && !tip.painting && !drawing) {
      drawLaser(ctx, rover, tip, now);
    }
    drawRover(ctx, rover, now);
    drawReticle(ctx, tip, now);
    drawAnalysisHud(ctx, rover.analysis, rover.state, {
      width: this.canvas.width,
      height: this.canvas.height,
      clean: this.clean,
      painting: drawing || tip.painting,
      tipMode: tip.mode,
    });
    drawHud(ctx, {
      state: rover.state,
      charge: rover.charge,
      handVisible: tip.visible,
      painting: drawing || tip.painting,
      hovering: tip.hovering && !tip.painting,
      erasing: tip.erasing,
      mode: tip.mode,
      drivePhase: rover.drivePhase,
      clean: this.clean,
      fps,
      width: this.canvas.width,
      height: this.canvas.height,
    });
  }
}
