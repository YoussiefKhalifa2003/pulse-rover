import { AudioCues } from '../audio/AudioCues';
import { CameraService } from '../camera/CameraService';
import { CONFIG } from '../config';
import { PlasmaPath } from '../path/PlasmaPath';
import { Renderer } from '../render/Renderer';
import { Rover } from '../rover/Rover';
import type { RoverState } from '../rover/types';
import { BootOverlay } from '../ui/BootOverlay';
import { HandTracker } from '../vision/HandTracker';
import { TipPipeline } from '../vision/TipPipeline';
import type { TipState } from '../vision/TipPipeline';

export class GameApp {
  private root: HTMLElement;
  private stage: HTMLElement;
  private stageInner: HTMLElement;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private boot: BootOverlay;
  private clearBtn: HTMLButtonElement;
  private camera: CameraService;
  private tracker = new HandTracker();
  private tipPipe = new TipPipeline();
  private path = new PlasmaPath();
  private rover = new Rover();
  private renderer: Renderer;
  private audio = new AudioCues();

  private running = false;
  private raf = 0;
  private lastTs = 0;
  private fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private clean: boolean;
  private pointerDown = false;
  private pointerErase = false;
  private usePointer = false;
  private eraseKey = false;
  private hasCamera = false;
  /** True from first paint until stroke is committed to the rover. */
  private drawSession = false;
  private paintIdleSince = 0;
  private lastTip: TipState = {
    x: 0,
    y: 0,
    painting: false,
    erasing: false,
    visible: false,
    confidence: 0,
    mode: 'idle',
  };
  private lastState: RoverState = 'Recon';
  private viewW = 1280;
  private viewH = 720;

  constructor(root: HTMLElement) {
    this.root = root;
    this.clean = new URLSearchParams(location.search).has(CONFIG.CLEAN_QUERY);

    this.stage = document.createElement('div');
    this.stage.className = 'stage is-interactive';
    this.stageInner = document.createElement('div');
    this.stageInner.className = 'stage-inner';

    this.video = document.createElement('video');
    this.video.className = 'cam-source';
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;

    this.canvas = document.createElement('canvas');

    this.clearBtn = document.createElement('button');
    this.clearBtn.type = 'button';
    this.clearBtn.className = 'clear-btn';
    this.clearBtn.textContent = 'Clear path';
    if (this.clean) this.clearBtn.classList.add('is-hidden');

    this.stageInner.append(this.video, this.canvas);
    this.stage.append(this.stageInner);
    this.root.append(this.stage, this.clearBtn);

    this.boot = new BootOverlay(this.root);
    this.camera = new CameraService(this.video);
    this.renderer = new Renderer(this.canvas, this.clean);

    this.bindPointer();
    this.bindKeys();
    this.clearBtn.addEventListener('click', () => this.clearPath());
    this.boot.onEngageClick(() => void this.engage());
  }

  private clearPath(): void {
    this.path.unpinStroke();
    this.path.clear();
    this.path.endStroke();
    this.drawSession = false;
    this.paintIdleSince = 0;
    this.rover.setHolding(false);
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyC' && !e.repeat) {
        this.clearPath();
      }
      if (e.code === 'KeyE') this.eraseKey = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyE') this.eraseKey = false;
    });
  }

  private bindPointer(): void {
    const onPos = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * this.canvas.width;
      const y = ((clientY - rect.top) / rect.height) * this.canvas.height;
      return { x, y };
    };

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('pointerdown', (e) => {
      this.usePointer = true;
      this.pointerDown = true;
      this.pointerErase = e.button === 2 || this.eraseKey;
      this.canvas.setPointerCapture(e.pointerId);
      const p = onPos(e.clientX, e.clientY);
      const now = performance.now();
      this.lastTip = this.tipPipe.processPointer(
        p.x,
        p.y,
        true,
        this.pointerErase,
        now,
      );
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.usePointer || !this.pointerDown) return;
      const p = onPos(e.clientX, e.clientY);
      this.lastTip = this.tipPipe.processPointer(
        p.x,
        p.y,
        true,
        this.pointerErase || this.eraseKey,
        performance.now(),
      );
    });

    const end = (e: PointerEvent) => {
      if (!this.pointerDown) return;
      this.pointerDown = false;
      this.pointerErase = false;
      const p = onPos(e.clientX, e.clientY);
      this.lastTip = this.tipPipe.processPointer(
        p.x,
        p.y,
        false,
        false,
        performance.now(),
      );
      setTimeout(() => {
        if (!this.pointerDown) this.usePointer = false;
      }, 400);
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  private async engage(): Promise<void> {
    this.boot.setPhase('loading', 'Requesting camera…');
    await this.audio.unlock();

    try {
      const size = await this.camera.start();
      this.hasCamera = true;
      this.viewW = size.width;
      this.viewH = size.height;
      this.syncCanvasSize();

      this.boot.setPhase('loading', 'Loading hand landmarker…');
      const wasmPath = new URL('mediapipe/', document.baseURI).href;
      const modelPath = new URL(
        'mediapipe/hand_landmarker.task',
        document.baseURI,
      ).href;

      try {
        await this.tracker.init(wasmPath, modelPath);
      } catch (trackErr) {
        console.warn('Hand tracker unavailable, pointer mode only', trackErr);
      }

      const now = performance.now();
      this.rover.init(this.canvas.width, this.canvas.height, now);
      this.boot.setPhase('hidden');
      this.startLoop();
    } catch (err) {
      console.warn(err instanceof Error ? err.message : err);
      this.hasCamera = false;
      this.viewW = Math.min(1280, window.innerWidth);
      this.viewH = Math.min(720, window.innerHeight);
      this.renderer.resize(this.viewW, this.viewH);
      this.fitContain(this.viewW, this.viewH);
      this.usePointer = true;
      this.rover.init(this.viewW, this.viewH, performance.now());
      this.boot.setPhase('hidden');
      this.startLoop();
    }
  }

  /** Fit playfield inside the viewport (letterbox) so the rover never leaves the screen. */
  private fitContain(vw: number, vh: number): void {
    const aspect = vw / vh;
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    let w = winW;
    let h = w / aspect;
    if (h > winH) {
      h = winH;
      w = h * aspect;
    }
    this.stageInner.style.width = `${w}px`;
    this.stageInner.style.height = `${h}px`;
  }

  private syncCanvasSize(): void {
    if (!this.hasCamera || !this.camera.ready) {
      this.viewW = Math.max(640, Math.min(1280, window.innerWidth));
      this.viewH = Math.max(360, Math.min(720, window.innerHeight));
      this.renderer.resize(this.viewW, this.viewH);
      this.rover.resize(this.viewW, this.viewH);
      this.fitContain(this.viewW, this.viewH);
      return;
    }

    const vw = this.video.videoWidth || this.viewW;
    const vh = this.video.videoHeight || this.viewH;
    this.viewW = vw;
    this.viewH = vh;
    this.renderer.resize(vw, vh);
    this.rover.resize(vw, vh);
    this.fitContain(vw, vh);
  }

  private startLoop(): void {
    if (this.running) return;
    this.running = true;
    this.lastTs = performance.now();
    window.addEventListener('resize', () => this.syncCanvasSize());
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private frame(ts: number): void {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    this.lastTs = ts;

    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    // Hand tracking (unless actively mouse-painting)
    if (this.hasCamera && this.camera.ready && this.tracker.isReady) {
      if (!this.pointerDown) {
        const sample = this.tracker.detect(this.video, ts);
        this.lastTip = this.tipPipe.process(
          sample,
          this.canvas.width,
          this.canvas.height,
          ts,
        );
        this.usePointer = false;
      }
    }

    // Paint / erase / draw-then-drive
    if (this.lastTip.erasing || (this.eraseKey && this.lastTip.visible)) {
      this.path.eraseNear(
        this.lastTip.x,
        this.lastTip.y,
        CONFIG.ERASE_RADIUS_PX,
      );
      this.paintIdleSince = 0;
    } else if (this.lastTip.painting) {
      this.paintIdleSince = 0;
      if (!this.drawSession) {
        // New draw session: wipe old path, freeze rover, one stroke only
        this.path.clear();
        this.rover.setHolding(true);
        this.path.beginStroke(this.lastTip.x, this.lastTip.y, ts);
        this.drawSession = true;
      }
      if (this.path.tryAdd(this.lastTip.x, this.lastTip.y, ts)) {
        this.rover.notifyPaint(ts);
      }
    } else if (this.drawSession) {
      // Keep stroke open during brief tracking gaps — only commit after idle
      if (!this.paintIdleSince) this.paintIdleSince = ts;
      if (ts - this.paintIdleSince >= CONFIG.DRIVE_COMMIT_MS) {
        this.path.endStroke();
        this.drawSession = false;
        this.paintIdleSince = 0;
        if (this.path.hasPoints()) {
          this.rover.armPath(this.path);
        } else {
          this.rover.setHolding(false);
        }
      }
    }

    this.path.update(ts);
    this.rover.update(dt, ts, this.path);

    const snap = this.rover.buildSnapshot(this.path);
    if (snap.state !== this.lastState) {
      if (snap.state === 'LockedOn') this.audio.lockOn();
      if (snap.state === 'Overdrive') this.audio.overdrive();
      if (snap.state === 'Standby') this.audio.standby();
      this.lastState = snap.state;
    }

    this.renderer.drawFrame({
      path: this.path,
      rover: snap,
      tip: this.lastTip,
      now: ts,
      fps: this.fps,
      video: this.hasCamera ? this.video : null,
      drawing: this.drawSession,
    });

    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.tracker.dispose();
    this.camera.stop();
  }
}
