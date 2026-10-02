// Grid-based A* with jump edges. Used by the server's Nextbot AI.

import { heightAt, WATER_LEVEL, WORLD_SIZE } from './terrain.js';

export const CELL = 2.5;
export const GRID = Math.ceil(WORLD_SIZE / CELL);   // 160
export const HALF = WORLD_SIZE / 2;
export const SIZE = GRID * GRID;

const STEP_UP  = 0.70;   // walkable rise
const JUMP_UP  = 2.85;   // maximum jumpable rise
const FALL_MAX = 6.00;   // do not leap off cliffs taller than this

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const COST = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

/* ---------- grid ---------- */

const H = new Float32Array(SIZE);
let built = false;

export function buildGrid() {
  if (built) return;
  for (let cz = 0; cz < GRID; cz++) {
    const wz = (cz + 0.5) * CELL - HALF;
    for (let cx = 0; cx < GRID; cx++) {
      const wx = (cx + 0.5) * CELL - HALF;
      H[cz * GRID + cx] = heightAt(wx, wz);
    }
  }
  built = true;
}

export function cellOf(x, z) {
  return {
    cx: Math.floor((x + HALF) / CELL),
    cz: Math.floor((z + HALF) / CELL)
  };
}

export function worldOf(cx, cz) {
  return { x: (cx + 0.5) * CELL - HALF, z: (cz + 0.5) * CELL - HALF };
}

export function inBounds(cx, cz) {
  return cx >= 0 && cz >= 0 && cx < GRID && cz < GRID;
}

export function walkable(cx, cz) {
  return inBounds(cx, cz) && H[cz * GRID + cx] > WATER_LEVEL + 0.4;
}

function nearestWalkable(cx, cz, radius) {
  if (walkable(cx, cz)) return { cx, cz };
  for (let r = 1; r <= radius; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        if (walkable(cx + dx, cz + dz)) return { cx: cx + dx, cz: cz + dz };
      }
    }
  }
  return null;
}

/* ---------- search buffers ---------- */

const gScore = new Float32Array(SIZE);
const from   = new Int32Array(SIZE);
const seen   = new Int32Array(SIZE);
const closed = new Int32Array(SIZE);
let epoch = 0;

class MinHeap {
  constructor() { this.idx = []; this.key = []; }
  clear() { this.idx.length = 0; this.key.length = 0; }
  get size() { return this.idx.length; }
  push(i, k) {
    this.idx.push(i); this.key.push(k);
    let c = this.idx.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.key[p] <= this.key[c]) break;
      this._sw(p, c); c = p;
    }
  }
  pop() {
    const top = this.idx[0];
    const li = this.idx.pop(), lk = this.key.pop();
    if (this.idx.length) {
      this.idx[0] = li; this.key[0] = lk;
      const n = this.idx.length;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1, r = l + 1;
        let m = p;
        if (l < n && this.key[l] < this.key[m]) m = l;
        if (r < n && this.key[r] < this.key[m]) m = r;
        if (m === p) break;
        this._sw(p, m); p = m;
      }
    }
    return top;
  }
  _sw(a, b) {
    const i = this.idx[a]; this.idx[a] = this.idx[b]; this.idx[b] = i;
    const k = this.key[a]; this.key[a] = this.key[b]; this.key[b] = k;
  }
}

const heap = new MinHeap();

/* ---------- heuristics ---------- */

function octile(a, b) {
  const ax = a % GRID, az = (a / GRID) | 0;
  const bx = b % GRID, bz = (b / GRID) | 0;
  const dx = Math.abs(ax - bx), dz = Math.abs(az - bz);
  const mn = Math.min(dx, dz), mx = Math.max(dx, dz);
  return (mx - mn) + mn * Math.SQRT2;
}

/* ---------- line of sight (grid-based, cheap) ---------- */

function lineClear(ax, az, bx, bz) {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(2, Math.ceil(dist / (CELL * 0.6)));
  let ph = H[(Math.max(0, Math.min(GRID - 1, Math.floor((az + HALF) / CELL)))) * GRID +
             Math.max(0, Math.min(GRID - 1, Math.floor((ax + HALF) / CELL)))];

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const cx = Math.floor((x + HALF) / CELL);
    const cz = Math.floor((z + HALF) / CELL);
    if (!inBounds(cx, cz)) return false;
    const hh = H[cz * GRID + cx];
    if (hh <= WATER_LEVEL + 0.4) return false;
    if (hh - ph > JUMP_UP) return false;
    if (hh - ph < -FALL_MAX) return false;
    ph = hh;
  }
  return true;
}

function stringPull(cells) {
  if (cells.length < 3) return cells;
  const out = [];
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    for (; j > i + 1; j--) {
      if (lineClear(cells[i].x, cells[i].z, cells[j].x, cells[j].z)) break;
    }
    out.push(cells[j]);
    i = j;
  }
  return out;
}

/* ---------- public API ---------- */

/**
 * A* from world (sx,sz) to world (gx,gz).
 * Returns an array of world-space waypoints, or null.
 */
export function findPath(sx, sz, gx, gz, maxNodes = 6000) {
  buildGrid();

  const s = cellOf(sx, sz);
  let goal = cellOf(gx, gz);

  const sOk = nearestWalkable(s.cx, s.cz, 6);
  if (!sOk) return null;
  s.cx = sOk.cx; s.cz = sOk.cz;

  const gOk = nearestWalkable(goal.cx, goal.cz, 10);
  if (!gOk) return null;
  goal = gOk;

  const startI = s.cz * GRID + s.cx;
  const goalI  = goal.cz * GRID + goal.cx;

  if (startI === goalI) return [{ x: gx, z: gz }];

  epoch++;
  heap.clear();

  seen[startI] = epoch;
  closed[startI] = 0;
  gScore[startI] = 0;
  from[startI] = -1;
  heap.push(startI, octile(startI, goalI));

  let expanded = 0;
  let found = false;

  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur] === epoch) continue;
    closed[cur] = epoch;

    if (cur === goalI) { found = true; break; }
    if (++expanded > maxNodes) break;

    const cx = cur % GRID;
    const cz = (cur / GRID) | 0;
    const hc = H[cur];
    const gc = gScore[cur];

    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k];
      const nz = cz + DZ[k];
      if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;

      const ni = nz * GRID + nx;
      if (closed[ni] === epoch) continue;

      const hn = H[ni];
      if (hn <= WATER_LEVEL + 0.4) continue;

      const dh = hn - hc;
      if (dh > JUMP_UP) continue;
      if (dh < -FALL_MAX) continue;

      // no diagonal corner cutting
      if (k >= 4) {
        if (H[cz * GRID + nx] <= WATER_LEVEL + 0.4) continue;
        if (H[nz * GRID + cx] <= WATER_LEVEL + 0.4) continue;
      }

      let cost = COST[k];
      if (dh > STEP_UP) cost *= 1.9;            // must jump
      else if (dh > 0) cost *= 1 + dh * 0.35;   // uphill
      if (dh < -1.5) cost *= 1.35;              // drop

      const ng = gc + cost;

      if (seen[ni] !== epoch || ng < gScore[ni]) {
        seen[ni] = epoch;
        gScore[ni] = ng;
        from[ni] = cur;
        heap.push(ni, ng + octile(ni, goalI));
      }
    }
  }

  if (!found) return null;

  // reconstruct
  const chain = [];
  let cur = goalI;
  while (cur !== -1) {
    const cx = cur % GRID;
    const cz = (cur / GRID) | 0;
    chain.push(worldOf(cx, cz));
    if (cur === startI) break;
    cur = from[cur];
  }
  chain.reverse();

  // smooth
  const smoothed = chain.length < 90 ? stringPull(chain) : chain;
  smoothed[smoothed.length - 1] = { x: gx, z: gz };
  return smoothed;
}
