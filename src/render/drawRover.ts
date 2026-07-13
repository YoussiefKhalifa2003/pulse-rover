import { CONFIG } from '../config';
import type { RoverSnapshot } from '../rover/types';

export function drawRover(
  ctx: CanvasRenderingContext2D,
  rover: RoverSnapshot,
  now: number,
): void {
  // Absorb trails
  for (const t of rover.trails) {
    const age = (now - t.bornAt) / 450;
    const a = Math.max(0, 1 - age);
    ctx.save();
    ctx.globalAlpha = a * 0.5;
    ctx.translate(t.x, t.y);
    ctx.rotate(t.angle);
    ctx.fillStyle = 'rgba(0,220,255,0.8)';
    ctx.fillRect(-10, -3, 16, 6);
    ctx.restore();
  }

  // Boost streaks
  if (rover.state === 'Overdrive') {
    for (let i = 0; i < 5; i++) {
      const back = 18 + i * 10;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 - i * 0.05;
      ctx.translate(
        rover.x - Math.cos(rover.angle) * back,
        rover.y - Math.sin(rover.angle) * back,
      );
      ctx.rotate(rover.angle);
      ctx.fillStyle = 'rgba(255,160,60,0.9)';
      ctx.fillRect(-14, -4, 20, 8);
      ctx.restore();
    }
  }

  ctx.save();
  ctx.translate(rover.x, rover.y);
  ctx.rotate(rover.angle);

  const s = CONFIG.ROVER_SCALE * rover.suspension;
  ctx.scale(s, s);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 10, 28, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Wheels (4 oversized)
  const wheelSpin = rover.wheelSpin;
  const wheels = [
    { x: -16, y: -16 },
    { x: 16, y: -16 },
    { x: -16, y: 16 },
    { x: 16, y: 16 },
  ];
  for (const w of wheels) {
    const bob =
      rover.state === 'Recon' ? Math.sin(now * 0.02 + w.x) * 1.5 : 0;
    drawWheel(ctx, w.x, w.y + bob, wheelSpin);
  }

  // Chassis body
  const bodyGrad = ctx.createLinearGradient(-22, -12, 22, 12);
  bodyGrad.addColorStop(0, '#1a1d22');
  bodyGrad.addColorStop(0.45, '#2a3038');
  bodyGrad.addColorStop(1, '#12151a');
  roundRect(ctx, -22, -12, 44, 24, 5);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Brushed aluminum strip
  ctx.fillStyle = 'rgba(180,190,200,0.55)';
  ctx.fillRect(-18, -3, 36, 2.5);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(-18, -3, 36, 1);

  // Headlights
  if (rover.headlights) {
    ctx.fillStyle = 'rgba(255,240,200,0.95)';
    ctx.beginPath();
    ctx.arc(20, -6, 3, 0, Math.PI * 2);
    ctx.arc(20, 6, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,230,160,0.35)';
    ctx.beginPath();
    ctx.moveTo(22, -8);
    ctx.lineTo(48, -16);
    ctx.lineTo(48, 16);
    ctx.lineTo(22, 8);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // Energy meter on rear deck
  const meterW = 16;
  const meterH = 4;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(-20, -2, meterW, meterH);
  const chargeColor =
    rover.charge > 0.95
      ? 'rgba(255,160,40,0.95)'
      : 'rgba(0,220,255,0.9)';
  ctx.fillStyle = chargeColor;
  ctx.fillRect(-20, -2, meterW * rover.charge, meterH);
  if (rover.charge > 0.01) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-20, -2, meterW, meterH);
  }

  // Sensor turret
  ctx.save();
  ctx.rotate(rover.turretAngle - rover.angle);
  ctx.fillStyle = '#3a424c';
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,210,220,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Spinning dome ring
  const spin = now * (rover.state === 'Standby' ? 0.002 : 0.01);
  ctx.rotate(spin);
  ctx.strokeStyle = 'rgba(0,220,255,0.7)';
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 1.2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,80,100,0.85)';
  ctx.beginPath();
  ctx.arc(5, 0, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Standby / waiting low-power pulse ring
  if (rover.state === 'Standby' || rover.state === 'Waiting') {
    const p = (Math.sin(now * 0.005) + 1) * 0.5;
    ctx.strokeStyle =
      rover.state === 'Waiting'
        ? `rgba(120,200,255,${0.25 + p * 0.4})`
        : `rgba(0,180,220,${0.2 + p * 0.35})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 14 + p * 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawWheel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  spin: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#0d0f12';
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a5560';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.rotate(spin);
  ctx.strokeStyle = '#6a7580';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(5, 0);
  ctx.moveTo(0, -5);
  ctx.lineTo(0, 5);
  ctx.stroke();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
