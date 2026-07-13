import { CONFIG } from '../config';
import type { MissionLog, TelemetrySample } from './types';

export type ReplayStage = 'cold' | 'play' | 'hold' | 'done';

/**
 * Playback clock with fixed rate windows (normal / secure slow-mo / deliver slow-mo).
 */
export class MissionReplay {
  private log: MissionLog | null = null;
  private stage: ReplayStage = 'done';
  private wallAccum = 0;
  private simT = 0;
  private holdAccum = 0;
  private lastCallout = '';
  private calloutUntil = 0;

  start(log: MissionLog): void {
    this.log = log;
    this.stage = 'cold';
    this.wallAccum = 0;
    this.simT = 0;
    this.holdAccum = 0;
    this.lastCallout = 'INSTANT REPLAY';
    this.calloutUntil = CONFIG.THEATER_COLD_OPEN_MS + 400;
  }

  get active(): boolean {
    return this.stage !== 'done' && !!this.log;
  }

  get stageName(): ReplayStage {
    return this.stage;
  }

  get simTime(): number {
    return this.simT;
  }

  get callout(): string {
    return this.wallAccum < this.calloutUntil ? this.lastCallout : '';
  }

  get progress(): number {
    if (!this.log || this.log.durationMs <= 0) return 1;
    return Math.min(1, this.simT / this.log.durationMs);
  }

  skipToEnd(): void {
    if (!this.log) return;
    this.simT = this.log.durationMs;
    this.stage = 'hold';
    this.holdAccum = 0;
  }

  update(dtMs: number): ReplayStage {
    if (!this.log || this.stage === 'done') return 'done';

    this.wallAccum += dtMs;

    if (this.stage === 'cold') {
      if (this.wallAccum >= CONFIG.THEATER_COLD_OPEN_MS) {
        this.stage = 'play';
        this.fireCalloutFromSim();
      }
      return this.stage;
    }

    if (this.stage === 'hold') {
      this.holdAccum += dtMs;
      if (this.holdAccum >= CONFIG.THEATER_HOLD_MS) {
        this.stage = 'done';
      }
      return this.stage;
    }

    // play
    const rate = this.rateAt(this.simT);
    this.simT += dtMs * rate;
    this.fireCalloutFromSim();

    if (this.simT >= this.log.durationMs) {
      this.simT = this.log.durationMs;
      this.stage = 'hold';
      this.holdAccum = 0;
      this.lastCallout = 'DELIVERED';
      this.calloutUntil = this.wallAccum + 600;
    }
    return this.stage;
  }

  sampleAt(): TelemetrySample | null {
    if (!this.log || this.log.samples.length === 0) return null;
    return interpolateSample(this.log.samples, this.simT);
  }

  getLog(): MissionLog | null {
    return this.log;
  }

  private rateAt(t: number): number {
    if (!this.log) return CONFIG.THEATER_RATE_NORMAL;
    const secured = this.eventTime('secured');
    const secureStart = this.eventTime('secureStart');
    const deliverStart = this.eventTime('deliverStart');
    const delivered = this.eventTime('delivered');

    if (
      secureStart !== null &&
      t >= secureStart &&
      secured !== null &&
      t <= secured + CONFIG.THEATER_SECURE_SLOMO_AFTER_MS
    ) {
      return CONFIG.THEATER_RATE_SECURE;
    }
    if (
      deliverStart !== null &&
      t >= deliverStart &&
      (delivered === null || t <= delivered + 180)
    ) {
      return CONFIG.THEATER_RATE_DELIVER;
    }
    return CONFIG.THEATER_RATE_NORMAL;
  }

  private eventTime(kind: string): number | null {
    if (!this.log) return null;
    const e = this.log.events.find((x) => x.kind === kind);
    return e ? e.t : null;
  }

  private fireCalloutFromSim(): void {
    if (!this.log) return;
    const labels: Record<string, string> = {
      approachStart: 'APPROACH',
      followStart: 'FOLLOW',
      seekStart: 'SEEK',
      secureStart: 'SECURE',
      secured: 'SECURE',
      towStart: 'TOW',
      deliverStart: 'DELIVER',
      delivered: 'DELIVERED',
    };
    for (const e of this.log.events) {
      if (Math.abs(e.t - this.simT) < 80) {
        const label = labels[e.kind];
        if (label && label !== this.lastCallout) {
          this.lastCallout = label;
          this.calloutUntil = this.wallAccum + 450;
        }
      }
    }
  }
}

function interpolateSample(
  samples: TelemetrySample[],
  t: number,
): TelemetrySample {
  if (t <= samples[0].t) return samples[0];
  const last = samples[samples.length - 1];
  if (t >= last.t) return last;

  let i = 1;
  while (i < samples.length && samples[i].t < t) i++;
  const a = samples[i - 1];
  const b = samples[i];
  const u = (t - a.t) / Math.max(1, b.t - a.t);
  return {
    t,
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    angle: lerpAngle(a.angle, b.angle, u),
    speed: lerp(a.speed, b.speed, u),
    turret: lerpAngle(a.turret, b.turret, u),
    gripperOpen: lerp(a.gripperOpen, b.gripperOpen, u),
    drivePhase: u < 0.5 ? a.drivePhase : b.drivePhase,
    charge: lerp(a.charge, b.charge, u),
    cargoX: lerp(a.cargoX, b.cargoX, u),
    cargoY: lerp(a.cargoY, b.cargoY, u),
    cargoStatus: u < 0.5 ? a.cargoStatus : b.cargoStatus,
    cargoAttached: u < 0.5 ? a.cargoAttached : b.cargoAttached,
    bob: lerp(a.bob, b.bob, u),
    recoil: lerp(a.recoil, b.recoil, u),
    antenna: lerp(a.antenna, b.antenna, u),
    victoryT: lerp(a.victoryT, b.victoryT, u),
    headlights: u < 0.5 ? a.headlights : b.headlights,
    suspension: lerp(a.suspension, b.suspension, u),
    wheelSpin: lerp(a.wheelSpin, b.wheelSpin, u),
    glowR: lerp(a.glowR, b.glowR, u),
    glowG: lerp(a.glowG, b.glowG, u),
    glowB: lerp(a.glowB, b.glowB, u),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
