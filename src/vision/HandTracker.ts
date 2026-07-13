import {
  FilesetResolver,
  HandLandmarker,
} from '@mediapipe/tasks-vision';
import { CONFIG } from '../config';
import { HandLandmark } from './landmarks';
import type { HandSample, Handedness, Landmark } from './landmarks';

/**
 * Hand landmarker with per-hand landmark EMA. Supports up to NUM_HANDS.
 */
export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private ready = false;
  private lastVideoTime = -1;
  private latest: HandSample[] = [];
  private frameIndex = 0;
  private smoothByKey = new Map<string, Landmark[]>();
  private readonly landmarkAlpha = 0.58;

  async init(wasmBaseUrl: string, modelUrl: string): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl);

    const options = {
      runningMode: 'VIDEO' as const,
      numHands: CONFIG.NUM_HANDS,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    };

    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
        ...options,
      });
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
        ...options,
      });
    }

    this.ready = true;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Primary hand (first) for backward compat. */
  detect(video: HTMLVideoElement, timestampMs: number): HandSample | null {
    const all = this.detectAll(video, timestampMs);
    return all[0] ?? null;
  }

  detectAll(video: HTMLVideoElement, timestampMs: number): HandSample[] {
    if (!this.landmarker || !this.ready) return this.latest;
    if (video.readyState < 2) return this.latest;

    if (video.currentTime === this.lastVideoTime) {
      return this.latest;
    }
    this.lastVideoTime = video.currentTime;
    this.frameIndex++;

    try {
      const ts = Math.max(timestampMs, this.frameIndex);
      const result = this.landmarker.detectForVideo(video, ts);
      const next: HandSample[] = [];
      const seen = new Set<string>();

      const n = result.landmarks?.length ?? 0;
      for (let i = 0; i < n; i++) {
        const hand = result.landmarks[i];
        if (!hand) continue;
        const cat = result.handednesses?.[i]?.[0];
        const label = (cat?.categoryName as Handedness) || 'Unknown';
        const presence = cat?.score ?? 0.9;
        const key = `${label}:${i}`;
        seen.add(key);
        const raw = hand.map((p) => ({ x: p.x, y: p.y, z: p.z }));
        const smoothed = this.emaLandmarks(key, raw);
        next.push({
          landmarks: smoothed,
          presence,
          timestamp: ts,
          handedness: label,
          index: i,
        });
      }

      for (const k of [...this.smoothByKey.keys()]) {
        if (!seen.has(k)) this.smoothByKey.delete(k);
      }

      this.latest = next;
    } catch {
      // keep previous
    }

    return this.latest;
  }

  private emaLandmarks(key: string, raw: Landmark[]): Landmark[] {
    let smooth = this.smoothByKey.get(key);
    if (!smooth || smooth.length !== raw.length) {
      smooth = raw.map((p) => ({ ...p }));
      this.smoothByKey.set(key, smooth);
      return smooth;
    }
    // Index tip / DIP / PIP track faster so the reticle keeps up
    const tipFast = new Set<number>([
      HandLandmark.INDEX_TIP,
      HandLandmark.INDEX_DIP,
      HandLandmark.INDEX_PIP,
      HandLandmark.THUMB_TIP,
    ]);
    for (let i = 0; i < raw.length; i++) {
      const s = smooth[i];
      const r = raw[i];
      const a = tipFast.has(i) ? Math.min(0.9, this.landmarkAlpha + 0.25) : this.landmarkAlpha;
      s.x = s.x * (1 - a) + r.x * a;
      s.y = s.y * (1 - a) + r.y * a;
      s.z = s.z * (1 - a) + r.z * a;
    }
    return smooth;
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.ready = false;
    this.latest = [];
    this.smoothByKey.clear();
  }
}
