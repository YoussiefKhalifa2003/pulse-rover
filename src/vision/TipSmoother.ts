import { CONFIG } from '../config';

/**
 * One Euro Filter — low jitter at low speed, responsive when moving fast.
 * Casiez et al. CHI 2012.
 */
export class OneEuroFilter {
  private x = 0;
  private dx = 0;
  private lastT = -1;
  private initialized = false;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  constructor(
    minCutoff = CONFIG.ONE_EURO_MIN_CUTOFF,
    beta = CONFIG.ONE_EURO_BETA,
    dCutoff = CONFIG.ONE_EURO_D_CUTOFF,
  ) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  reset(): void {
    this.initialized = false;
    this.lastT = -1;
  }

  filter(value: number, timestampMs: number): number {
    if (!this.initialized) {
      this.initialized = true;
      this.x = value;
      this.dx = 0;
      this.lastT = timestampMs;
      return value;
    }

    let dt = (timestampMs - this.lastT) / 1000;
    if (dt <= 0 || dt > 0.5) dt = 1 / 60;
    this.lastT = timestampMs;

    const edx = (value - this.x) / dt;
    this.dx = lowpass(this.dx, edx, alpha(dt, this.dCutoff));
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x = lowpass(this.x, value, alpha(dt, cutoff));
    return this.x;
  }
}

function alpha(dt: number, cutoff: number): number {
  const tau = 1 / (2 * Math.PI * Math.max(1e-6, cutoff));
  return 1 / (1 + tau / dt);
}

function lowpass(prev: number, value: number, a: number): number {
  return prev + a * (value - prev);
}

/** Sliding-window median — kills single-frame landmark spikes. */
export class MedianBuffer {
  private buf: number[] = [];
  private size: number;

  constructor(size: number) {
    this.size = size;
  }

  reset(): void {
    this.buf.length = 0;
  }

  push(v: number): number {
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
    const sorted = [...this.buf].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) * 0.5
      : sorted[mid];
  }
}

export class TipSmoother {
  private mx = new MedianBuffer(CONFIG.MEDIAN_WINDOW);
  private my = new MedianBuffer(CONFIG.MEDIAN_WINDOW);
  private fx = new OneEuroFilter();
  private fy = new OneEuroFilter();
  private x = 0;
  private y = 0;
  private initialized = false;

  reset(): void {
    this.mx.reset();
    this.my.reset();
    this.fx.reset();
    this.fy.reset();
    this.initialized = false;
  }

  update(rawX: number, rawY: number, timestampMs: number): { x: number; y: number } {
    let nx = rawX;
    let ny = rawY;
    if (this.initialized) {
      const jump = Math.hypot(nx - this.x, ny - this.y);
      if (jump > CONFIG.TIP_MAX_JUMP_PX) {
        const t = CONFIG.TIP_MAX_JUMP_PX / jump;
        nx = this.x + (nx - this.x) * t;
        ny = this.y + (ny - this.y) * t;
      }
    }

    const medX = this.mx.push(nx);
    const medY = this.my.push(ny);
    this.x = this.fx.filter(medX, timestampMs);
    this.y = this.fy.filter(medY, timestampMs);
    this.initialized = true;
    return { x: this.x, y: this.y };
  }

  get position(): { x: number; y: number } | null {
    return this.initialized ? { x: this.x, y: this.y } : null;
  }
}
