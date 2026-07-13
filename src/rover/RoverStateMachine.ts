import { CONFIG } from '../config';
import type { RoverState } from './types';

export interface StateContext {
  now: number;
  hasPath: boolean;
  hasLock: boolean;
  charge: number;
  lastPaintAt: number;
  lastActivityAt: number;
  overdriveUntil: number;
}

export class RoverStateMachine {
  private state: RoverState = 'Recon';

  get current(): RoverState {
    return this.state;
  }

  reset(): void {
    this.state = 'Recon';
  }

  update(ctx: StateContext): RoverState {
    const { now } = ctx;

    // Overdrive takes priority while active
    if (now < ctx.overdriveUntil) {
      this.state = 'Overdrive';
      return this.state;
    }

    // Trigger overdrive from charged Locked-On / Recon
    if (
      CONFIG.OVERDRIVE_ENABLED &&
      ctx.charge >= CONFIG.OVERDRIVE_CHARGE_THRESHOLD &&
      (this.state === 'LockedOn' || this.state === 'Recon' || this.state === 'Overdrive')
    ) {
      this.state = 'Overdrive';
      return this.state;
    }

    if (ctx.hasLock) {
      this.state = 'LockedOn';
      return this.state;
    }

    const idleMs = now - ctx.lastActivityAt;
    if (idleMs >= CONFIG.STANDBY_AFTER_MS && !ctx.hasPath) {
      this.state = 'Standby';
      return this.state;
    }

    this.state = 'Recon';
    return this.state;
  }
}
