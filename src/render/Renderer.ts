import type { PlasmaPath } from '../path/PlasmaPath';
import type { DirectorCamera } from '../mission/DirectorCamera';
import type { MissionAnalysis } from '../mission/MissionScore';
import type { MissionLog } from '../mission/types';
import type { RoverSnapshot } from '../rover/types';
import type { PalmGeom } from '../vision/handGeometry';
import type { TipState } from '../vision/TipPipeline';
import type { Cargo } from '../world/Cargo';
import type { DropZone } from '../world/DropZone';
import { drawAnalysis, drawAnalysisHud } from './drawAnalysis';
import { drawCargo } from './drawCargo';
import { drawDropZone } from './drawDropZone';
import { drawHud, drawReticle } from './drawHud';
import { drawLaser } from './drawLaser';
import { drawMissionAnalysis } from './drawMissionAnalysis';
import {
  drawMagDockHud,
  drawPalmPad,
  drawQuietDeliver,
} from './drawPalmPad';
import { drawHandOcclusion } from './handOcclusion';
import { drawPlasma } from './drawPlasma';
import { drawRover } from './drawRover';
import { drawGhostRoute, drawTheaterOverlay } from './drawTheater';
import { drawUnderglow } from './drawUnderglow';

export type RenderMode = 'live' | 'theater';

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

  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }

  resize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  drawVideo(video: HTMLVideoElement | null, dim = 0): void {
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
    if (dim > 0) {
      ctx.fillStyle = `rgba(0,0,0,${dim})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawFrame(opts: {
    mode: RenderMode;
    path: PlasmaPath;
    rover: RoverSnapshot;
    tip: TipState;
    now: number;
    fps: number;
    video: HTMLVideoElement | null;
    drawing: boolean;
    cargo: Cargo;
    dropZone: DropZone;
    palmGeom?: PalmGeom | null;
    quietDeliverLabel?: string | null;
    theater?: {
      log: MissionLog;
      camera: DirectorCamera;
      callout: string;
      cold: boolean;
      simLabel: string;
      analysis: MissionAnalysis;
      progress: number;
    };
    bestTimeMs?: number;
  }): void {
    const { ctx } = this;
    const {
      mode,
      path,
      rover,
      tip,
      now,
      fps,
      video,
      drawing,
      cargo,
      dropZone,
    } = opts;

    if (mode === 'theater' && opts.theater) {
      const th = opts.theater;
      this.drawVideo(video, th.cold ? 0.45 : 0.28);
      th.camera.begin(ctx, this.canvas.width, this.canvas.height);
      drawGhostRoute(ctx, th.log);
      const zone = {
        x: th.log.zone.x,
        y: th.log.zone.y,
        w: th.log.zone.w,
        h: th.log.zone.h,
        contains: () => false,
        center: {
          x: th.log.zone.x + th.log.zone.w * 0.5,
          y: th.log.zone.y + th.log.zone.h * 0.5,
        },
        resetDefault: () => undefined,
        placeCenter: () => undefined,
      } as DropZone;
      drawDropZone(ctx, zone, now, true);
      drawCargo(ctx, cargo, now);
      drawPlasma(ctx, path, now);
      drawUnderglow(ctx, rover, now);
      drawRover(ctx, rover, now);
      th.camera.end(ctx);

      drawTheaterOverlay(ctx, {
        width: this.canvas.width,
        height: this.canvas.height,
        callout: th.callout,
        cold: th.cold,
        simLabel: th.simLabel,
        dim: 0,
      });
      if (!th.cold) {
        drawMissionAnalysis(ctx, th.analysis, {
          width: this.canvas.width,
          height: this.canvas.height,
          progress: th.progress,
          now,
        });
      }
      return;
    }

    // Live
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

    const palm = opts.palmGeom ?? null;
    if (palm) {
      drawPalmPad(ctx, palm, {
        phase: rover.magdockPhase,
        confidence: rover.magdockConfidence,
        statusLine: rover.analysis.magdock.statusLine,
        now,
      });
    }

    drawUnderglow(ctx, rover, now);
    if (!drawing && !rover.analysis.holding) {
      drawLaser(ctx, rover, tip, now);
    } else if (tip.hovering && !tip.painting && !drawing) {
      drawLaser(ctx, rover, tip, now);
    }
    drawRover(ctx, rover, now);

    if (
      palm &&
      (rover.magdockPhase === 'boarded' ||
        rover.magdockPhase === 'airborne' ||
        rover.magdockPhase === 'hardDock')
    ) {
      drawHandOcclusion(ctx, palm, rover.y);
    }

    drawReticle(ctx, tip, now);
    drawMagDockHud(ctx, {
      width: this.canvas.width,
      height: this.canvas.height,
      clean: this.clean,
      phase: rover.magdockPhase,
      confidence: rover.magdockConfidence,
      statusLine: rover.analysis.magdock.statusLine,
    });
    drawAnalysisHud(ctx, rover.analysis, rover.state, {
      width: this.canvas.width,
      height: this.canvas.height,
      clean: this.clean,
      painting: drawing || tip.painting,
      tipMode: tip.mode,
      bestTimeMs: opts.bestTimeMs,
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
      magdockPhase: rover.magdockPhase,
      clean: this.clean,
      fps,
      width: this.canvas.width,
      height: this.canvas.height,
      missionElapsedMs: rover.analysis.missionElapsedMs,
    });

    if (opts.quietDeliverLabel) {
      drawQuietDeliver(ctx, {
        width: this.canvas.width,
        height: this.canvas.height,
        label: opts.quietDeliverLabel,
      });
    }
  }
}
