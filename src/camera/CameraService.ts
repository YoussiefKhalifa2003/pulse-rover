import { CONFIG } from '../config';

export class CameraService {
  private stream: MediaStream | null = null;
  readonly video: HTMLVideoElement;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
  }

  async start(): Promise<{ width: number; height: number }> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: CONFIG.CAMERA_WIDTH },
          height: { ideal: CONFIG.CAMERA_HEIGHT },
          frameRate: { ideal: CONFIG.CAMERA_FPS, max: CONFIG.CAMERA_FPS },
          facingMode: 'user',
        },
        audio: false,
      });
    } catch {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }

    this.video.srcObject = this.stream;
    await this.video.play();

    await waitForVideo(this.video);

    return {
      width: this.video.videoWidth || CONFIG.CAMERA_WIDTH,
      height: this.video.videoHeight || CONFIG.CAMERA_HEIGHT,
    };
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  get ready(): boolean {
    return this.video.readyState >= 2 && this.video.videoWidth > 0;
  }
}

function waitForVideo(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const onReady = () => {
      if (video.videoWidth > 0) {
        video.removeEventListener('loadeddata', onReady);
        resolve();
      }
    };
    video.addEventListener('loadeddata', onReady);
  });
}
