import { CONFIG } from '../config';
import type { DrivePhase, RoverSnapshot } from '../rover/types';
import type { Cargo } from '../world/Cargo';
import type { DropZone } from '../world/DropZone';
import type {
  MissionEventKind,
  MissionLog,
  TelemetrySample,
} from './types';

/**
 * Records compact simulation telemetry for Instant Replay reconstruction.
 */
export class MissionRecorder {
  private recording = false;
  private startWall = 0;
  private lastSampleAt = 0;
  private lastPhase: DrivePhase = 'idle';
  private log: MissionLog | null = null;
  private soughtCargo = false;

  get isRecording(): boolean {
    return this.recording;
  }

  get activeLog(): MissionLog | null {
    return this.log;
  }

  start(opts: {
    route: { x: number; y: number }[];
    zone: DropZone;
    cargo: Cargo;
    pathLength: number;
    paintDurationMs: number;
    fieldW: number;
    fieldH: number;
    now: number;
  }): void {
    this.recording = true;
    this.startWall = opts.now;
    this.lastSampleAt = 0;
    this.lastPhase = 'idle';
    this.soughtCargo = false;
    this.log = {
      startedAt: opts.now,
      durationMs: 0,
      route: opts.route.map((p) => ({ ...p })),
      zone: {
        x: opts.zone.x,
        y: opts.zone.y,
        w: opts.zone.w,
        h: opts.zone.h,
      },
      cargoStart: { x: opts.cargo.x, y: opts.cargo.y },
      pathLength: opts.pathLength,
      soughtCargo: false,
      paintDurationMs: opts.paintDurationMs,
      samples: [],
      events: [],
      finalized: false,
      fieldW: opts.fieldW,
      fieldH: opts.fieldH,
    };
    this.pushEvent('approachStart', 0);
  }

  sample(
    snap: RoverSnapshot,
    cargo: Cargo,
    now: number,
    glow?: { r: number; g: number; b: number },
  ): void {
    if (!this.recording || !this.log) return;
    const t = now - this.startWall;
    if (t > CONFIG.RECORDER_MAX_MS) {
      this.cancel();
      return;
    }

    if (snap.drivePhase === 'seekCargo') this.soughtCargo = true;

    if (snap.drivePhase !== this.lastPhase) {
      this.onPhaseChange(this.lastPhase, snap.drivePhase, t);
      this.lastPhase = snap.drivePhase;
    }

    if (t - this.lastSampleAt < CONFIG.RECORDER_SAMPLE_MS && this.log.samples.length > 0) {
      return;
    }
    this.lastSampleAt = t;

    const sample: TelemetrySample = {
      t,
      x: snap.x,
      y: snap.y,
      angle: snap.angle,
      speed: snap.speed,
      turret: snap.turretAngle,
      gripperOpen: snap.gripperOpen,
      drivePhase: snap.drivePhase,
      charge: snap.charge,
      cargoX: cargo.x,
      cargoY: cargo.y,
      cargoStatus: cargo.status,
      cargoAttached: snap.cargoAttached,
      bob: snap.bob,
      recoil: snap.recoil,
      antenna: snap.antenna,
      victoryT: snap.victoryT,
      headlights: snap.headlights,
      suspension: snap.suspension,
      wheelSpin: snap.wheelSpin,
      glowR: glow?.r ?? CONFIG.UNDERGLOW_COLOR.r,
      glowG: glow?.g ?? CONFIG.UNDERGLOW_COLOR.g,
      glowB: glow?.b ?? CONFIG.UNDERGLOW_COLOR.b,
    };
    this.log.samples.push(sample);
  }

  mark(kind: MissionEventKind, now: number): void {
    if (!this.recording || !this.log) return;
    this.pushEvent(kind, now - this.startWall);
  }

  finalize(now: number): MissionLog | null {
    if (!this.recording || !this.log) return null;
    const t = now - this.startWall;
    this.pushEvent('delivered', t);
    this.pushEvent('victory', t);
    this.log.durationMs = t;
    this.log.soughtCargo = this.soughtCargo;
    this.log.finalized = true;
    this.recording = false;
    const out = this.log;
    return out;
  }

  cancel(): void {
    if (this.recording && this.log) {
      this.pushEvent('aborted', performance.now() - this.startWall);
    }
    this.recording = false;
    this.log = null;
    this.lastPhase = 'idle';
  }

  private onPhaseChange(
    from: DrivePhase,
    to: DrivePhase,
    t: number,
  ): void {
    if (to === 'follow' && (from === 'approach' || from === 'idle')) {
      this.pushEvent('followStart', t);
    } else if (to === 'seekCargo') {
      this.pushEvent('seekStart', t);
    } else if (to === 'secure') {
      this.pushEvent('secureStart', t);
    } else if (to === 'tow') {
      if (from === 'secure') this.pushEvent('secured', t);
      this.pushEvent('towStart', t);
    } else if (to === 'deliver') {
      this.pushEvent('deliverStart', t);
    }
  }

  private pushEvent(kind: MissionEventKind, t: number): void {
    if (!this.log) return;
    const last = this.log.events[this.log.events.length - 1];
    if (last && last.kind === kind && Math.abs(last.t - t) < 40) return;
    this.log.events.push({ t, kind });
  }
}

export function pathLengthOf(route: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 1; i < route.length; i++) {
    len += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
  }
  return len;
}
