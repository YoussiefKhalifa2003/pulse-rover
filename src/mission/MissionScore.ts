import { CONFIG } from '../config';
import type { MissionLog } from './types';

export interface MissionAnalysis {
  efficiency: number;
  efficiencyPct: number;
  trajectory: 'OPTIMAL' | 'FETCH' | 'WIDE';
  gripQuality: number;
  gripPct: number;
  delivery: 'SUCCESS' | 'ABORTED';
  missionTimeMs: number;
  missionTimeLabel: string;
  stars: 1 | 2 | 3;
  pathLength: number;
}

export interface SessionStats {
  coresDelivered: number;
  bestTimeMs: number;
}

const SESSION_KEY = 'pulse-rover-session-v1';

/**
 * Deterministic score + analysis from a finalized MissionLog.
 */
export function scoreMission(log: MissionLog): MissionAnalysis {
  const ideal = idealPathLength(log);
  const painted = Math.max(1, log.pathLength);
  let efficiency = ideal / painted;
  efficiency = Math.max(0, Math.min(1, efficiency));

  let trajectory: MissionAnalysis['trajectory'] = 'OPTIMAL';
  if (log.soughtCargo) trajectory = 'FETCH';
  else if (efficiency < CONFIG.SCORE_EFF_2STAR) trajectory = 'WIDE';

  const grip = estimateGrip(log);
  const stars = computeStars(log.durationMs, efficiency, !log.soughtCargo);

  return {
    efficiency,
    efficiencyPct: Math.round(efficiency * 100),
    trajectory,
    gripQuality: grip,
    gripPct: Math.round(grip * 100),
    delivery: log.finalized ? 'SUCCESS' : 'ABORTED',
    missionTimeMs: log.durationMs,
    missionTimeLabel: formatTime(log.durationMs),
    stars,
    pathLength: log.pathLength,
  };
}

function idealPathLength(log: MissionLog): number {
  const start = log.route[0] ?? log.cargoStart;
  const cargo = log.cargoStart;
  const zone = {
    x: log.zone.x + log.zone.w * 0.5,
    y: log.zone.y + log.zone.h * 0.5,
  };
  return (
    Math.hypot(cargo.x - start.x, cargo.y - start.y) +
    Math.hypot(zone.x - cargo.x, zone.y - cargo.y)
  );
}

function estimateGrip(log: MissionLog): number {
  const secure = log.samples.filter((s) => s.drivePhase === 'secure');
  if (secure.length === 0) return 0.7;
  const avgSpeed =
    secure.reduce((a, s) => a + s.speed, 0) / Math.max(1, secure.length);
  const still = Math.max(0, 1 - avgSpeed / 80);
  return Math.max(0.55, Math.min(0.99, 0.75 + still * 0.24));
}

function computeStars(
  timeMs: number,
  efficiency: number,
  noSeek: boolean,
): 1 | 2 | 3 {
  if (
    timeMs <= CONFIG.SCORE_TIME_3STAR_MS &&
    efficiency >= CONFIG.SCORE_EFF_3STAR &&
    noSeek
  ) {
    return 3;
  }
  if (
    timeMs <= CONFIG.SCORE_TIME_2STAR_MS &&
    efficiency >= CONFIG.SCORE_EFF_2STAR
  ) {
    return 2;
  }
  return 1;
}

export function formatTime(ms: number): string {
  const s = ms / 1000;
  return `${s.toFixed(1)} s`;
}

export function loadSessionStats(): SessionStats {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { coresDelivered: 0, bestTimeMs: Infinity };
    return JSON.parse(raw) as SessionStats;
  } catch {
    return { coresDelivered: 0, bestTimeMs: Infinity };
  }
}

export function saveSessionStats(stats: SessionStats): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(stats));
}

export function recordSuccess(timeMs: number): SessionStats {
  const s = loadSessionStats();
  s.coresDelivered += 1;
  if (timeMs < s.bestTimeMs) s.bestTimeMs = timeMs;
  saveSessionStats(s);
  return s;
}
