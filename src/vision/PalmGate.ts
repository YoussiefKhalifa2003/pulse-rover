import { CONFIG } from '../config';
import { measurePalm, pinchDist, type PalmGeom } from './handGeometry';
import type { HandSample } from './landmarks';

export interface PalmPadState {
  active: boolean;
  confidence: number;
  geom: PalmGeom | null;
  sample: HandSample | null;
}

/**
 * Flat-open palm detector with EMA + hysteresis (webcam-safe).
 * Stricter than paint hover so index pinch-draw does not look like a pad.
 */
export class PalmGate {
  private active = false;
  private flatSmooth = 0;
  private wantOnSince = 0;
  private wantOffSince = 0;

  reset(): void {
    this.active = false;
    this.flatSmooth = 0;
    this.wantOnSince = 0;
    this.wantOffSince = 0;
  }

  /** Instant release — paint / pinch always wins over MagDock. */
  forceImmediateOff(): void {
    this.active = false;
    this.flatSmooth = 0;
    this.wantOnSince = 0;
    this.wantOffSince = 0;
  }

  update(
    sample: HandSample | null,
    width: number,
    height: number,
    now: number,
  ): PalmPadState {
    if (!sample || sample.landmarks.length < 21) {
      return this.forceOff(now);
    }

    const geom = measurePalm(sample.landmarks, width, height);
    const pinch = pinchDist(sample.landmarks);
    // Any paint-intent pinch kills pad immediately (no hysteresis delay)
    const paintIntent = pinch < CONFIG.PINCH_OFF;
    if (paintIntent) {
      this.forceImmediateOff();
      return { active: false, confidence: 0, geom: null, sample: null };
    }

    const openEnough =
      geom.extension >= CONFIG.PALM_EXTENSION_MIN &&
      geom.flatness >= CONFIG.PALM_FLAT_OFF;
    const rawFlat = openEnough ? geom.flatness : geom.flatness * 0.35;
    const a = CONFIG.PALM_EMA;
    this.flatSmooth = this.flatSmooth * (1 - a) + rawFlat * a;

    const wantsOn =
      this.flatSmooth >= CONFIG.PALM_FLAT_ON &&
      geom.extension >= CONFIG.PALM_EXTENSION_MIN &&
      sample.presence >= CONFIG.MIN_HAND_PRESENCE;
    const wantsOff =
      this.flatSmooth <= CONFIG.PALM_FLAT_OFF ||
      geom.extension < CONFIG.PALM_EXTENSION_MIN * 0.85;

    if (!this.active) {
      if (wantsOn) {
        if (!this.wantOnSince) this.wantOnSince = now;
        if (now - this.wantOnSince >= CONFIG.PALM_START_HOLD_MS) {
          this.active = true;
          this.wantOffSince = 0;
        }
      } else {
        this.wantOnSince = 0;
      }
    } else if (wantsOff) {
      if (!this.wantOffSince) this.wantOffSince = now;
      if (now - this.wantOffSince >= CONFIG.PALM_END_HOLD_MS) {
        this.active = false;
        this.wantOnSince = 0;
        this.wantOffSince = 0;
      }
    } else {
      this.wantOffSince = 0;
    }

    const confidence = Math.max(
      0,
      Math.min(1, this.flatSmooth * 0.7 + sample.presence * 0.2 + geom.extension * 0.1),
    );

    // Only expose geom when pad is truly active — avoids dual pad+tip visuals
    return {
      active: this.active,
      confidence: this.active ? confidence : 0,
      geom: this.active ? geom : null,
      sample: this.active ? sample : null,
    };
  }

  private forceOff(now: number): PalmPadState {
    if (!this.active) {
      this.wantOnSince = 0;
      return { active: false, confidence: 0, geom: null, sample: null };
    }
    if (!this.wantOffSince) this.wantOffSince = now;
    if (now - this.wantOffSince >= CONFIG.PALM_END_HOLD_MS) {
      this.active = false;
      this.wantOnSince = 0;
      this.wantOffSince = 0;
      return { active: false, confidence: 0, geom: null, sample: null };
    }
    return { active: true, confidence: 0.3, geom: null, sample: null };
  }
}
