// Deterministic island heightfield + object scatter.
// Imported by BOTH the server and the browser so the world is identical.

export const WORLD_SIZE = 400;
export const WATER_LEVEL = 0;

const ISLAND_R = WORLD_SIZE * 0.5;

/* ---------- noise ---------- */

function fract(n) { return n - Math.floor(n); }

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return fract(s);
}

function smoothstep(t) { return t * t * (3 - 2 * t); }

function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const u = smoothstep(xf), v = smoothstep(yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x, y, oct) {
  let v = 0, amp = 1, fr = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * vnoise(x * fr, y * fr);
    norm += amp;
    amp *= 0.5;
    fr *= 2.03;
  }
  return v / norm;
}

/* ---------- terrain ---------- */

/**
 * Height of the island at world (x, z).
 * Terraced ridges create 1.4-unit cliffs that require jumping.
 */
export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  const r = d / (ISLAND_R * 0.82);
  const falloff = 1 - r * r * r;           // 1 at centre, negative past the shore

  const base = fbm(x * 0.011 + 13.7, z * 0.011 - 4.2, 4);   // rolling hills
  const detail = fbm(x * 0.050 - 7.3, z * 0.050 + 21.1, 2);  // roughness
  const ridge = fbm(x * 0.026 + 91.0, z * 0.026 + 33.0, 2);  // terrace source

  // quantised terraces → hard steps the AI must jump
  const terr = Math.floor(ridge * 4) * 1.55;

  let h = (base * 20 - 6) * falloff + detail * 2.5 * falloff + terr * falloff * 0.9;

  // flatten the beach near the waterline
  if (h > -0.5 && h < 2.2) h = h * 0.85 + 0.15;

  return h;
}

/** Deterministic scatter of trees / rocks. */
export function getScatter(kind, count, seedOffset) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = hash2(i * 1.7 + seedOffset * 13.1, 3.3 + seedOffset) * Math.PI * 2;
    const rr = Math.sqrt(hash2(i * 2.3 + seedOffset * 7.7, 7.1)) * (WORLD_SIZE * 0.42);
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const y = heightAt(x, z);

    if (y < WATER_LEVEL + (kind === 'tree' ? 1.1 : 0.7)) continue;

    out.push({
      x, y, z,
      s: 0.75 + hash2(i * 3.1, 9.9) * 0.7,
      r: hash2(i * 5.3, 11.1) * Math.PI * 2
    });
  }
  return out;
}

/** Random walkable spawn point (server-side use). */
export function randomSpawn(minR = 30, maxR = 150) {
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = minR + Math.random() * (maxR - minR);
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    if (heightAt(x, z) > WATER_LEVEL + 1.0) return { x, z };
  }
  return { x: 0, z: 0 };
}
