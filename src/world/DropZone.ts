import { CONFIG } from '../config';

export class DropZone {
  x = 0;
  y = 0;
  w = CONFIG.DROP_ZONE_W;
  h = CONFIG.DROP_ZONE_H;

  resetDefault(fieldW: number, fieldH: number): void {
    this.w = CONFIG.DROP_ZONE_W;
    this.h = CONFIG.DROP_ZONE_H;
    const m = CONFIG.DROP_ZONE_MARGIN;
    this.x = fieldW - this.w - m;
    this.y = fieldH - this.h - m;
  }

  placeCenter(cx: number, cy: number): void {
    this.x = cx - this.w * 0.5;
    this.y = cy - this.h * 0.5;
  }

  contains(px: number, py: number): boolean {
    return (
      px >= this.x &&
      px <= this.x + this.w &&
      py >= this.y &&
      py <= this.y + this.h
    );
  }

  get center(): { x: number; y: number } {
    return { x: this.x + this.w * 0.5, y: this.y + this.h * 0.5 };
  }
}
