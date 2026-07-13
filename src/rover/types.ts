import type { MissionChecklist } from '../world/Mission';

export type RoverState = 'Recon' | 'LockedOn' | 'Overdrive' | 'Standby' | 'Waiting';

export type DrivePhase =
  | 'idle'
  | 'approach'
  | 'follow'
  | 'seekCargo'
  | 'secure'
  | 'tow'
  | 'deliver';

export type MagDockPhase =
  | 'free'
  | 'evaluating'
  | 'hesitating'
  | 'seekingPad'
  | 'softDock'
  | 'hardDock'
  | 'boarded'
  | 'airborne'
  | 'disembarking';

export type PersonalityMode =
  | 'idle'
  | 'hover'
  | 'waiting'
  | 'driving'
  | 'secure'
  | 'victory'
  | 'magdock';

export interface AbsorbTrail {
  x: number;
  y: number;
  bornAt: number;
  angle: number;
}

export interface MagDockHud {
  phase: MagDockPhase;
  confidence: number;
  statusLine: string;
  padActive: boolean;
}

export interface RoverAnalysis {
  holding: boolean;
  followIndex: number;
  activeStrokeId: number | null;
  nodeIndex: number;
  nodeTotal: number;
  lookahead: { x: number; y: number } | null;
  lookaheadDist: number;
  roverX: number;
  roverY: number;
  turretAngle: number;
  drivePhase: DrivePhase;
  missionChecklist: MissionChecklist;
  missionStartedAt: number;
  missionElapsedMs: number;
  magdock: MagDockHud;
}

export interface RoverSnapshot {
  x: number;
  y: number;
  angle: number;
  speed: number;
  charge: number;
  state: RoverState;
  turretAngle: number;
  suspension: number;
  headlights: boolean;
  wheelSpin: number;
  lockTarget: { x: number; y: number } | null;
  trails: AbsorbTrail[];
  boostStreaks: { x: number; y: number; angle: number; age: number }[];
  overdriveRemaining: number;
  analysis: RoverAnalysis;
  gripperOpen: number;
  cargoAttached: boolean;
  drivePhase: DrivePhase;
  hoverTracking: boolean;
  bob: number;
  recoil: number;
  antenna: number;
  victoryT: number;
  personalityMode: PersonalityMode;
  flash: number;
  glowTint: { r: number; g: number; b: number } | null;
  magdockPhase: MagDockPhase;
  magdockConfidence: number;
  quietDeliverUntil: number;
}
