import * as THREE from 'three';
import { heightAt, WATER_LEVEL, WORLD_SIZE } from '/shared/terrain.js';

const GRAVITY   = -24;
const JUMP_V    = 10.0;
const WALK      = 5.4;
const SPRINT    = 8.6;
const RADIUS    = 0.5;
const EYE       = 1.7;
const STEP_MAX  = 1.3;

export class LocalPlayer {
  constructor(camera, dom, trees) {
    this.camera = camera;
    this.dom = dom;
    this.trees = trees;

    this.pos = new THREE.Vector3(0, 6, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.keys = Object.create(null);
    this.locked = false;
    this.active = false;

    this._bind();
  }

  _bind() {
    this.dom.addEventListener('click', () => {
      if (this.active && !this.locked) {
        this.dom.requestPointerLock?.();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      document.getElementById('hud')?.classList.toggle('locked', this.locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw   -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('blur', () => {
      this.keys = Object.create(null);
    });
  }

  spawn(x, y, z) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.active = true;
  }

  update(dt) {
    if (!this.active) return;

    const fwd    = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const strafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    const sprint = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const speed  = sprint ? SPRINT : WALK;

    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);

    // camera forward (-Z) and right (+X) projected onto XZ
    const fx = -sy, fz = -cy;
    const rx =  cy, rz = -sy;

    let mx = fx * fwd + rx * strafe;
    let mz = fz * fwd + rz * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 1e-4) { mx /= len; mz /= len; } else { mx = mz = 0; }

    /* ---------- horizontal ---------- */
    let nx = this.pos.x + mx * speed * dt;
    let nz = this.pos.z + mz * speed * dt;

    const lim = WORLD_SIZE / 2 - 2;
    nx = Math.max(-lim, Math.min(lim, nx));
    nz = Math.max(-lim, Math.min(lim, nz));

    const blocked = (x, z) =>
      heightAt(x, z) < WATER_LEVEL + 0.25 ||
      (heightAt(x, z) - this.pos.y > STEP_MAX && this.vel.y <= 0);

    let tx = this.pos.x;
    let tz = this.pos.z;

    if (!blocked(nx, nz))          { tx = nx; tz = nz; }
    else if (!blocked(nx, this.pos.z)) { tx = nx; }
    else if (!blocked(this.pos.x, nz)) { tz = nz; }

    /* ---------- tree collision ---------- */
    for (const t of this.trees) {
      const dx = tx - t.x;
      const dz = tz - t.z;
      const rr = 1.05 * t.s + RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        tx = t.x + (dx / d) * rr;
        tz = t.z + (dz / d) * rr;
      }
    }

    this.pos.x = tx;
    this.pos.z = tz;

    /* ---------- vertical ---------- */
    const ground = heightAt(tx, tz);

    if (this.keys['Space'] && this.onGround) {
      this.vel.y = JUMP_V;
      this.onGround = false;
    }

    this.vel.y += GRAVITY * dt;
    this.pos.y += this.vel.y * dt;

    if (this.pos.y <= ground) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    /* ---------- camera ---------- */
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }
}
