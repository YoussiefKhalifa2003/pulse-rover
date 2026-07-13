import { CONFIG } from '../config';
import type { DrivePhase } from '../rover/types';
import type { MissionLog, TelemetrySample } from './types';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  shake: number;
}

/**
 * Scripted virtual 2D camera for Instant Replay — makes telemetry feel edited.
 */
export class DirectorCamera {
  x = 0;
  y = 0;
  zoom = 1;
  shake = 0;
  private targetX = 0;
  private targetY = 0;
  private targetZoom = 1;
  private fieldW = 1280;
  private fieldH = 720;
  private lastShakeEvent = '';

  reset(log: MissionLog): void {
    this.fieldW = log.fieldW;
    this.fieldH = log.fieldH;
    this.x = log.fieldW * 0.5;
    this.y = log.fieldH * 0.5;
    this.zoom = 0.92;
    this.targetX = this.x;
    this.targetY = this.y;
    this.targetZoom = 0.92;
    this.shake = 0;
    this.lastShakeEvent = '';
  }

  update(
    dt: number,
    sample: TelemetrySample | null,
    log: MissionLog,
    cold: boolean,
  ): void {
    if (cold || !sample) {
      this.targetX = this.fieldW * 0.5;
      this.targetY = this.fieldH * 0.5;
      this.targetZoom = 0.9;
    } else {
      this.setShot(sample, log);
      this.maybeShake(sample, log);
    }

    const a = 1 - Math.exp(-CONFIG.CAM_EASE * dt);
    this.x += (this.targetX - this.x) * a;
    this.y += (this.targetY - this.y) * a;
    this.zoom += (this.targetZoom - this.zoom) * a;
    this.shake = Math.max(0, this.shake - CONFIG.CAM_SHAKE_DECAY * dt * 10);
  }

  /** Apply world transform. Call restore after world draw. */
  begin(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const sx =
      this.shake > 0
        ? (Math.sin(performance.now() * 0.08) * this.shake)
        : 0;
    const sy =
      this.shake > 0
        ? (Math.cos(performance.now() * 0.11) * this.shake)
        : 0;

    ctx.save();
    ctx.translate(width * 0.5 + sx, height * 0.5 + sy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }

  end(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  get state(): CameraState {
    return { x: this.x, y: this.y, zoom: this.zoom, shake: this.shake };
  }

  private setShot(sample: TelemetrySample, log: MissionLog): void {
    const phase = sample.drivePhase;
    const zoneCx = log.zone.x + log.zone.w * 0.5;
    const zoneCy = log.zone.y + log.zone.h * 0.5;

    switch (phase) {
      case 'approach':
        this.targetX = sample.x;
        this.targetY = sample.y;
        this.targetZoom = 1.18;
        break;
      case 'follow':
      case 'tow':
        this.targetX = sample.x + Math.cos(sample.angle) * 40;
        this.targetY = sample.y + Math.sin(sample.angle) * 40;
        this.targetZoom = phase === 'tow' ? 1.05 : 1.22;
        if (phase === 'tow') {
          this.targetX = (sample.x + zoneCx) * 0.5;
          this.targetY = (sample.y + zoneCy) * 0.5;
        }
        break;
      case 'seekCargo':
        this.targetX = (sample.x + sample.cargoX) * 0.5;
        this.targetY = (sample.y + sample.cargoY) * 0.5;
        this.targetZoom = 1.25;
        break;
      case 'secure':
        this.targetX = (sample.x + sample.cargoX) * 0.5;
        this.targetY = (sample.y + sample.cargoY) * 0.5;
        this.targetZoom = 1.55;
        break;
      case 'deliver':
        this.targetX = zoneCx;
        this.targetY = zoneCy;
        this.targetZoom = 1.35;
        break;
      default:
        this.targetX = sample.x;
        this.targetY = sample.y;
        this.targetZoom = 1.0;
    }
  }

  private maybeShake(sample: TelemetrySample, log: MissionLog): void {
    for (const e of log.events) {
      if (Math.abs(e.t - sample.t) > 50) continue;
      const key = `${e.kind}:${e.t | 0}`;
      if (key === this.lastShakeEvent) continue;
      if (e.kind === 'secured') {
        this.shake = CONFIG.CAM_SHAKE_SECURE;
        this.lastShakeEvent = key;
      } else if (e.kind === 'delivered' || e.kind === 'deliverStart') {
        this.shake = CONFIG.CAM_SHAKE_DELIVER;
        this.lastShakeEvent = key;
      }
    }
  }
}

export function phaseFocusLabel(phase: DrivePhase): string {
  return phase.toUpperCase();
}
