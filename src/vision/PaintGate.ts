import { CONFIG } from '../config';
import { dist } from '../utils/math';
import { HandLandmark } from './landmarks';
import type { Landmark } from './landmarks';

export type PaintMode = 'idle' | 'paint' | 'erase';

/**
 * Debounced index-stylus gate.
 * Requires hold to start/stop so noisy landmarks don't spawn dozens of strokes.
 */
export class PaintGate {
  private painting = false;
  private extendSmooth = 0;
  private wantPaintSince = 0;
  private wantIdleSince = 0;

  reset(): void {
    this.painting = false;
    this.extendSmooth = 0;
    this.wantPaintSince = 0;
    this.wantIdleSince = 0;
  }

  update(landmarks: Landmark[], presence: number, now: number): PaintMode {
    if (presence < CONFIG.MIN_HAND_PRESENCE || landmarks.length < 21) {
      return this.forceIdle(now);
    }

    const tip = landmarks[HandLandmark.INDEX_TIP];
    const mcp = landmarks[HandLandmark.INDEX_MCP];
    const pip = landmarks[HandLandmark.INDEX_PIP];

    const extend =
      dist(tip.x, tip.y, pip.x, pip.y) * 0.55 +
      dist(tip.x, tip.y, mcp.x, mcp.y) * 0.45;
    this.extendSmooth = this.extendSmooth * 0.82 + extend * 0.18;

    const wantsPaint = this.extendSmooth >= CONFIG.INDEX_EXTEND_ON;
    const wantsIdle = this.extendSmooth < CONFIG.INDEX_EXTEND_OFF;

    if (!this.painting) {
      if (wantsPaint) {
        if (!this.wantPaintSince) this.wantPaintSince = now;
        if (now - this.wantPaintSince >= CONFIG.PAINT_START_HOLD_MS) {
          this.painting = true;
          this.wantIdleSince = 0;
        }
      } else {
        this.wantPaintSince = 0;
      }
    } else if (wantsIdle) {
      if (!this.wantIdleSince) this.wantIdleSince = now;
      if (now - this.wantIdleSince >= CONFIG.PAINT_END_HOLD_MS) {
        this.painting = false;
        this.wantPaintSince = 0;
      }
    } else {
      this.wantIdleSince = 0;
    }

    return this.painting ? 'paint' : 'idle';
  }

  private forceIdle(now: number): PaintMode {
    if (!this.painting) {
      this.wantPaintSince = 0;
      return 'idle';
    }
    if (!this.wantIdleSince) this.wantIdleSince = now;
    if (now - this.wantIdleSince >= CONFIG.PAINT_END_HOLD_MS) {
      this.painting = false;
      this.wantPaintSince = 0;
      this.wantIdleSince = 0;
    }
    return this.painting ? 'paint' : 'idle';
  }

  get isPainting(): boolean {
    return this.painting;
  }
}
