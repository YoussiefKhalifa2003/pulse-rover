/** Lightweight Web Audio cues — starts only after user gesture. */

import { CONFIG } from '../config';

export class AudioCues {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private lastLock = 0;
  private lastStandby = 0;
  private lastServo = 0;
  private ambient: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.ensureLoops();
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (this.ambientGain) {
      this.ambientGain.gain.value = v ? CONFIG.AMBIENT_GAIN : 0;
    }
    if (!v && this.engineGain) this.engineGain.gain.value = 0;
  }

  toggleMute(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setEngineSpeed(speed: number): void {
    if (!this.enabled || !this.engineGain || !this.engine || !this.ctx) return;
    const n = Math.min(1, Math.abs(speed) / 120);
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(n * CONFIG.ENGINE_GAIN, t, 0.08);
    this.engine.frequency.setTargetAtTime(55 + n * 90, t, 0.1);
  }

  lockOn(): void {
    const now = performance.now();
    if (now - this.lastLock < 800) return;
    this.lastLock = now;
    this.duckAmbient();
    this.beep(880, 0.06, 0.04);
    this.beep(1320, 0.05, 0.03, 0.07);
  }

  overdrive(): void {
    this.sweep(200, 900, 0.35, 0.08);
  }

  standby(): void {
    const now = performance.now();
    if (now - this.lastStandby < 2000) return;
    this.lastStandby = now;
    this.beep(220, 0.12, 0.03);
  }

  paintStart(): void {
    this.beep(720, 0.035, 0.028);
  }

  secure(): void {
    this.duckAmbient();
    this.beep(480, 0.07, 0.05);
    this.beep(360, 0.09, 0.04, 0.06);
  }

  deliver(): void {
    this.duckAmbient();
    this.beep(660, 0.07, 0.05);
    this.beep(990, 0.1, 0.055, 0.08);
    this.beep(1320, 0.14, 0.04, 0.18);
  }

  replaySting(): void {
    this.duckAmbient();
    this.beep(520, 0.08, 0.04);
    this.beep(780, 0.1, 0.05, 0.09);
  }

  servoTick(): void {
    const now = performance.now();
    if (now - this.lastServo < 900) return;
    this.lastServo = now;
    this.beep(1900, 0.02, 0.012);
  }

  maglock(): void {
    this.duckAmbient();
    this.beep(520, 0.06, 0.045);
    this.beep(780, 0.1, 0.05, 0.07);
    this.beep(1040, 0.08, 0.035, 0.14);
  }

  padAcquired(): void {
    this.beep(640, 0.04, 0.03);
  }

  disembark(): void {
    this.beep(280, 0.08, 0.04);
  }

  private ensureLoops(): void {
    if (!this.ctx || this.ambient) return;
    const amb = this.ctx.createOscillator();
    const ag = this.ctx.createGain();
    amb.type = 'sine';
    amb.frequency.value = 90;
    ag.gain.value = this.enabled ? CONFIG.AMBIENT_GAIN : 0;
    amb.connect(ag);
    ag.connect(this.ctx.destination);
    amb.start();
    this.ambient = amb;
    this.ambientGain = ag;

    const eng = this.ctx.createOscillator();
    const eg = this.ctx.createGain();
    eng.type = 'triangle';
    eng.frequency.value = 60;
    eg.gain.value = 0;
    eng.connect(eg);
    eg.connect(this.ctx.destination);
    eng.start();
    this.engine = eng;
    this.engineGain = eg;
  }

  private duckAmbient(): void {
    if (!this.ambientGain || !this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.ambientGain.gain.cancelScheduledValues(t);
    this.ambientGain.gain.setValueAtTime(CONFIG.AMBIENT_GAIN * 0.25, t);
    this.ambientGain.gain.linearRampToValueAtTime(CONFIG.AMBIENT_GAIN, t + 0.45);
  }

  private beep(
    freq: number,
    duration: number,
    gain: number,
    delay = 0,
  ): void {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private sweep(
    from: number,
    to: number,
    duration: number,
    gain: number,
  ): void {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }
}
