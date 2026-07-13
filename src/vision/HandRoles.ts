import { CONFIG } from '../config';
import { measurePalm, pinchDist } from './handGeometry';
import type { HandSample } from './landmarks';
import type { PalmPadState } from './PalmGate';
import { PalmGate } from './PalmGate';

export interface HandRoleResult {
  stylus: HandSample | null;
  pad: PalmPadState;
  padModeBlocksPaint: boolean;
}

function paintIntent(sample: HandSample): boolean {
  return pinchDist(sample.landmarks) < CONFIG.PINCH_OFF;
}

/**
 * Assign pad vs stylus roles (hybrid dual/single hand).
 * Paint / pinch always wins over MagDock on the same hand.
 */
export class HandRoles {
  private palmGate = new PalmGate();
  private stickyPadIndex: number | null = null;

  reset(): void {
    this.palmGate.reset();
    this.stickyPadIndex = null;
  }

  /** Call while mid-stroke so MagDock cannot interrupt tip smoothing. */
  suppressPadForPaint(): void {
    this.palmGate.forceImmediateOff();
    this.stickyPadIndex = null;
  }

  resolve(
    hands: HandSample[],
    width: number,
    height: number,
    now: number,
  ): HandRoleResult {
    if (hands.length === 0) {
      this.stickyPadIndex = null;
      return {
        stylus: null,
        pad: this.palmGate.update(null, width, height, now),
        padModeBlocksPaint: false,
      };
    }

    if (hands.length === 1) {
      const h = hands[0];

      // Pinch / paint intent: stylus only — never MagDock on this frame
      if (paintIntent(h)) {
        this.palmGate.forceImmediateOff();
        this.stickyPadIndex = null;
        return {
          stylus: h,
          pad: { active: false, confidence: 0, geom: null, sample: null },
          padModeBlocksPaint: false,
        };
      }

      const pad = this.palmGate.update(h, width, height, now);
      if (pad.active) {
        this.stickyPadIndex = h.index;
        return { stylus: null, pad, padModeBlocksPaint: true };
      }
      this.stickyPadIndex = null;
      return { stylus: h, pad, padModeBlocksPaint: false };
    }

    // Two hands: pinching hand is always stylus; other may be pad
    const pinching = hands.find((h) => paintIntent(h)) ?? null;
    let bestPad: HandSample | null = null;
    let bestScore = -1;

    for (const h of hands) {
      if (pinching && h.index === pinching.index) continue;
      if (paintIntent(h)) continue;
      const g = measurePalm(h.landmarks, width, height);
      if (g.extension < CONFIG.PALM_EXTENSION_MIN) continue;
      const score = g.flatness;
      if (score > bestScore) {
        bestScore = score;
        bestPad = h;
      }
    }

    if (this.stickyPadIndex !== null && !pinching) {
      const sticky = hands.find((h) => h.index === this.stickyPadIndex);
      if (
        sticky &&
        !paintIntent(sticky) &&
        measurePalm(sticky.landmarks, width, height).extension >=
          CONFIG.PALM_EXTENSION_MIN * 0.85
      ) {
        bestPad = sticky;
      }
    }

    // If one hand is painting, only feed the other into PalmGate
    const padSample = bestPad;
    const pad = this.palmGate.update(padSample, width, height, now);
    if (pad.active && bestPad) this.stickyPadIndex = bestPad.index;
    else if (!pad.active) this.stickyPadIndex = null;

    const stylus =
      pinching ??
      hands.find((h) => !bestPad || h.index !== bestPad.index) ??
      null;

    return {
      stylus,
      pad,
      padModeBlocksPaint: false,
    };
  }
}
