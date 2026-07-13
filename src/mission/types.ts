import type { DrivePhase } from '../rover/types';
import type { CargoStatus } from '../world/Cargo';

export type MissionEventKind =
  | 'approachStart'
  | 'followStart'
  | 'seekStart'
  | 'secureStart'
  | 'secured'
  | 'towStart'
  | 'deliverStart'
  | 'delivered'
  | 'aborted'
  | 'victory';

export interface TelemetrySample {
  t: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  turret: number;
  gripperOpen: number;
  drivePhase: DrivePhase;
  charge: number;
  cargoX: number;
  cargoY: number;
  cargoStatus: CargoStatus;
  cargoAttached: boolean;
  bob: number;
  recoil: number;
  antenna: number;
  victoryT: number;
  headlights: boolean;
  suspension: number;
  wheelSpin: number;
  glowR: number;
  glowG: number;
  glowB: number;
}

export interface MissionEvent {
  t: number;
  kind: MissionEventKind;
}

export interface MissionLog {
  startedAt: number;
  durationMs: number;
  route: { x: number; y: number }[];
  zone: { x: number; y: number; w: number; h: number };
  cargoStart: { x: number; y: number };
  pathLength: number;
  soughtCargo: boolean;
  paintDurationMs: number;
  samples: TelemetrySample[];
  events: MissionEvent[];
  finalized: boolean;
  fieldW: number;
  fieldH: number;
}

export type TheaterMode = 'off' | 'replay';
