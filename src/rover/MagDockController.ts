import { CONFIG } from '../config';
import type { PalmGeom } from '../vision/handGeometry';
import type { MagDockPhase } from './types';

export interface MagDockInput {
  padActive: boolean;
  confidence: number;
  geom: PalmGeom | null;
  allowBoard: boolean;
  cargoX: number | null;
  cargoY: number | null;
  fieldH: number;
}

export interface MagDockEvents {
  padAcquired: boolean;
  maglock: boolean;
  disembark: boolean;
  evaluating: boolean;
}

/**
 * MagDock boarding protocol sub-FSM — pauses mission motion while active.
 */
export class MagDockController {
  phase: MagDockPhase = 'free';
  confidence = 0;
  statusLine = '';
  private phaseSince = 0;
  private stableSince = 0;
  private baselineScale = 0;
  private lastPalm: PalmGeom | null = null;
  private deskX = 0;
  private deskY = 0;
  private localOx = 0;
  private localOy = 0;
  private yawLag = 0;
  private gazeT = 0;
  private gazeMode = 0;
  private lostSince = 0;
  private pausedDrive: string | null = null;
  private events: MagDockEvents = {
    padAcquired: false,
    maglock: false,
    disembark: false,
    evaluating: false,
  };

  get isActive(): boolean {
    return this.phase !== 'free';
  }

  get isBoarded(): boolean {
    return (
      this.phase === 'boarded' ||
      this.phase === 'airborne' ||
      this.phase === 'hardDock'
    );
  }

  consumeEvents(): MagDockEvents {
    const e = { ...this.events };
    this.events = {
      padAcquired: false,
      maglock: false,
      disembark: false,
      evaluating: false,
    };
    return e;
  }

  reset(): void {
    this.phase = 'free';
    this.confidence = 0;
    this.statusLine = '';
    this.lastPalm = null;
    this.pausedDrive = null;
  }

  /**
   * Returns true if MagDock owns motion this frame (caller should skip normal drive).
   */
  update(
    dt: number,
    now: number,
    rover: {
      x: number;
      y: number;
      angle: number;
      speed: number;
      desiredSpeed: number;
      desiredAngle: number;
      turretAngle: number;
      suspension: number;
      wheelSpin: number;
      drivePhase: string;
    },
    input: MagDockInput,
  ): boolean {
    this.confidence = input.confidence;

    if (!input.allowBoard && !this.isBoarded && this.phase !== 'disembarking') {
      if (this.phase !== 'free') this.forceFree();
      return false;
    }

    // Pad offer → evaluate
    if (
      input.padActive &&
      input.geom &&
      this.phase === 'free' &&
      input.allowBoard
    ) {
      this.phase = 'evaluating';
      this.phaseSince = now;
      this.events.evaluating = true;
      this.events.padAcquired = true;
      this.statusLine = 'Pad acquired';
      this.baselineScale = input.geom.scale;
      this.pausedDrive = rover.drivePhase !== 'idle' ? rover.drivePhase : null;
    }

    if (!input.padActive && !this.isBoarded && this.phase !== 'disembarking') {
      if (
        this.phase === 'evaluating' ||
        this.phase === 'hesitating' ||
        this.phase === 'seekingPad' ||
        this.phase === 'softDock'
      ) {
        this.forceFree();
      }
    }

    if (input.geom) this.lastPalm = input.geom;

    switch (this.phase) {
      case 'evaluating':
        this.statusLine = `Landing Pad  ${bar(this.confidence)}  ${Math.round(this.confidence * 100)}%`;
        rover.desiredSpeed = 0;
        rover.speed *= 0.9;
        if (input.geom) {
          rover.desiredAngle = Math.atan2(
            input.geom.center.y - rover.y,
            input.geom.center.x - rover.x,
          );
          // Hesitation scan
          rover.turretAngle += Math.sin(now * 0.008) * 0.04;
        }
        if (
          now - this.phaseSince >= CONFIG.MAGDOCK_EVAL_MS &&
          this.confidence >= CONFIG.MAGDOCK_SEEK_CONF
        ) {
          this.phase = 'hesitating';
          this.phaseSince = now;
          this.statusLine = 'Evaluating approach…';
        }
        return true;

      case 'hesitating':
        this.statusLine = 'Approaching';
        rover.desiredSpeed = 18;
        if (input.geom) {
          const dx = input.geom.center.x - rover.x;
          const dy = input.geom.center.y - rover.y;
          rover.desiredAngle = Math.atan2(dy, dx);
          rover.turretAngle = rover.desiredAngle + Math.sin(now * 0.01) * 0.5;
        }
        if (now - this.phaseSince >= CONFIG.MAGDOCK_HESITATE_MS) {
          if (this.confidence >= CONFIG.MAGDOCK_SEEK_CONF) {
            this.phase = 'seekingPad';
            this.phaseSince = now;
          } else {
            this.phase = 'evaluating';
            this.phaseSince = now;
          }
        }
        return true;

      case 'seekingPad':
        this.statusLine = 'Approaching';
        if (!input.geom) {
          this.beginLost(now);
          return true;
        }
        this.driveToward(rover, input.geom.center.x, input.geom.center.y, 90);
        {
          const d = dist(rover.x, rover.y, input.geom.center.x, input.geom.center.y);
          if (d <= CONFIG.BOARD_SOFT_RADIUS) {
            this.phase = 'softDock';
            this.phaseSince = now;
            this.stableSince = now;
            this.statusLine = 'Dock confirmed';
          }
        }
        return true;

      case 'softDock':
        this.statusLine = 'Dock confirmed';
        if (!input.geom) {
          this.beginLost(now);
          return true;
        }
        this.driveToward(rover, input.geom.center.x, input.geom.center.y, 40);
        rover.desiredAngle = lerpAngle(
          rover.desiredAngle,
          input.geom.angle,
          1 - Math.exp(-4 * dt),
        );
        {
          const d = dist(rover.x, rover.y, input.geom.center.x, input.geom.center.y);
          const stable =
            d <= CONFIG.BOARD_HARD_RADIUS &&
            this.confidence >= CONFIG.MAGDOCK_LOCK_CONF;
          if (stable) {
            if (now - this.stableSince >= CONFIG.BOARD_STABLE_MS) {
              this.engageMaglock(rover, input.geom, now);
            }
          } else {
            this.stableSince = now;
          }
        }
        return true;

      case 'hardDock':
      case 'boarded':
      case 'airborne':
        return this.updateBoarded(dt, now, rover, input);

      case 'disembarking':
        this.statusLine = 'Disembarking';
        {
          const t = Math.min(1, (now - this.phaseSince) / CONFIG.DISEMBARK_HOLD_MS);
          rover.x = lerp(rover.x, this.deskX, 0.15 + t * 0.2);
          rover.y = lerp(rover.y, this.deskY, 0.15 + t * 0.2);
          rover.desiredSpeed = 0;
          rover.speed *= 0.85;
          if (t >= 1) {
            this.events.disembark = true;
            this.phase = 'free';
            this.statusLine = '';
          }
        }
        return true;

      default:
        return false;
    }
  }

  private updateBoarded(
    dt: number,
    now: number,
    rover: {
      x: number;
      y: number;
      angle: number;
      speed: number;
      desiredSpeed: number;
      desiredAngle: number;
      turretAngle: number;
      suspension: number;
      wheelSpin: number;
    },
    input: MagDockInput,
  ): boolean {
    const palm = input.geom ?? this.lastPalm;
    if (!palm) {
      this.beginLost(now);
      if (now - this.lostSince > CONFIG.HAND_LOST_GRACE_MS) {
        this.startDisembark(rover, now);
      }
      return true;
    }
    this.lostSince = 0;

    // Parent with lagged yaw
    const targetYaw = palm.angle;
    this.yawLag = lerpAngle(
      this.yawLag,
      targetYaw,
      1 - Math.exp(-CONFIG.BOARD_YAW_LAG * dt),
    );
    const ang = this.yawLag;
    const prevX = rover.x;
    const prevY = rover.y;
    rover.x =
      palm.center.x +
      Math.cos(ang) * this.localOx -
      Math.sin(ang) * this.localOy;
    rover.y =
      palm.center.y +
      Math.sin(ang) * this.localOx +
      Math.cos(ang) * this.localOy;
    rover.angle = ang;
    rover.desiredAngle = ang;
    rover.desiredSpeed = 0;
    rover.speed = 0;
    const moved = Math.hypot(rover.x - prevX, rover.y - prevY);
    rover.wheelSpin += moved * 0.05;

    // Tilt → suspension
    const tiltAbs = Math.min(1, Math.abs(palm.tilt) * 12);
    rover.suspension = lerp(rover.suspension, 1 - tiltAbs * 0.18, dt * 6);

    // Lift detection
    const lift = palm.scale - this.baselineScale;
    if (lift > CONFIG.PALM_LIFT_SCALE_DELTA) {
      this.phase = 'airborne';
      this.statusLine = 'Maglock · airborne';
    } else if (this.phase === 'airborne' && lift < CONFIG.PALM_LIFT_SCALE_DELTA * 0.4) {
      this.phase = 'boarded';
      this.statusLine = 'Maglock engaged';
    } else if (this.phase === 'hardDock') {
      this.phase = 'boarded';
    }

    // Disembark: palm curl / pad lost handled above; lowered + release
    if (!input.padActive && this.phase !== 'airborne') {
      this.startDisembark(rover, now);
      return true;
    }
    if (
      this.phase === 'boarded' &&
      lift < -CONFIG.PALM_LIFT_SCALE_DELTA * 0.5 &&
      !input.padActive
    ) {
      this.startDisembark(rover, now);
      return true;
    }

    // Curiosity gaze
    this.gazeT += dt * 1000;
    if (this.gazeT > CONFIG.BOARD_GAZE_MS) {
      this.gazeT = 0;
      this.gazeMode = (this.gazeMode + 1) % 4;
    }
    let gx = rover.x;
    let gy = rover.y - 120; // user / camera (up)
    if (this.gazeMode === 1 && input.cargoX !== null && input.cargoY !== null) {
      gx = input.cargoX;
      gy = input.cargoY;
    } else if (this.gazeMode === 2) {
      gx = rover.x;
      gy = rover.y - 120;
    } else if (this.gazeMode === 3 && palm) {
      gx = palm.center.x + Math.cos(ang + 1.2) * 40;
      gy = palm.center.y + Math.sin(ang + 1.2) * 40;
    }
    const want = Math.atan2(gy - rover.y, gx - rover.x);
    rover.turretAngle = lerpAngle(
      rover.turretAngle,
      want,
      1 - Math.exp(-3 * dt),
    );

    this.deskX = rover.x;
    this.deskY = Math.min(input.fieldH - 80, rover.y + 40);
    return true;
  }

  private engageMaglock(
    rover: { x: number; y: number; angle: number },
    palm: PalmGeom,
    now: number,
  ): void {
    this.phase = 'hardDock';
    this.phaseSince = now;
    this.events.maglock = true;
    this.statusLine = 'Maglock engaged';
    this.yawLag = palm.angle;
    // Local offset so rover sits on palm center
    this.localOx = 0;
    this.localOy = 0;
    rover.x = palm.center.x;
    rover.y = palm.center.y;
    rover.angle = palm.angle;
    this.baselineScale = palm.scale;
    this.lastPalm = palm;
  }

  private startDisembark(
    rover: { x: number; y: number },
    now: number,
  ): void {
    this.phase = 'disembarking';
    this.phaseSince = now;
    this.deskX = rover.x;
    this.deskY = rover.y + 30;
    this.statusLine = 'Disembarking';
  }

  private beginLost(now: number): void {
    if (!this.lostSince) this.lostSince = now;
  }

  private forceFree(): void {
    this.phase = 'free';
    this.statusLine = '';
    this.pausedDrive = null;
  }

  private driveToward(
    rover: {
      x: number;
      y: number;
      desiredAngle: number;
      desiredSpeed: number;
      turretAngle: number;
    },
    tx: number,
    ty: number,
    speed: number,
  ): void {
    const dx = tx - rover.x;
    const dy = ty - rover.y;
    rover.desiredAngle = Math.atan2(dy, dx);
    rover.desiredSpeed = speed;
    rover.turretAngle = rover.desiredAngle;
  }

  clearPausedDrive(): void {
    this.pausedDrive = null;
  }

  getPausedDrive(): string | null {
    return this.pausedDrive;
  }
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
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

function bar(c: number): string {
  const n = Math.round(Math.max(0, Math.min(1, c)) * 10);
  return '█'.repeat(n) + '░'.repeat(10 - n);
}
