import { CONFIG } from '../config';

/**
 * Sample desk lighting under the rover from the mirrored video frame.
 */
export class DeskLightProbe {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lastAt = 0;
  tint: { r: number; g: number; b: number } = {
    r: CONFIG.UNDERGLOW_COLOR.r,
    g: CONFIG.UNDERGLOW_COLOR.g,
    b: CONFIG.UNDERGLOW_COLOR.b,
  };

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CONFIG.LIGHT_PROBE_SIZE;
    this.canvas.height = CONFIG.LIGHT_PROBE_SIZE;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('probe ctx');
    this.ctx = ctx;
  }

  update(
    video: HTMLVideoElement | null,
    roverX: number,
    roverY: number,
    fieldW: number,
    fieldH: number,
    now: number,
  ): { r: number; g: number; b: number } {
    if (!video || video.readyState < 2 || video.videoWidth <= 0) {
      return this.tint;
    }
    if (now - this.lastAt < CONFIG.LIGHT_PROBE_MS) return this.tint;
    this.lastAt = now;

    const s = CONFIG.LIGHT_PROBE_SIZE;
    // Video is mirrored on main canvas: sample mirrored X
    const nx = 1 - roverX / Math.max(1, fieldW);
    const ny = roverY / Math.max(1, fieldH);
    const sx = Math.max(0, Math.min(video.videoWidth - s, nx * video.videoWidth - s * 0.5));
    const sy = Math.max(0, Math.min(video.videoHeight - s, ny * video.videoHeight - s * 0.5));

    this.ctx.drawImage(video, sx, sy, s, s, 0, 0, s, s);
    const data = this.ctx.getImageData(0, 0, s, s).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const n = s * s;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    r /= n;
    g /= n;
    b /= n;

    // Blend toward cyan underglow identity so it's still sci-fi
    this.tint = {
      r: Math.round(r * 0.45 + CONFIG.UNDERGLOW_COLOR.r * 0.55),
      g: Math.round(g * 0.45 + CONFIG.UNDERGLOW_COLOR.g * 0.55),
      b: Math.round(b * 0.35 + CONFIG.UNDERGLOW_COLOR.b * 0.65),
    };
    return this.tint;
  }
}
