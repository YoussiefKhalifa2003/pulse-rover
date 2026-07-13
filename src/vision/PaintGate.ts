import { CONFIG } from '../config';
import { dist } from '../utils/math';
import { HandLandmark } from './landmarks';
import type { Landmark } from './landmarks';

export type PaintMode = 'idle' | 'hover' | 'paint' | 'erase';

/**
 * Pinch-to-paint with hover when hand is open.
 * EMA + hysteresis + hold debounce (webcam-safe).
 */
export class PaintGate {
  private painting = false;
  private pinchSmooth = 1;
  private wantPaintSince = 0;
  private wantIdleSince = 0;

  reset(): void {
    this.painting = false;
    this.pinchSmooth = 1;
    this.wantPaintSince = 0;
    this.wantIdleSince = 0;
  }

  update(landmarks: Landmark[], presence: number, now: number): PaintMode {
    if (presence < CONFIG.MIN_HAND_PRESENCE || landmarks.length < 21) {
      return this.forceIdle(now);
    }

    const thumb = landmarks[HandLandmark.THUMB_TIP];
    const index = landmarks[HandLandmark.INDEX_TIP];
    const raw = dist(thumb.x, thumb.y, index.x, index.y);
    const a = CONFIG.PINCH_EMA;
    this.pinchSmooth = this.pinchSmooth * (1 - a) + raw * a;

    const wantsPaint = this.pinchSmooth <= CONFIG.PINCH_ON;
    const wantsOpen = this.pinchSmooth >= CONFIG.PINCH_OFF;

    if (!this.painting) {
      if (wantsPaint) {
        if (!this.wantPaintSince) this.wantPaintSince = now;
        if (now - this.wantPaintSince >= CONFIG.PINCH_START_HOLD_MS) {
          this.painting = true;
          this.wantIdleSince = 0;
        }
      } else {
        this.wantPaintSince = 0;
      }
      return this.painting ? 'paint' : 'hover';
    }

    // Currently painting
    if (wantsOpen) {
      if (!this.wantIdleSince) this.wantIdleSince = now;
      if (now - this.wantIdleSince >= CONFIG.PINCH_END_HOLD_MS) {
        this.painting = false;
        this.wantPaintSince = 0;
        this.wantIdleSince = 0;
        return 'hover';
      }
    } else {
      this.wantIdleSince = 0;
    }
    return 'paint';
  }

  private forceIdle(now: number): PaintMode {
    if (!this.painting) {
      this.wantPaintSince = 0;
      return 'idle';
    }
    if (!this.wantIdleSince) this.wantIdleSince = now;
    if (now - this.wantIdleSince >= CONFIG.PINCH_END_HOLD_MS) {
      this.painting = false;
      this.wantPaintSince = 0;
      this.wantIdleSince = 0;
      return 'idle';
    }
    return 'paint';
  }

  get isPainting(): boolean {
    return this.painting;
  }

  get pinchDistance(): number {
    return this.pinchSmooth;
  }
}
