import { AudioCues } from '../audio/AudioCues';
import { CameraService } from '../camera/CameraService';
import { CONFIG } from '../config';
import { DirectorCamera } from '../mission/DirectorCamera';
import {
  MissionRecorder,
  pathLengthOf,
} from '../mission/MissionRecorder';
import { MissionReplay } from '../mission/MissionReplay';
import {
  loadSessionStats,
  recordSuccess,
  scoreMission,
  type MissionAnalysis,
  type SessionStats,
} from '../mission/MissionScore';
import { snapshotFromTelemetry } from '../mission/telemetryView';
import type { MissionLog, TheaterMode } from '../mission/types';
import { PlasmaPath } from '../path/PlasmaPath';
import { DeskLightProbe } from '../render/DeskLightProbe';
import { Renderer } from '../render/Renderer';
import { Rover } from '../rover/Rover';
import type { RoverState } from '../rover/types';
import { BootOverlay } from '../ui/BootOverlay';
import { FirstRunCoach } from '../ui/FirstRunCoach';
import { HandRoles } from '../vision/HandRoles';
import { HandTracker } from '../vision/HandTracker';
import { TipPipeline } from '../vision/TipPipeline';
import type { TipState } from '../vision/TipPipeline';
import type { PalmGeom } from '../vision/handGeometry';
import { pinchDist } from '../vision/handGeometry';
import { Cargo } from '../world/Cargo';
import { DropZone } from '../world/DropZone';

type PlaceMode = 'none' | 'core' | 'zone';

export class GameApp {
  private root: HTMLElement;
  private stage: HTMLElement;
  private stageInner: HTMLElement;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private boot: BootOverlay;
  private coach: FirstRunCoach;
  private toolbar: HTMLElement;
  private clearBtn: HTMLButtonElement;
  private deployBtn: HTMLButtonElement;
  private placeCoreBtn: HTMLButtonElement;
  private resetZoneBtn: HTMLButtonElement;
  private camera: CameraService;
  private tracker = new HandTracker();
  private tipPipe = new TipPipeline();
  private handRoles = new HandRoles();
  private path = new PlasmaPath();
  private rover = new Rover();
  private cargo = new Cargo();
  private dropZone = new DropZone();
  private renderer: Renderer;
  private audio = new AudioCues();
  private recorder = new MissionRecorder();
  private replay = new MissionReplay();
  private director = new DirectorCamera();
  private lightProbe = new DeskLightProbe();

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
  private drawSession = false;
  private paintIdleSince = 0;
  private wasPainting = false;
  private paintStartedAt = 0;
  private paintDurationMs = 0;
  private placeMode: PlaceMode = 'none';
  private theaterMode: TheaterMode = 'off';
  private theaterLog: MissionLog | null = null;
  private theaterAnalysis: MissionAnalysis | null = null;
  private session: SessionStats = loadSessionStats();
  private lastPalmGeom: PalmGeom | null = null;
  private deliverLabel: string | null = null;
  private lastTip: TipState = {
    x: 0,
    y: 0,
    painting: false,
    erasing: false,
    visible: false,
    hovering: false,
    confidence: 0,
    mode: 'idle',
    pinchDistance: 1,
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

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'toolbar';
    if (this.clean) this.toolbar.classList.add('is-hidden');

    this.clearBtn = this.makeBtn('Clear path', 'clear-btn');
    this.deployBtn = this.makeBtn('Deploy Core', 'tool-btn');
    this.placeCoreBtn = this.makeBtn('Place Core', 'tool-btn');
    this.resetZoneBtn = this.makeBtn('Reset Zone', 'tool-btn');
    this.toolbar.append(
      this.clearBtn,
      this.deployBtn,
      this.placeCoreBtn,
      this.resetZoneBtn,
    );

    this.stageInner.append(this.video, this.canvas);
    this.stage.append(this.stageInner);
    this.root.append(this.stage, this.toolbar);

    this.boot = new BootOverlay(this.root);
    this.coach = new FirstRunCoach(this.root);
    this.camera = new CameraService(this.video);
    this.renderer = new Renderer(this.canvas, this.clean);

    this.bindPointer();
    this.bindKeys();
    this.clearBtn.addEventListener('click', () => this.clearPath());
    this.deployBtn.addEventListener('click', () => this.deployCore());
    this.placeCoreBtn.addEventListener('click', () =>
      this.setPlaceMode(this.placeMode === 'core' ? 'none' : 'core'),
    );
    this.resetZoneBtn.addEventListener('click', () => this.resetZone());
    this.boot.onEngageClick(() => void this.engage());
  }

  private makeBtn(label: string, className: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = label;
    return b;
  }

  private setPlaceMode(mode: PlaceMode): void {
    this.placeMode = mode;
    this.placeCoreBtn.classList.toggle('is-active', mode === 'core');
    this.canvas.style.cursor = mode === 'core' ? 'cell' : 'crosshair';
  }

  private deployCore(): void {
    if (this.theaterMode !== 'off') return;
    const x =
      this.lastTip.visible && this.lastTip.hovering
        ? this.lastTip.x
        : this.canvas.width * 0.5;
    const y =
      this.lastTip.visible && this.lastTip.hovering
        ? this.lastTip.y
        : this.canvas.height * 0.45;
    this.cargo.deploy(x, y);
    this.setPlaceMode('none');
    this.coach.notify('deploy');
  }

  private resetZone(): void {
    this.dropZone.resetDefault(this.canvas.width, this.canvas.height);
  }

  private clearPath(): void {
    if (this.theaterMode === 'replay') {
      this.exitTheater();
      return;
    }
    this.recorder.cancel();
    this.rover.abortMission(this.path);
    this.path.unpinStroke();
    this.path.clear();
    this.path.endStroke();
    this.drawSession = false;
    this.paintIdleSince = 0;
    this.wasPainting = false;
    this.deliverLabel = null;
  }

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyC' && !e.repeat) this.clearPath();
      if (e.code === 'KeyE') this.eraseKey = true;
      if (e.code === 'KeyM' && !e.repeat) this.audio.toggleMute();
      if (e.code === 'Escape') {
        if (this.theaterMode !== 'off') this.exitTheater();
        else this.setPlaceMode('none');
      }
      if (e.code === 'Space' && this.theaterMode === 'replay') {
        e.preventDefault();
        this.replay.skipToEnd();
      }
      if (e.code === 'KeyR' && !e.repeat) {
        if (this.theaterMode === 'off' && this.theaterLog) {
          this.enterTheater(this.theaterLog);
        } else if (this.theaterMode === 'replay') {
          this.restartReplay();
        }
      }
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
      if (this.theaterMode !== 'off') return;
      const p = onPos(e.clientX, e.clientY);

      if (this.placeMode === 'core' && e.button === 0) {
        this.cargo.deploy(p.x, p.y);
        this.setPlaceMode('none');
        this.coach.notify('deploy');
        return;
      }

      this.usePointer = true;
      this.pointerDown = true;
      this.pointerErase = e.button === 2 || this.eraseKey;
      this.canvas.setPointerCapture(e.pointerId);
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
      if (!this.usePointer || !this.pointerDown || this.theaterMode !== 'off')
        return;
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
      this.dropZone.resetDefault(this.canvas.width, this.canvas.height);
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
      this.dropZone.resetDefault(this.viewW, this.viewH);
      this.boot.setPhase('hidden');
      this.startLoop();
    }
  }

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
      this.dropZone.resetDefault(this.viewW, this.viewH);
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

  private startRecording(now: number): void {
    if (!this.cargo.present || this.cargo.status === 'delivered') return;
    const route = this.rover.getFrozenRoute();
    if (route.length === 0) return;
    this.recorder.start({
      route,
      zone: this.dropZone,
      cargo: this.cargo,
      pathLength: pathLengthOf(route),
      paintDurationMs: this.paintDurationMs,
      fieldW: this.canvas.width,
      fieldH: this.canvas.height,
      now,
    });
  }

  private enterTheater(log: MissionLog): void {
    this.theaterLog = log;
    this.theaterAnalysis = scoreMission(log);
    this.director.reset(log);
    this.replay.start(log);
    this.theaterMode = 'replay';
    this.audio.replaySting();
    this.deliverLabel = null;
  }

  private restartReplay(): void {
    if (!this.theaterLog) return;
    this.director.reset(this.theaterLog);
    this.replay.start(this.theaterLog);
    this.theaterMode = 'replay';
    this.audio.replaySting();
  }

  private exitTheater(): void {
    this.theaterMode = 'off';
  }

  private frame(ts: number): void {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000);
    const dtMs = dt * 1000;
    this.lastTs = ts;

    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    // ——— OPTIONAL REPLAY (R) ———
    if (this.theaterMode === 'replay' && this.theaterLog && this.theaterAnalysis) {
      const stage = this.replay.update(dtMs);
      const sample = this.replay.sampleAt();
      this.director.update(dt, sample, this.theaterLog, stage === 'cold');

      if (sample) {
        this.cargo.x = sample.cargoX;
        this.cargo.y = sample.cargoY;
        this.cargo.status = sample.cargoStatus;
        this.cargo.present = true;
        this.audio.setEngineSpeed(sample.speed);
      }

      const roverSnap = sample
        ? snapshotFromTelemetry(sample, this.theaterLog)
        : this.rover.buildSnapshot(this.path);

      this.renderer.drawFrame({
        mode: 'theater',
        path: this.path,
        rover: roverSnap,
        tip: this.lastTip,
        now: ts,
        fps: this.fps,
        video: this.hasCamera ? this.video : null,
        drawing: false,
        cargo: this.cargo,
        dropZone: this.dropZone,
        theater: {
          log: this.theaterLog,
          camera: this.director,
          callout: this.replay.callout,
          cold: stage === 'cold',
          simLabel: `${(this.replay.simTime / 1000).toFixed(1)}s`,
          analysis: this.theaterAnalysis,
          progress: this.replay.progress,
        },
      });

      if (stage === 'done') this.exitTheater();
      this.raf = requestAnimationFrame((t) => this.frame(t));
      return;
    }

    // ——— LIVE ———
    let padBlocksPaint = false;
    this.lastPalmGeom = null;

    if (this.hasCamera && this.camera.ready && this.tracker.isReady) {
      if (!this.pointerDown) {
        const hands = this.tracker.detectAll(this.video, ts);
        let roles = this.handRoles.resolve(
          hands,
          this.canvas.width,
          this.canvas.height,
          ts,
        );

        // Mid-stroke / active pinch: paint owns the tip — never interrupt smoother
        const paintOwns =
          this.drawSession ||
          this.tipPipe.paintGate.isPainting ||
          (roles.stylus !== null &&
            roles.stylus.landmarks.length >= 21 &&
            pinchDist(roles.stylus.landmarks) < CONFIG.PINCH_OFF);

        if (paintOwns) {
          this.handRoles.suppressPadForPaint();
          const stylusHand =
            roles.stylus ??
            hands.find((h) => pinchDist(h.landmarks) < CONFIG.PINCH_OFF) ??
            hands[0] ??
            null;
          roles = {
            stylus: stylusHand,
            pad: { active: false, confidence: 0, geom: null, sample: null },
            padModeBlocksPaint: false,
          };
        }

        padBlocksPaint = roles.padModeBlocksPaint && !paintOwns;
        this.lastPalmGeom = roles.pad.active ? roles.pad.geom : null;

        this.lastTip = this.tipPipe.process(
          roles.stylus,
          this.canvas.width,
          this.canvas.height,
          ts,
        );
        if (padBlocksPaint) {
          this.lastTip = {
            ...this.lastTip,
            painting: false,
            hovering: false,
            mode: 'idle',
          };
        }

        const allowBoard =
          !paintOwns &&
          !this.drawSession &&
          !this.lastTip.painting &&
          !this.pointerDown &&
          this.theaterMode === 'off' &&
          !this.rover.isCelebrating &&
          roles.pad.active;

        this.rover.setMagDockInput(
          allowBoard || roles.pad.active
            ? {
                padActive: roles.pad.active && !paintOwns,
                confidence: paintOwns ? 0 : roles.pad.confidence,
                geom: paintOwns ? null : roles.pad.geom,
                allowBoard,
                cargoX: this.cargo.present ? this.cargo.x : null,
                cargoY: this.cargo.present ? this.cargo.y : null,
                fieldH: this.canvas.height,
              }
            : {
                padActive: false,
                confidence: 0,
                geom: null,
                allowBoard: false,
                cargoX: this.cargo.present ? this.cargo.x : null,
                cargoY: this.cargo.present ? this.cargo.y : null,
                fieldH: this.canvas.height,
              },
        );

        if (roles.pad.active && !paintOwns) this.coach.notify('hover');
        this.usePointer = false;
      }
    } else {
      this.rover.setMagDockInput(null);
    }

    if (this.lastTip.visible && this.lastTip.hovering && !this.lastTip.painting) {
      this.coach.notify('hover');
    }

    const canHover =
      this.lastTip.visible &&
      !this.lastTip.painting &&
      !this.lastTip.erasing &&
      !this.drawSession &&
      this.rover.magdockPhase === 'free';
    if (canHover) {
      this.rover.setHoverTarget(this.lastTip.x, this.lastTip.y);
    } else if (
      this.lastTip.painting ||
      this.drawSession ||
      this.rover.magdockPhase !== 'free'
    ) {
      this.rover.setHoverTarget(null, null);
    }

    if (this.lastTip.erasing || (this.eraseKey && this.lastTip.visible)) {
      this.path.eraseNear(
        this.lastTip.x,
        this.lastTip.y,
        CONFIG.ERASE_RADIUS_PX,
      );
      this.paintIdleSince = 0;
    } else if (this.lastTip.painting && !padBlocksPaint) {
      if (!this.wasPainting) {
        this.audio.paintStart();
        this.paintStartedAt = ts;
        this.coach.notify('paint');
      }
      this.wasPainting = true;
      this.paintIdleSince = 0;
      if (!this.drawSession) {
        this.path.clear();
        this.rover.setHolding(true);
        this.path.beginStroke(this.lastTip.x, this.lastTip.y, ts);
        this.drawSession = true;
      }
      if (this.path.tryAdd(this.lastTip.x, this.lastTip.y, ts)) {
        this.rover.notifyPaint(ts);
      }
    } else if (this.drawSession) {
      this.wasPainting = false;
      if (!this.paintIdleSince) this.paintIdleSince = ts;
      if (ts - this.paintIdleSince >= CONFIG.DRIVE_COMMIT_MS) {
        this.path.endStroke();
        this.drawSession = false;
        this.paintIdleSince = 0;
        this.paintDurationMs = this.paintStartedAt
          ? ts - this.paintStartedAt
          : 0;
        if (this.path.hasPoints()) {
          this.rover.armPath(
            this.path,
            this.cargo.present ? this.cargo : null,
            this.dropZone,
          );
          this.coach.notify('commit');
          if (this.cargo.present && this.cargo.status !== 'delivered') {
            this.startRecording(ts);
          }
        } else {
          this.rover.setHolding(false);
        }
      }
    } else {
      this.wasPainting = false;
    }

    this.rover.bindWorld(this.cargo, this.dropZone);
    this.path.update(ts);
    this.rover.update(dt, ts, this.path);

    let snap = this.rover.buildSnapshot(this.path);
    const glow = this.lightProbe.update(
      this.hasCamera ? this.video : null,
      snap.x,
      snap.y,
      this.canvas.width,
      this.canvas.height,
      ts,
    );
    this.rover.setGlowTint(glow);
    snap = this.rover.buildSnapshot(this.path);

    if (this.recorder.isRecording) {
      this.recorder.sample(snap, this.cargo, ts, glow);
    }

    const events = this.rover.consumeEvents();
    if (events.padAcquired) this.audio.padAcquired();
    if (events.maglock) {
      this.audio.maglock();
      this.coach.notify('maglock');
    }
    if (events.disembark) this.audio.disembark();
    if (snap.magdockPhase === 'airborne') {
      this.coach.notify('ride');
    }
    if (events.secured) this.audio.secure();
    if (events.delivered) {
      this.audio.deliver();
      const log = this.recorder.finalize(ts);
      if (log) {
        this.theaterLog = log;
        this.theaterAnalysis = scoreMission(log);
        this.session = recordSuccess(log.durationMs);
        this.deliverLabel = `DELIVERED · ${(log.durationMs / 1000).toFixed(1)}s`;
      } else {
        this.deliverLabel = 'DELIVERED';
      }
    }

    if (snap.quietDeliverUntil > 0 && ts > snap.quietDeliverUntil) {
      this.deliverLabel = null;
    }

    if (
      (snap.personalityMode === 'idle' && snap.state === 'Recon') ||
      snap.magdockPhase === 'hesitating' ||
      snap.magdockPhase === 'evaluating'
    ) {
      this.audio.servoTick();
    }
    this.audio.setEngineSpeed(snap.speed);

    if (snap.state !== this.lastState) {
      if (snap.state === 'LockedOn' && snap.magdockPhase === 'free') {
        this.audio.lockOn();
      }
      if (snap.state === 'Overdrive') this.audio.overdrive();
      if (snap.state === 'Standby') this.audio.standby();
      this.lastState = snap.state;
    }

    this.renderer.drawFrame({
      mode: 'live',
      path: this.path,
      rover: snap,
      tip: this.lastTip,
      now: ts,
      fps: this.fps,
      video: this.hasCamera ? this.video : null,
      drawing: this.drawSession,
      cargo: this.cargo,
      dropZone: this.dropZone,
      palmGeom: this.lastPalmGeom,
      quietDeliverLabel: this.deliverLabel,
      bestTimeMs: this.session.bestTimeMs,
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
