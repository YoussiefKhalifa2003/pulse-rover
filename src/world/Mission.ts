import { CONFIG } from '../config';
import type { PlasmaPath } from '../path/PlasmaPath';
import { dist } from '../utils/math';
import type { Cargo } from './Cargo';
import type { DropZone } from './DropZone';

export interface MissionChecklist {
  approachStart: boolean;
  secured: boolean;
  delivered: boolean;
}

export interface MissionPlan {
  active: boolean;
  hasCargo: boolean;
  pickupIndex: number | null;
  /** If path never near cargo, seek after follow. */
  seekAfterRoute: boolean;
  dropX: number;
  dropY: number;
  checklist: MissionChecklist;
}

export function emptyMission(): MissionPlan {
  return {
    active: false,
    hasCargo: false,
    pickupIndex: null,
    seekAfterRoute: false,
    dropX: 0,
    dropY: 0,
    checklist: {
      approachStart: false,
      secured: false,
      delivered: false,
    },
  };
}

/**
 * Build a delivery plan from the committed path + world objects.
 * If path misses cargo, seekAfterRoute = true (fetch fallback).
 */
export function buildDeliveryMission(
  path: PlasmaPath,
  cargo: Cargo | null,
  zone: DropZone,
): MissionPlan {
  const plan = emptyMission();
  const center = zone.center;
  plan.dropX = center.x;
  plan.dropY = center.y;

  if (!cargo || !cargo.present || cargo.status === 'delivered') {
    plan.active = path.hasPoints();
    return plan;
  }

  plan.active = true;
  plan.hasCargo = true;
  cargo.setStatus('targeted');

  const strokeId = path.latestStrokeId();
  if (strokeId === null) {
    plan.seekAfterRoute = true;
    return plan;
  }

  const pts = path.copyStroke(strokeId);
  let bestI = -1;
  let bestD: number = CONFIG.CARGO_PICKUP_RADIUS;
  for (let i = 0; i < pts.length; i++) {
    const d = dist(pts[i].x, pts[i].y, cargo.x, cargo.y);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }

  if (bestI >= 0) {
    plan.pickupIndex = bestI;
    plan.seekAfterRoute = false;
  } else {
    plan.pickupIndex = null;
    plan.seekAfterRoute = true;
  }

  return plan;
}
