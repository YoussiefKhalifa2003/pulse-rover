import { CONFIG } from '../config';
import type { PlasmaPath } from '../path/PlasmaPath';
import { angleDiff, clamp, dist, normalizeAngle } from '../utils/math';
import type { Cargo } from '../world/Cargo';
import type { DropZone } from '../world/DropZone';
import {
  buildDeliveryMission,
  emptyMission,
  type MissionPlan,
} from '../world/Mission';
import { RoverStateMachine } from './RoverStateMachine';
import { MagDockController } from './MagDockController';
import type { MagDockInput } from './MagDockController';
import type {
  AbsorbTrail,
  DrivePhase,
  MagDockPhase,
  PersonalityMode,
  RoverSnapshot,
  RoverState,
} from './types';

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
 * Deterministic path follower + delivery mission phases.
 * Route copy is frozen at arm time; cargo parents to bumper while secured.
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
  private drivePhase: DrivePhase = 'idle';
  private desiredAngle = 0;
  private desiredSpeed = 0;
  private holding = false;

  private mission: MissionPlan = emptyMission();
  private cargo: Cargo | null = null;
  private zone: DropZone | null = null;
  private secureUntil = 0;
  private gripperOpen = 0;
  private cargoAttached = false;
  private hoverTarget: { x: number; y: number } | null = null;
  private justSecured = false;
  private justDelivered = false;
  private missionStartedAt = 0;
  private bob = 0;
  private recoil = 0;
  private antenna = 0;
  private victoryT = 0;
  private victoryUntil = 0;
  private flash = 0;
  private personalityMode: PersonalityMode = 'idle';
  private glowTint: { r: number; g: number; b: number } | null = null;
  private wheelTwitch = 0;
  private magdock = new MagDockController();
  private magdockInput: MagDockInput | null = null;
  private quietDeliverUntil = 0;
  private justMaglock = false;
  private justPadAcquired = false;
  private justDisembark = false;

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
    this.mission = emptyMission();
    this.cargo = null;
    this.zone = null;
    this.secureUntil = 0;
    this.gripperOpen = 0;
    this.cargoAttached = false;
    this.hoverTarget = null;
    this.missionStartedAt = 0;
    this.bob = 0;
    this.recoil = 0;
    this.antenna = 0;
    this.victoryT = 0;
    this.victoryUntil = 0;
    this.flash = 0;
    this.personalityMode = 'idle';
    this.glowTint = null;
    this.magdock.reset();
    this.magdockInput = null;
    this.quietDeliverUntil = 0;
    this.lastActivityAt = now;
    this.lastPaintAt = now;
    this.initialized = true;
    this.fsm.reset();
    this.state = 'Recon';
  }

  setGlowTint(tint: { r: number; g: number; b: number } | null): void {
    this.glowTint = tint;
  }

  /** Per-frame MagDock pad input from GameApp. */
  setMagDockInput(input: MagDockInput | null): void {
    this.magdockInput = input;
  }

  get magdockPhase(): MagDockPhase {
    return this.magdock.phase;
  }

  getFrozenRoute(): { x: number; y: number }[] {
    return this.route.map((p) => ({ x: p.x, y: p.y }));
  }

  getMissionStartedAt(): number {
    return this.missionStartedAt;
  }

  /** Short celebration before Theater takes over. */
  beginVictory(now: number): void {
    this.victoryUntil = now + CONFIG.THEATER_VICTORY_MS;
    this.personalityMode = 'victory';
    this.flash = 1;
    this.headlights = true;
  }

  get isCelebrating(): boolean {
    return this.victoryUntil > 0 && performance.now() < this.victoryUntil;
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
    this.mission.dropX *= sx;
    this.mission.dropY *= sy;
    this.clampToBounds(false);
  }

  notifyPaint(now: number): void {
    this.lastPaintAt = now;
    this.lastActivityAt = now;
  }

  /** Keep world refs for idle re-arm / mission planning. */
  bindWorld(cargo: Cargo, zone: DropZone): void {
    this.cargo = cargo;
    this.zone = zone;
  }

  /** Abort drive / mission (Clear path). */
  abortMission(path?: PlasmaPath): void {
    if (path) this.clearRoute(path);
    else this.clearRoute();
    this.holding = false;
    this.mission = emptyMission();
    this.cargoAttached = false;
    this.gripperOpen = 0;
    this.desiredSpeed = 0;
    this.speed = 0;
    this.state = 'Recon';
    this.magdock.reset();
    if (this.cargo && this.cargo.status === 'secured') {
      this.cargo.setStatus('idle');
    } else if (this.cargo && this.cargo.status === 'targeted') {
      this.cargo.setStatus('idle');
    }
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
      this.mission = emptyMission();
      this.cargoAttached = false;
      this.gripperOpen = 0;
    }
  }

  get isHolding(): boolean {
    return this.holding;
  }

  /** Tip hover target for curious turret (Waiting / Recon idle). */
  setHoverTarget(x: number | null, y: number | null): void {
    if (x === null || y === null) {
      this.hoverTarget = null;
      return;
    }
    this.hoverTarget = { x, y };
  }

  /** Consume one-shot audio events. */
  consumeEvents(): {
    secured: boolean;
    delivered: boolean;
    servoTick: boolean;
    maglock: boolean;
    padAcquired: boolean;
    disembark: boolean;
  } {
    const md = this.magdock.consumeEvents();
    const out = {
      secured: this.justSecured,
      delivered: this.justDelivered,
      servoTick: false,
      maglock: this.justMaglock || md.maglock,
      padAcquired: this.justPadAcquired || md.padAcquired,
      disembark: this.justDisembark || md.disembark,
    };
    this.justSecured = false;
    this.justDelivered = false;
    this.justMaglock = false;
    this.justPadAcquired = false;
    this.justDisembark = false;
    return out;
  }

  /**
   * Commit path: copy + pin stroke, build delivery mission if cargo/zone given.
   */
  armPath(
    path: PlasmaPath,
    cargo: Cargo | null = null,
    zone: DropZone | null = null,
  ): void {
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
    this.cargo = cargo;
    this.zone = zone;
    this.cargoAttached = false;
    this.gripperOpen = 0;
    this.victoryUntil = 0;
    this.victoryT = 0;
    this.missionStartedAt = performance.now();
    this.mission =
      cargo && zone
        ? buildDeliveryMission(path, cargo, zone)
        : emptyMission();
    if (this.mission.active && zone) {
      const c = zone.center;
      this.mission.dropX = c.x;
      this.mission.dropY = c.y;
    }

    if (this.route.length === 0) {
      this.drivePhase = 'idle';
      this.missionStartedAt = 0;
      return;
    }

    path.pinStroke(strokeId);

    const start = this.route[0];
    const distToStart = dist(this.x, this.y, start.x, start.y);

    if (distToStart <= CONFIG.WAYPOINT_REACH_PX * 1.25) {
      this.beginFollowFromStart();
      this.mission.checklist.approachStart = true;
    } else {
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
    this.mission.checklist.approachStart = true;
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

  private clearRoute(path?: PlasmaPath): void {
    if (path && this.activeStrokeId !== null) {
      path.unpinStroke();
    }
    this.route = [];
    this.drivePhase = 'idle';
    this.followIndex = 0;
    this.activeStrokeId = null;
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
      gripperOpen: this.gripperOpen,
      cargoAttached: this.cargoAttached,
      drivePhase: this.drivePhase,
      hoverTracking:
        !!this.hoverTarget && (this.holding || this.drivePhase === 'idle'),
      bob: this.bob,
      recoil: this.recoil,
      antenna: this.antenna,
      victoryT: this.victoryT,
      personalityMode: this.personalityMode,
      flash: this.flash,
      glowTint: this.glowTint,
      magdockPhase: this.magdock.phase,
      magdockConfidence: this.magdock.confidence,
      quietDeliverUntil: this.quietDeliverUntil,
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
        drivePhase: this.drivePhase,
        missionChecklist: { ...this.mission.checklist },
        missionStartedAt: this.missionStartedAt,
        missionElapsedMs:
          this.missionStartedAt > 0 && this.drivePhase !== 'idle'
            ? performance.now() - this.missionStartedAt
            : 0,
        magdock: {
          phase: this.magdock.phase,
          confidence: this.magdock.confidence,
          statusLine: this.magdock.statusLine,
          padActive: !!this.magdockInput?.padActive,
        },
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

    if (this.cargoAttached && this.cargo) {
      this.cargo.attachTo(this.x, this.y, this.angle);
    }

    // Victory celebration overrides drive briefly after deliver
    if (this.victoryUntil > 0 && now < this.victoryUntil) {
      this.updateVictory(dt, now);
      this.updatePersonality(dt, now);
      return;
    }

    if (this.holding) {
      this.magdock.reset();
      this.updateWaiting(dt, path);
      this.updatePersonality(dt, now);
      return;
    }

    // MagDock protocol — may pause mission motion
    if (this.magdockInput) {
      const proxy = {
        x: this.x,
        y: this.y,
        angle: this.angle,
        speed: this.speed,
        desiredSpeed: this.desiredSpeed,
        desiredAngle: this.desiredAngle,
        turretAngle: this.turretAngle,
        suspension: this.suspension,
        wheelSpin: this.wheelSpin,
        drivePhase: this.drivePhase,
      };
      const owned = this.magdock.update(dt, now, proxy, this.magdockInput);
      this.x = proxy.x;
      this.y = proxy.y;
      this.angle = proxy.angle;
      this.speed = proxy.speed;
      this.desiredSpeed = proxy.desiredSpeed;
      this.desiredAngle = proxy.desiredAngle;
      this.turretAngle = proxy.turretAngle;
      this.suspension = proxy.suspension;
      this.wheelSpin = proxy.wheelSpin;

      if (owned) {
        this.personalityMode = 'magdock';
        this.state = 'LockedOn';
        this.headlights = true;
        if (this.cargoAttached && this.cargo) {
          this.cargo.attachTo(this.x, this.y, this.angle);
        }
        const boardedLike =
          this.magdock.isBoarded || this.magdock.phase === 'disembarking';
        if (!boardedLike) {
          this.lockTarget = this.magdockInput.geom
            ? { ...this.magdockInput.geom.center }
            : null;
          this.applyMotion(dt);
        } else {
          this.lockTarget = null;
          this.clampToBounds(false);
        }
        // Resume mission after disembark completes
        if (this.magdock.phase === 'free') {
          const resume = this.magdock.getPausedDrive();
          if (
            resume === 'follow' ||
            resume === 'seekCargo' ||
            resume === 'tow' ||
            resume === 'approach'
          ) {
            this.drivePhase = resume;
            this.state = 'LockedOn';
            this.justDisembark = true;
          }
          if (resume) this.magdock.clearPausedDrive();
        }
        this.updatePersonality(dt, now);
        return;
      }
    }

    if (this.drivePhase !== 'idle') {
      this.updateMissionDrive(dt, now, path);
      this.updatePersonality(dt, now);
      return;
    }

    this.updateIdle(dt, now, path);
    this.updatePersonality(dt, now);
  }

  private updateVictory(dt: number, now: number): void {
    this.personalityMode = 'victory';
    this.desiredSpeed = 0;
    this.speed = Math.max(0, this.speed - CONFIG.ROVER_ACCEL * dt);
    const u = 1 - (this.victoryUntil - now) / CONFIG.THEATER_VICTORY_MS;
    this.victoryT = u;
    this.angle += dt * 3.2 * Math.sin(u * Math.PI);
    this.flash = Math.max(0, 1 - u * 1.2);
    this.headlights = u < 0.85;
    if (this.zone) {
      const c = this.zone.center;
      this.turretAngle = lerpAngle(
        this.turretAngle,
        Math.atan2(c.y - this.y, c.x - this.x),
        1 - Math.exp(-4 * dt),
      );
    }
    if (this.hoverTarget) {
      const want = Math.atan2(
        this.hoverTarget.y - this.y,
        this.hoverTarget.x - this.x,
      );
      this.turretAngle = lerpAngle(
        this.turretAngle,
        want,
        1 - Math.exp(-3 * dt),
      );
    }
    this.clampToBounds(false);
  }

  private updatePersonality(dt: number, now: number): void {
    this.recoil = Math.max(0, this.recoil - dt * 10);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.antenna = Math.sin(now * 0.008) * CONFIG.PERSONALITY_ANTENNA;

    if (this.holding) {
      this.personalityMode = 'waiting';
      this.bob = Math.sin(now * 0.012) * CONFIG.PERSONALITY_BOB * 0.4;
      this.wheelTwitch += dt;
      if (this.wheelTwitch > 0.55) {
        this.wheelSpin += 0.35;
        this.wheelTwitch = 0;
      }
      return;
    }

    if (this.magdock.isActive) {
      this.personalityMode = 'magdock';
      this.bob = Math.sin(now * 0.02) * 0.5;
      this.antenna = Math.sin(now * 0.01) * CONFIG.PERSONALITY_ANTENNA;
      return;
    }

    if (this.drivePhase === 'secure') {
      this.personalityMode = 'secure';
      this.bob = 0;
      return;
    }

    if (this.drivePhase !== 'idle') {
      this.personalityMode = 'driving';
      this.bob = Math.sin(now * 0.04) * 0.4;
      return;
    }

    if (this.hoverTarget) {
      this.personalityMode = 'hover';
      this.bob = Math.sin(now * 0.01) * CONFIG.PERSONALITY_BOB * 0.35;
    } else {
      this.personalityMode = 'idle';
      this.bob = Math.sin(now * 0.006) * CONFIG.PERSONALITY_BOB;
      this.suspension = lerp(
        this.suspension,
        1 + Math.sin(now * 0.005) * 0.02,
        dt * 2,
      );
    }
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
    } else if (this.hoverTarget) {
      const want = Math.atan2(
        this.hoverTarget.y - this.y,
        this.hoverTarget.x - this.x,
      );
      this.turretAngle = lerpAngle(this.turretAngle, want, 1 - Math.exp(-4 * dt));
      this.lockTarget = { ...this.hoverTarget };
    } else {
      this.turretSweep += dt * 1.2 * this.turretSweepDir;
      if (Math.abs(this.turretSweep) > Math.PI / 2) this.turretSweepDir *= -1;
      this.turretAngle = this.angle + this.turretSweep;
      this.lockTarget = null;
    }
    this.clampToBounds(false);
  }

  private updateMissionDrive(dt: number, now: number, path: PlasmaPath): void {
    this.headlights = true;
    this.suspension = lerp(this.suspension, 1, dt * 4);
    this.lastActivityAt = now;

    if (this.drivePhase === 'approach') {
      this.updateApproach(dt, path);
      return;
    }
    if (this.drivePhase === 'secure') {
      this.updateSecure(dt, now, path);
      return;
    }
    if (this.drivePhase === 'seekCargo') {
      this.updateSeekCargo(dt, now, path);
      return;
    }
    if (this.drivePhase === 'tow') {
      this.updateTow(dt, now, path);
      return;
    }
    if (this.drivePhase === 'deliver') {
      this.updateDeliver(dt, now, path);
      return;
    }

    // follow
    this.updateFollow(dt, now, path);
  }

  private updateApproach(dt: number, path: PlasmaPath): void {
    this.state = 'LockedOn';
    const start = this.route[0];
    if (!start) {
      this.clearRoute(path);
      return;
    }
    this.lockTarget = start;

    const dx = start.x - this.x;
    const dy = start.y - this.y;
    const d = Math.hypot(dx, dy);
    this.desiredAngle = Math.atan2(dy, dx);
    const turn = Math.abs(angleDiff(this.angle, this.desiredAngle));

    let spd: number = CONFIG.ROVER_APPROACH_SPEED;
    if (turn > 0.7) spd *= clamp(1.1 - turn * 0.55, 0.15, 1);
    if (d < CONFIG.WAYPOINT_PASS_PX * 2) {
      spd = Math.min(spd, 35 + d * 0.6);
    }
    this.desiredSpeed = spd;

    if (d <= CONFIG.WAYPOINT_REACH_PX || this.hasPassedPoint(start, this.route[1])) {
      this.beginFollowFromStart();
    }

    this.applyMotion(dt);
  }

  private updateFollow(dt: number, now: number, path: PlasmaPath): void {
    this.state = 'LockedOn';

    if (this.tryPickupIfNear(now)) {
      this.applyMotion(dt);
      return;
    }

    this.advanceAlongRoute();

    if (this.followIndex >= this.route.length - 1) {
      const last = this.route[this.route.length - 1];
      const dEnd = dist(this.x, this.y, last.x, last.y);
      this.lockTarget = last;
      this.desiredAngle = Math.atan2(last.y - this.y, last.x - this.x);
      if (dEnd < CONFIG.WAYPOINT_REACH_PX || this.hasPassedPoint(last, null)) {
        this.desiredSpeed = 0;
        this.speed = Math.max(0, this.speed - CONFIG.ROVER_ACCEL * dt * 1.5);
        path.absorbNearOnStroke(
          this.x,
          this.y,
          CONFIG.ABSORB_RADIUS_PX,
          this.activeStrokeId,
        );
        if (this.speed < 8 || dEnd < CONFIG.WAYPOINT_REACH_PX * 0.5) {
          this.onRouteComplete(path);
        }
        this.applyMotion(dt);
        return;
      }
      this.desiredSpeed = Math.min(CONFIG.ROVER_CRUISE_SPEED * 0.45, 50);
      this.applyMotion(dt);
      return;
    }

    this.driveTowardRouteNode(dt, now, path, 1);
  }

  private onRouteComplete(path: PlasmaPath): void {
    if (this.mission.hasCargo && !this.mission.checklist.secured) {
      this.drivePhase = 'seekCargo';
      this.state = 'LockedOn';
      return;
    }
    if (this.mission.hasCargo && this.mission.checklist.secured) {
      this.drivePhase = 'tow';
      return;
    }
    this.clearRoute(path);
    this.state = 'Recon';
  }

  private tryPickupIfNear(now: number): boolean {
    if (!this.mission.hasCargo || this.mission.checklist.secured) return false;
    if (!this.cargo || !this.cargo.present) return false;
    if (!this.cargo.isNear(this.x, this.y)) return false;
    this.beginSecure(now);
    return true;
  }

  private beginSecure(now: number): void {
    this.drivePhase = 'secure';
    this.secureUntil = now + CONFIG.SECURE_MS;
    this.desiredSpeed = 0;
    this.speed = 0;
    this.state = 'LockedOn';
    if (this.cargo) this.cargo.setStatus('targeted');
  }

  private updateSecure(_dt: number, now: number, _path: PlasmaPath): void {
    this.state = 'LockedOn';
    this.desiredSpeed = 0;
    this.speed = 0;
    const t = 1 - Math.max(0, this.secureUntil - now) / CONFIG.SECURE_MS;
    this.gripperOpen = clamp(t * CONFIG.GRIPPER_OPEN, 0, CONFIG.GRIPPER_OPEN);
    if (this.cargo) {
      this.lockTarget = { x: this.cargo.x, y: this.cargo.y };
    }

    if (now >= this.secureUntil) {
      this.mission.checklist.secured = true;
      this.cargoAttached = true;
      this.gripperOpen = CONFIG.GRIPPER_OPEN * 0.55;
      this.justSecured = true;
      this.recoil = CONFIG.PERSONALITY_RECOIL;
      this.flash = 1;
      if (this.cargo) this.cargo.setStatus('secured');
      if (this.followIndex < this.route.length - 1) {
        this.drivePhase = 'tow';
      } else if (this.mission.hasCargo) {
        this.drivePhase = 'tow';
      } else {
        this.drivePhase = 'follow';
      }
    }
    this.clampToBounds(false);
  }

  private updateSeekCargo(dt: number, now: number, path: PlasmaPath): void {
    this.state = 'LockedOn';
    if (!this.cargo || !this.cargo.present || this.cargo.status === 'delivered') {
      this.clearRoute(path);
      this.state = 'Recon';
      return;
    }

    this.lockTarget = { x: this.cargo.x, y: this.cargo.y };
    const dx = this.cargo.x - this.x;
    const dy = this.cargo.y - this.y;
    const d = Math.hypot(dx, dy);
    this.desiredAngle = Math.atan2(dy, dx);
    const turn = Math.abs(angleDiff(this.angle, this.desiredAngle));
    let spd: number = CONFIG.ROVER_CRUISE_SPEED * 0.9;
    if (turn > 0.55) spd *= clamp(1.05 - turn * 0.5, 0.25, 1);
    if (d < CONFIG.CARGO_PICKUP_RADIUS * 2) {
      spd = Math.min(spd, 40 + d * 0.5);
    }
    this.desiredSpeed = spd;

    if (d <= CONFIG.CARGO_PICKUP_RADIUS) {
      this.beginSecure(now);
    }
    this.applyMotion(dt);
  }

  private updateTow(dt: number, now: number, path: PlasmaPath): void {
    this.state = 'LockedOn';
    this.gripperOpen = lerp(this.gripperOpen, CONFIG.GRIPPER_OPEN * 0.45, dt * 4);

    // Finish remaining route while towing
    if (this.followIndex < this.route.length - 1) {
      this.advanceAlongRoute();
      if (this.followIndex < this.route.length - 1) {
        this.driveTowardRouteNode(dt, now, path, CONFIG.TOW_SPEED_MULT);
        return;
      }
    }

    // Drive to drop zone
    if (!this.zone) {
      this.finishMission(path);
      return;
    }

    const drop = { x: this.mission.dropX, y: this.mission.dropY };
    this.lockTarget = drop;
    const dx = drop.x - this.x;
    const dy = drop.y - this.y;
    const d = Math.hypot(dx, dy);
    this.desiredAngle = Math.atan2(dy, dx);
    const turn = Math.abs(angleDiff(this.angle, this.desiredAngle));
    let spd: number = CONFIG.ROVER_CRUISE_SPEED * CONFIG.TOW_SPEED_MULT;
    if (turn > 0.55) spd *= clamp(1.05 - turn * 0.5, 0.25, 1);
    if (d < 80) spd = Math.min(spd, 35 + d * 0.4);
    this.desiredSpeed = spd;

    const cargoIn =
      this.cargo &&
      this.zone.contains(this.cargo.x, this.cargo.y);
    const bumperIn = this.zone.contains(this.x, this.y);

    if ((cargoIn || bumperIn) && d < Math.max(this.zone.w, this.zone.h) * 0.65) {
      this.drivePhase = 'deliver';
      this.desiredSpeed = 0;
      this.secureUntil = now + 280;
    }

    this.applyMotion(dt);
  }

  private updateDeliver(dt: number, now: number, path: PlasmaPath): void {
    this.state = 'LockedOn';
    this.desiredSpeed = 0;
    this.speed = Math.max(0, this.speed - CONFIG.ROVER_ACCEL * dt * 2);
    this.gripperOpen = lerp(this.gripperOpen, 0, dt * 6);

    if (now >= this.secureUntil) {
      this.cargoAttached = false;
      this.mission.checklist.delivered = true;
      this.justDelivered = true;
      this.flash = 1;
      if (this.cargo) {
        if (this.zone) {
          const c = this.zone.center;
          this.cargo.x = c.x;
          this.cargo.y = c.y;
        }
        this.cargo.setStatus('delivered');
      }
      this.clearRoute(path);
      this.drivePhase = 'idle';
      this.state = 'Recon';
      this.gripperOpen = 0;
      this.quietDeliverUntil = now + CONFIG.QUIET_DELIVER_MS;
      this.beginVictory(now);
      return;
    }
    this.clampToBounds(false);
  }

  private finishMission(path: PlasmaPath): void {
    this.clearRoute(path);
    this.drivePhase = 'idle';
    this.state = 'Recon';
    this.cargoAttached = false;
    this.gripperOpen = 0;
    this.missionStartedAt = 0;
  }

  private driveTowardRouteNode(
    dt: number,
    now: number,
    path: PlasmaPath,
    speedMult: number,
  ): void {
    const targetIdx = Math.min(
      this.followIndex + CONFIG.LOOKAHEAD_NODES,
      this.route.length - 1,
    );
    const target = this.route[targetIdx];
    const next = this.route[this.followIndex];
    this.lockTarget = target;

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    this.desiredAngle = Math.atan2(dy, dx);
    const turn = Math.abs(angleDiff(this.angle, this.desiredAngle));
    const dNext = dist(this.x, this.y, next.x, next.y);

    let spd: number = CONFIG.ROVER_CRUISE_SPEED * speedMult;
    if (turn > 0.55) spd *= clamp(1.05 - turn * 0.5, 0.25, 1);
    if (dNext < CONFIG.WAYPOINT_PASS_PX) {
      spd = Math.min(spd, 45 + dNext * 0.8);
    }
    this.desiredSpeed = spd;

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

    this.applyMotion(dt);
  }

  private advanceAlongRoute(): void {
    while (this.followIndex < this.route.length - 1) {
      const cur = this.route[this.followIndex];
      const nxt =
        this.followIndex + 1 < this.route.length
          ? this.route[this.followIndex + 1]
          : null;
      const near = dist(this.x, this.y, cur.x, cur.y) <= CONFIG.WAYPOINT_REACH_PX;
      if (near || this.hasPassedPoint(cur, nxt)) {
        this.followIndex++;
        continue;
      }
      break;
    }
  }

  private hasPassedPoint(
    point: RoutePoint,
    next: RoutePoint | null | undefined,
  ): boolean {
    const toPointX = point.x - this.x;
    const toPointY = point.y - this.y;
    const d = Math.hypot(toPointX, toPointY);
    if (d > CONFIG.WAYPOINT_PASS_PX) return false;

    if (next) {
      const segX = next.x - point.x;
      const segY = next.y - point.y;
      const segLen = Math.hypot(segX, segY) || 1;
      const fromPointX = this.x - point.x;
      const fromPointY = this.y - point.y;
      const along = (fromPointX * segX + fromPointY * segY) / segLen;
      return along > 4;
    }

    const fwdX = Math.cos(this.angle);
    const fwdY = Math.sin(this.angle);
    const ahead = toPointX * fwdX + toPointY * fwdY;
    return ahead < 0;
  }

  private updateIdle(dt: number, now: number, path: PlasmaPath): void {
    this.lockTarget = this.hoverTarget ? { ...this.hoverTarget } : null;
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

      if (this.hoverTarget) {
        const want = Math.atan2(
          this.hoverTarget.y - this.y,
          this.hoverTarget.x - this.x,
        );
        this.turretAngle = lerpAngle(
          this.turretAngle,
          want,
          1 - Math.exp(-4 * dt),
        );
      } else {
        this.turretSweep += dt * 1.0 * this.turretSweepDir;
        if (Math.abs(this.turretSweep) > Math.PI / 2) this.turretSweepDir *= -1;
        this.turretAngle = this.angle + this.turretSweep;
      }

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

      if (this.reconMode === 'burst' && !this.hoverTarget) {
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

    if (path.hasPoints() && this.route.length === 0 && this.drivePhase === 'idle') {
      this.armPath(path, this.cargo, this.zone);
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
