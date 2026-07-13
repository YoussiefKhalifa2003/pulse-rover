import {
  FilesetResolver,
  HandLandmarker,
} from '@mediapipe/tasks-vision';
import type { HandSample, Landmark } from './landmarks';

/**
 * Hand landmarker with temporal landmark EMA to cut frame-to-frame noise
 * before tip/paint logic runs.
 */
export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private ready = false;
  private lastVideoTime = -1;
  private latest: HandSample | null = null;
  private frameIndex = 0;
  private smoothLandmarks: Landmark[] | null = null;
  private readonly landmarkAlpha = 0.35;

  async init(wasmBaseUrl: string, modelUrl: string): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(wasmBaseUrl);

    const options = {
      runningMode: 'VIDEO' as const,
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
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

  detect(video: HTMLVideoElement, timestampMs: number): HandSample | null {
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
      const hand = result.landmarks[0];
      if (hand) {
        const presence = result.handednesses?.[0]?.[0]?.score ?? 0.9;
        const raw = hand.map((p) => ({ x: p.x, y: p.y, z: p.z }));
        const smoothed = this.emaLandmarks(raw);
        this.latest = {
          landmarks: smoothed,
          presence,
          timestamp: ts,
        };
      } else {
        // Don't instantly null — keep last for a moment via TipPipeline grace
        this.smoothLandmarks = null;
        this.latest = null;
      }
    } catch {
      // keep previous
    }

    return this.latest;
  }

  private emaLandmarks(raw: Landmark[]): Landmark[] {
    if (!this.smoothLandmarks || this.smoothLandmarks.length !== raw.length) {
      this.smoothLandmarks = raw.map((p) => ({ ...p }));
      return this.smoothLandmarks;
    }
    const a = this.landmarkAlpha;
    for (let i = 0; i < raw.length; i++) {
      const s = this.smoothLandmarks[i];
      const r = raw[i];
      s.x = s.x * (1 - a) + r.x * a;
      s.y = s.y * (1 - a) + r.y * a;
      s.z = s.z * (1 - a) + r.z * a;
    }
    return this.smoothLandmarks;
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.ready = false;
    this.latest = null;
    this.smoothLandmarks = null;
  }
}
