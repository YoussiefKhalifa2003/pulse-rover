import { CONFIG } from '../config';
import type { PlasmaPath } from '../path/PlasmaPath';
import { angleDiff, clamp, dist, normalizeAngle } from '../utils/math';
import { RoverStateMachine } from './RoverStateMachine';
import type { AbsorbTrail, RoverSnapshot, RoverState } from './types';

interface BoostStreak {
  x: number;
  y: number;
  angle: number;
  bornAt: number;
}

interface RoutePoint {
  x: number;
  y: number;
}

/**
 * Deterministic path follower:
 * - Freezes a route copy at arm time
 * - Spawns on the FIRST node
 * - Advances one node at a time at constant cruise speed
 * - Absorbing ink does not change the route / skip nodes
 */
export class Rover {
  x = 0;
  y = 0;
  angle = 0;
  speed = 0;
  charge = 0;
  turretAngle = 0;
  suspension = 1;
  headlights = true;
  wheelSpin = 0;

  private fsm = new RoverStateMachine();
  private state: RoverState = 'Recon';
  private lockTarget: { x: number; y: number } | null = null;
  private trails: AbsorbTrail[] = [];
  private boostStreaks: BoostStreak[] = [];
  private overdriveUntil = 0;
  private lastPaintAt = 0;
  private lastActivityAt = 0;

  private followIndex = 0;
  private activeStrokeId: number | null = null;
  private route: RoutePoint[] = [];
  /** approach = drive to route[0]; follow = sequential nodes */
  private drivePhase: 'idle' | 'approach' | 'follow' = 'idle';
  private desiredAngle = 0;
  private desiredSpeed = 0;
  private holding = false;

  private reconMode: 'burst' | 'pause' = 'pause';
  private reconUntil = 0;
  private reconHeading = 0;
  private turretSweepDir = 1;
  private turretSweep = 0;

  private width = 1280;
  private height = 720;
  private initialized = false;

  init(width: number, height: number, now: number): void {
    this.width = width;
    this.height = height;
    this.x = width * 0.5;
    this.y = height * 0.55;
    this.angle = -Math.PI / 2;
    this.desiredAngle = this.angle;
    this.reconHeading = this.angle;
    this.speed = 0;
    this.desiredSpeed = 0;
    this.followIndex = 0;
    this.activeStrokeId = null;
    this.route = [];
    this.drivePhase = 'idle';
    this.holding = false;
    this.lastActivityAt = now;
    this.lastPaintAt = now;
    this.initialized = true;
    this.fsm.reset();
    this.state = 'Recon';
  }

  resize(width: number, height: number): void {
    if (!this.initialized) return;
    const sx = width / Math.max(1, this.width);
    const sy = height / Math.max(1, this.height);
    this.x *= sx;
    this.y *= sy;
    this.width = width;
    this.height = height;
    for (const p of this.route) {
      p.x *= sx;
      p.y *= sy;
    }
    this.clampToBounds(false);
  }

  notifyPaint(now: number): void {
    this.lastPaintAt = now;
    this.lastActivityAt = now;
  }

  setHolding(holding: boolean): void {
    this.holding = holding;
    if (holding) {
      this.desiredSpeed = 0;
      this.speed = 0;
      this.state = 'Waiting';
      this.route = [];
      this.followIndex = 0;
      this.drivePhase = 'idle';
    }
  }

  get isHolding(): boolean {
    return this.holding;
  }

  /**
   * Commit path: copy stroke, pin it against decay, then DRIVE to the
   * first node (no teleport) before following the rest.
   */
  armPath(path: PlasmaPath): void {
    const strokeId = path.latestStrokeId();
    if (strokeId === null) {
      this.holding = false;
      this.route = [];
      this.drivePhase = 'idle';
      return;
    }

    this.route = path.copyStroke(strokeId);
    this.activeStrokeId = strokeId;
    this.followIndex = 0;
    this.holding = false;
    this.charge = Math.min(this.charge, 0.85);
    this.overdriveUntil = 0;
    this.lastActivityAt = performance.now();

    if (this.route.length === 0) {
      this.drivePhase = 'idle';
      return;
    }

    // Keep the tether alive until we finish
    path.pinStroke(strokeId);

    const start = this.route[0];
    const distToStart = dist(this.x, this.y, start.x, start.y);

    if (distToStart <= CONFIG.WAYPOINT_REACH_PX * 1.25) {
      // Already near start — begin follow immediately
      this.beginFollowFromStart();
    } else {
      // Smart approach: navigate to the drawn start, then follow
      this.drivePhase = 'approach';
      this.state = 'LockedOn';
      this.speed = Math.min(this.speed, CONFIG.ROVER_APPROACH_SPEED * 0.5);
      this.desiredSpeed = CONFIG.ROVER_APPROACH_SPEED;
      this.desiredAngle = Math.atan2(start.y - this.y, start.x - this.x);
      this.lockTarget = { x: start.x, y: start.y };
      this.turretAngle = this.desiredAngle;
    }
  }

  private beginFollowFromStart(): void {
    this.drivePhase = 'follow';
    this.followIndex = 0;
    this.state = 'LockedOn';
    this.desiredSpeed = CONFIG.ROVER_CRUISE_SPEED;
    if (this.route.length >= 2) {
      this.desiredAngle = Math.atan2(
        this.route[1].y - this.route[0].y,
        this.route[1].x - this.route[0].x,
      );
      this.lockTarget = this.route[1];
    } else {
      this.lockTarget = this.route[0] ?? null;
    }
  }

  /** Clear route and unpin the path when done or cancelled. */
  private clearRoute(path?: PlasmaPath): void {
    if (path && this.activeStrokeId !== null) {
      path.unpinStroke();
    }
    this.route = [];
    this.drivePhase = 'idle';
    this.followIndex = 0;
  }

  get snapshot(): RoverSnapshot {
    return {
      x: this.x,
      y: this.y,
      angle: this.angle,
      speed: this.speed,
      charge: this.charge,
      state: this.holding ? 'Waiting' : this.state,
      turretAngle: this.turretAngle,
      suspension: this.suspension,
      headlights: this.headlights,
      wheelSpin: this.wheelSpin,
      lockTarget: this.lockTarget,
      trails: this.trails,
      boostStreaks: this.boostStreaks.map((s) => ({
        x: s.x,
        y: s.y,
        angle: s.angle,
        age: 0,
      })),
      overdriveRemaining: Math.max(0, this.overdriveUntil - performance.now()),
      analysis: {
        holding: this.holding,
        followIndex: this.followIndex,
        activeStrokeId: this.activeStrokeId,
        nodeIndex: 0,
        nodeTotal: 0,
        lookahead: this.lockTarget,
        lookaheadDist: 0,
        roverX: this.x,
        roverY: this.y,
        turretAngle: this.turretAngle,
      },
    };
  }

  buildSnapshot(path: PlasmaPath): RoverSnapshot {
    const snap = this.snapshot;
    if (this.holding && path.hasPoints()) {
      const draftId = path.latestStrokeId();
      snap.analysis.activeStrokeId = draftId;
      const pts = draftId !== null ? path.copyStroke(draftId) : [];
      snap.analysis.nodeTotal = pts.length;
      snap.analysis.nodeIndex = pts.length;
      snap.analysis.followIndex = Math.max(0, pts.length - 1);
    } else {
      snap.analysis.nodeTotal = this.route.length;
      if (this.drivePhase === 'approach') {
        snap.analysis.nodeIndex = 0;
        snap.analysis.followIndex =
          this.activeStrokeId !== null
            ? path.firstIndexOfStroke(this.activeStrokeId)
            : -1;
      } else {
        snap.analysis.nodeIndex =
          this.route.length === 0
            ? 0
            : Math.min(this.route.length, this.followIndex + 1);
        snap.analysis.followIndex = this.mapFollowToPathIndex(path);
      }
    }
    snap.analysis.lookahead = this.lockTarget;
    snap.analysis.lookaheadDist = this.lockTarget
      ? Math.hypot(this.lockTarget.x - this.x, this.lockTarget.y - this.y)
      : 0;
    return snap;
  }

  /** Map route cursor onto live path array for overlay circles. */
  private mapFollowToPathIndex(path: PlasmaPath): number {
    if (this.activeStrokeId === null || this.route.length === 0) return -1;
    const start = path.firstIndexOfStroke(this.activeStrokeId);
    if (start < 0) return -1;
    return start + clamp(this.followIndex, 0, this.route.length - 1);
  }

  update(dt: number, now: number, path: PlasmaPath): void {
    if (!this.initialized) return;

    this.trails = this.trails.filter((t) => now - t.bornAt < 450);
    this.boostStreaks = this.boostStreaks.filter((s) => now - s.bornAt < 280);

    if (this.holding) {
      this.updateWaiting(dt, path);
      return;
    }

    if (this.route.length > 0) {
      this.updateRouteDrive(dt, now, path);
      return;
    }

    // No active route
    this.updateIdle(dt, now, path);
  }

  private updateWaiting(dt: number, path: PlasmaPath): void {
    this.state = 'Waiting';
    this.desiredSpeed = 0;
    this.speed = 0;
    this.headlights = true;
    this.suspension = lerp(this.suspension, 0.92, dt * 4);

    const tip = path.get(path.length - 1);
    if (tip) {
      const want = Math.atan2(tip.y - this.y, tip.x - this.x);
      this.turretAngle = lerpAngle(this.turretAngle, want, 1 - Math.exp(-3 * dt));
      this.lockTarget = { x: tip.x, y: tip.y };
      this.activeStrokeId = tip.strokeId;
    } else {
      this.turretSweep += dt * 1.2 * this.turretSweepDir;
      if (Math.abs(this.turretSweep) > Math.PI / 2) this.turretSweepDir *= -1;
      this.turretAngle = this.angle + this.turretSweep;
      this.lockTarget = null;
    }
    this.clampToBounds(false);
  }

  private updateRouteDrive(dt: number, now: number, path: PlasmaPath): void {
    this.headlights = true;
    this.suspension = lerp(this.suspension, 1, dt * 4);
    this.lastActivityAt = now;

    // ——— PHASE 1: drive to the start of the drawn line ———
    if (this.drivePhase === 'approach') {
      this.state = 'LockedOn';
      const start = this.route[0];
      this.lockTarget = start;
      this.desiredAngle = Math.atan2(start.y - this.y, start.x - this.x);
      this.desiredSpeed = CONFIG.ROVER_APPROACH_SPEED;

      // Do NOT absorb during approach — keep the full line intact
      if (dist(this.x, this.y, start.x, start.y) <= CONFIG.WAYPOINT_REACH_PX) {
        this.beginFollowFromStart();
      }

      this.applyMotion(dt);
      return;
    }

    // ——— PHASE 2: sequential follow ———
    this.state = 'LockedOn';

    // Finished route
    if (this.followIndex >= this.route.length - 1) {
      const last = this.route[this.route.length - 1];
      if (last && dist(this.x, this.y, last.x, last.y) < CONFIG.WAYPOINT_REACH_PX) {
        this.desiredSpeed = 0;
        this.speed = Math.max(0, this.speed - CONFIG.ROVER_ACCEL * dt);
        this.lockTarget = last;
        path.absorbNearOnStroke(
          this.x,
          this.y,
          CONFIG.ABSORB_RADIUS_PX,
          this.activeStrokeId,
        );
        if (this.speed < 5) {
          this.clearRoute(path);
          this.state = 'Recon';
        }
        this.applyMotion(dt);
        return;
      }
    }

    // Advance ONLY when we reach the current node (no skipping)
    while (
      this.followIndex < this.route.length - 1 &&
      dist(
        this.x,
        this.y,
        this.route[this.followIndex].x,
        this.route[this.followIndex].y,
      ) <= CONFIG.WAYPOINT_REACH_PX
    ) {
      this.followIndex++;
    }

    const look = Math.min(
      this.followIndex + CONFIG.LOOKAHEAD_NODES,
      this.route.length - 1,
    );
    const target = this.route[look];
    this.lockTarget = target;

    this.desiredAngle = Math.atan2(target.y - this.y, target.x - this.x);
    this.desiredSpeed = CONFIG.ROVER_CRUISE_SPEED;

    const turn = Math.abs(angleDiff(this.angle, this.desiredAngle));
    if (turn > 1.0) {
      this.desiredSpeed *= clamp(1.15 - turn * 0.35, 0.55, 1);
    }

    // Absorb only nodes we've already passed (behind / at rover)
    const absorbed = path.absorbNearOnStroke(
      this.x,
      this.y,
      CONFIG.ABSORB_RADIUS_PX,
      this.activeStrokeId,
    );
    if (absorbed > 0) {
      this.charge = clamp(
        this.charge + absorbed * CONFIG.CHARGE_PER_ABSORB,
        0,
        1,
      );
      this.trails.push({
        x: this.x - Math.cos(this.angle) * 18,
        y: this.y - Math.sin(this.angle) * 18,
        bornAt: now,
        angle: this.angle,
      });
    }

    if (
      CONFIG.OVERDRIVE_ENABLED &&
      this.charge >= CONFIG.OVERDRIVE_CHARGE_THRESHOLD &&
      now >= this.overdriveUntil
    ) {
      this.overdriveUntil = now + CONFIG.OVERDRIVE_MS;
      this.charge = 0;
    }
    if (CONFIG.OVERDRIVE_ENABLED && now < this.overdriveUntil) {
      this.state = 'Overdrive';
      this.desiredSpeed = CONFIG.ROVER_CRUISE_SPEED * CONFIG.OVERDRIVE_SPEED_MULT;
      this.boostStreaks.push({
        x: this.x,
        y: this.y,
        angle: this.angle,
        bornAt: now,
      });
    }

    this.applyMotion(dt);
  }

  private updateIdle(dt: number, now: number, path: PlasmaPath): void {
    this.lockTarget = null;
    this.state = this.fsm.update({
      now,
      hasPath: false,
      hasLock: false,
      charge: this.charge,
      lastPaintAt: this.lastPaintAt,
      lastActivityAt: this.lastActivityAt,
      overdriveUntil: this.overdriveUntil,
    });

    if (this.state === 'Standby') {
      this.headlights = false;
      this.suspension = lerp(this.suspension, 0.72, dt * 3);
      this.desiredSpeed = 0;
      this.desiredAngle = this.angle;
      this.turretAngle = lerpAngle(this.turretAngle, this.angle, dt * 2);
    } else {
      this.headlights = true;
      this.suspension = lerp(this.suspension, 1, dt * 3);
      this.turretSweep += dt * 1.0 * this.turretSweepDir;
      if (Math.abs(this.turretSweep) > Math.PI / 2) this.turretSweepDir *= -1;
      this.turretAngle = this.angle + this.turretSweep;

      if (now >= this.reconUntil) {
        if (this.reconMode === 'pause') {
          this.reconMode = 'burst';
          this.reconUntil = now + CONFIG.RECON_BURST_MS;
          const cx = this.width * 0.5;
          const cy = this.height * 0.5;
          this.reconHeading =
            Math.atan2(cy - this.y, cx - this.x) + (Math.random() - 0.5) * 0.4;
        } else {
          this.reconMode = 'pause';
          this.reconUntil = now + CONFIG.RECON_PAUSE_MS;
        }
      }

      if (this.reconMode === 'burst') {
        this.desiredAngle = this.reconHeading;
        this.desiredSpeed = CONFIG.RECON_BURST_SPEED;
      } else {
        this.desiredSpeed = 0;
        const cx = this.width * 0.5;
        const cy = this.height * 0.55;
        this.x = lerp(this.x, cx, dt * CONFIG.RECON_HOME_PULL * 0.25);
        this.y = lerp(this.y, cy, dt * CONFIG.RECON_HOME_PULL * 0.25);
      }
    }

    // If orphan path remains, arm it cleanly from the start
    if (path.hasPoints() && this.route.length === 0) {
      this.armPath(path);
      return;
    }

    this.applyMotion(dt);
  }

  private applyMotion(dt: number): void {
    this.angle = smoothAngle(
      this.angle,
      this.desiredAngle,
      dt,
      CONFIG.ROVER_TURN_SMOOTH,
    );

    const speedAlpha = 1 - Math.exp(-CONFIG.ROVER_SPEED_SMOOTH * dt);
    this.speed += (this.desiredSpeed - this.speed) * speedAlpha;
    const maxStep = CONFIG.ROVER_ACCEL * dt;
    if (Math.abs(this.desiredSpeed - this.speed) > maxStep) {
      this.speed += Math.sign(this.desiredSpeed - this.speed) * maxStep;
    }

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    this.wheelSpin += this.speed * dt * 0.08;

    if (this.lockTarget) {
      const want = Math.atan2(
        this.lockTarget.y - this.y,
        this.lockTarget.x - this.x,
      );
      this.turretAngle = lerpAngle(this.turretAngle, want, 1 - Math.exp(-5 * dt));
    }

    this.clampToBounds(true);
  }

  private clampToBounds(bounce: boolean): void {
    const m = CONFIG.EDGE_MARGIN_PX;
    let hit = false;

    if (this.x < m) {
      this.x = m;
      hit = true;
      if (bounce) this.desiredAngle = this.angle = reflectAngle(this.angle, 0);
    } else if (this.x > this.width - m) {
      this.x = this.width - m;
      hit = true;
      if (bounce) this.desiredAngle = this.angle = reflectAngle(this.angle, Math.PI);
    }

    if (this.y < m) {
      this.y = m;
      hit = true;
      if (bounce) this.desiredAngle = this.angle = reflectAngle(this.angle, Math.PI / 2);
    } else if (this.y > this.height - m) {
      this.y = this.height - m;
      hit = true;
      if (bounce)
        this.desiredAngle = this.angle = reflectAngle(this.angle, -Math.PI / 2);
    }

    if (hit) {
      this.speed *= 0.35;
      this.desiredSpeed *= 0.35;
      this.reconHeading = this.angle;
    }
  }
}

function reflectAngle(heading: number, wallNormal: number): number {
  const nx = Math.cos(wallNormal);
  const ny = Math.sin(wallNormal);
  let vx = Math.cos(heading);
  let vy = Math.sin(heading);
  const dot = vx * nx + vy * ny;
  vx -= 2 * dot * nx;
  vy -= 2 * dot * ny;
  return Math.atan2(vy, vx);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  return normalizeAngle(a + angleDiff(a, b) * t);
}

function smoothAngle(
  current: number,
  target: number,
  dt: number,
  rate: number,
): number {
  const diff = angleDiff(current, target);
  const maxStep = CONFIG.ROVER_TURN_RATE * dt;
  const step = clamp(diff * (1 - Math.exp(-rate * dt)), -maxStep, maxStep);
  return normalizeAngle(current + step);
}
