import { CONFIG } from '../config';

export type CargoStatus = 'idle' | 'targeted' | 'secured' | 'delivered';

export class Cargo {
  x = 0;
  y = 0;
  size = CONFIG.CARGO_SIZE;
  status: CargoStatus = 'idle';
  present = false;

  deploy(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.size = CONFIG.CARGO_SIZE;
    this.status = 'idle';
    this.present = true;
  }

  clear(): void {
    this.present = false;
    this.status = 'idle';
  }

  setStatus(s: CargoStatus): void {
    this.status = s;
  }

  /** Parent to rover bumper while secured. */
  attachTo(rx: number, ry: number, angle: number): void {
    if (this.status !== 'secured') return;
    const o = CONFIG.GRIP_OFFSET;
    this.x = rx + Math.cos(angle) * o;
    this.y = ry + Math.sin(angle) * o;
  }

  isNear(x: number, y: number, radius = CONFIG.CARGO_PICKUP_RADIUS): boolean {
    if (!this.present || this.status === 'delivered') return false;
    const dx = this.x - x;
    const dy = this.y - y;
    return Math.hypot(dx, dy) <= radius;
  }
}
