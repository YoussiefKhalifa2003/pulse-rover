import { CONFIG } from '../config';
import { HandLandmark } from './landmarks';
import type { HandSample, Landmark } from './landmarks';
import { PaintGate } from './PaintGate';
import type { PaintMode } from './PaintGate';
import { TipSmoother } from './TipSmoother';

export interface TipState {
  x: number;
  y: number;
  painting: boolean;
  erasing: boolean;
  visible: boolean;
  hovering: boolean;
  confidence: number;
  mode: PaintMode | 'pointer' | 'pointer-erase';
  pinchDistance: number;
  raw?: { x: number; y: number };
}

export function landmarkToCanvas(
  lx: number,
  ly: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: (1 - lx) * width,
    y: ly * height,
  };
}

export function stylusPoint(landmarks: Landmark[]): { x: number; y: number } {
  const tip = landmarks[HandLandmark.INDEX_TIP];
  const dip = landmarks[HandLandmark.INDEX_DIP];
  const t = CONFIG.TIP_BLEND_DIP;
  return {
    x: tip.x * (1 - t) + dip.x * t,
    y: tip.y * (1 - t) + dip.y * t,
  };
}

export class TipPipeline {
  readonly smoother = new TipSmoother();
  readonly paintGate = new PaintGate();
  private lostSince = 0;
  private holdVisible = false;

  reset(): void {
    this.smoother.reset();
    this.paintGate.reset();
    this.lostSince = 0;
    this.holdVisible = false;
  }

  process(
    sample: HandSample | null,
    width: number,
    height: number,
    now: number,
  ): TipState {
    if (!sample || sample.landmarks.length < 21) {
      if (this.holdVisible && now - this.lostSince < CONFIG.HAND_LOST_GRACE_MS) {
        const pos = this.smoother.position;
        const mode = this.paintGate.update([], 0, now);
        return {
          x: pos?.x ?? width * 0.5,
          y: pos?.y ?? height * 0.5,
          painting: mode === 'paint',
          erasing: false,
          visible: true,
          hovering: mode === 'hover' || mode === 'paint',
          confidence: 0.2,
          mode,
          pinchDistance: this.paintGate.pinchDistance,
        };
      }
      this.paintGate.update([], 0, now);
      this.holdVisible = false;
      return {
        x: this.smoother.position?.x ?? width * 0.5,
        y: this.smoother.position?.y ?? height * 0.5,
        painting: false,
        erasing: false,
        visible: false,
        hovering: false,
        confidence: 0,
        mode: 'idle',
        pinchDistance: 1,
      };
    }

    this.holdVisible = true;
    this.lostSince = now;

    const stylus = stylusPoint(sample.landmarks);
    const raw = landmarkToCanvas(stylus.x, stylus.y, width, height);
    const mode = this.paintGate.update(sample.landmarks, sample.presence, now);
    const smoothed = this.smoother.update(raw.x, raw.y, now);

    return {
      x: smoothed.x,
      y: smoothed.y,
      painting: mode === 'paint',
      erasing: false,
      visible: true,
      hovering: mode === 'hover' || mode === 'paint',
      confidence: sample.presence,
      mode,
      pinchDistance: this.paintGate.pinchDistance,
      raw,
    };
  }

  processPointer(
    x: number,
    y: number,
    down: boolean,
    erase: boolean,
    now: number,
  ): TipState {
    const smoothed = this.smoother.update(x, y, now);
    return {
      x: smoothed.x,
      y: smoothed.y,
      painting: down && !erase,
      erasing: down && erase,
      visible: true,
      hovering: !down,
      confidence: 1,
      mode: down ? (erase ? 'pointer-erase' : 'pointer') : 'hover',
      pinchDistance: down ? 0 : 1,
    };
  }
}
