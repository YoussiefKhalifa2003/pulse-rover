import type { RoverSnapshot } from '../rover/types';
import type { TelemetrySample } from '../mission/types';
import type { MissionLog } from '../mission/types';

/** Reconstruct a RoverSnapshot from telemetry for Theater rendering. */
export function snapshotFromTelemetry(
  s: TelemetrySample,
  log: MissionLog,
): RoverSnapshot {
  const emptyChecklist = {
    approachStart: true,
    secured:
      s.cargoStatus === 'secured' ||
      s.cargoStatus === 'delivered' ||
      s.cargoAttached,
    delivered: s.cargoStatus === 'delivered',
  };

  return {
    x: s.x - Math.cos(s.angle) * s.recoil * 0.4,
    y: s.y - Math.sin(s.angle) * s.recoil * 0.4 + s.bob,
    angle: s.angle,
    speed: s.speed,
    charge: s.charge,
    state: 'LockedOn',
    turretAngle: s.turret,
    suspension: s.suspension,
    headlights: s.headlights || s.recoil > 1.5,
    wheelSpin: s.wheelSpin,
    lockTarget: null,
    trails: [],
    boostStreaks: [],
    overdriveRemaining: 0,
    gripperOpen: s.gripperOpen,
    cargoAttached: s.cargoAttached,
    drivePhase: s.drivePhase,
    hoverTracking: false,
    bob: s.bob,
    recoil: s.recoil,
    antenna: s.antenna,
    victoryT: s.victoryT,
    personalityMode:
      s.drivePhase === 'secure'
        ? 'secure'
        : s.victoryT > 0.05
          ? 'victory'
          : 'driving',
    flash: s.recoil > 1 ? 0.6 : s.victoryT > 0 ? 0.4 : 0,
    glowTint: { r: s.glowR, g: s.glowG, b: s.glowB },
    magdockPhase: 'free',
    magdockConfidence: 0,
    quietDeliverUntil: 0,
    analysis: {
      holding: false,
      followIndex: 0,
      activeStrokeId: null,
      nodeIndex: 0,
      nodeTotal: log.route.length,
      lookahead: null,
      lookaheadDist: 0,
      roverX: s.x,
      roverY: s.y,
      turretAngle: s.turret,
      drivePhase: s.drivePhase,
      missionChecklist: emptyChecklist,
      missionStartedAt: 0,
      missionElapsedMs: s.t,
      magdock: {
        phase: 'free',
        confidence: 0,
        statusLine: '',
        padActive: false,
      },
    },
  };
}
