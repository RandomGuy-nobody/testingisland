import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

import { heightAt, WATER_LEVEL, WORLD_SIZE, randomSpawn } from './shared/terrain.js';
import { findPath, buildGrid } from './shared/navgrid.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 8000
});

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use('/shared', express.static(path.join(__dirname, 'shared'), { maxAge: '1h' }));
app.get('/health', (_req, res) => res.status(200).send('ok'));

buildGrid();

/* ======================  TUNING  ====================== */
const TICK_MS     = 50;      // 20 Hz simulation
const ESTAN_SPEED = 7.05;    // slower than player sprint (8.6), faster than walk (5.4)
const CATCH_DIST  = 2.7;
const GRAVITY     = -22;
const JUMP_V      = 11.0;    // ≈ 2.75 units of jump height
const REPATH_MS   = 700;
const INVULN_MS   = 3000;
/* ====================================================== */

const players = new Map();
const now = () => Date.now();

/* ---------- Estan ---------- */

const estan = {
  x: 0, y: 0, z: 0,
  vy: 0,
  ry: 0,
  onGround: true,
  jumping: false,
  path: [],
  pi: 0,
  target: null,
  repathAt: 0
};

function resetEstan() {
  for (let i = 0; i < 200; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 70 + Math.random() * 110;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (heightAt(x, z) > WATER_LEVEL + 1.5) {
      estan.x = x; estan.z = z;
      estan.y = heightAt(x, z) + 1;
      estan.vy = 0;
      estan.path = [];
      estan.pi = 0;
      estan.target = null;
      estan.onGround = true;
      estan.jumping = false;
      return;
    }
  }
  estan.x = 0; estan.z = 0; estan.y = heightAt(0, 0) + 1;
}
resetEstan();

/* ---------- simulation ---------- */

function tick() {
  const t = now();
  const dt = TICK_MS / 1000;

  /* --- 1. pick nearest player --- */
  let best = null;
  let bestD = Infinity;
  for (const p of players.values()) {
    const d = Math.hypot(p.x - estan.x, p.z - estan.z);
    if (d < bestD) { bestD = d; best = p; }
  }

  /* --- 2. (re)plan --- */
  if (best) {
    const needsPath =
      estan.target !== best.id ||
      t > estan.repathAt ||
      estan.pi >= estan.path.length;

    if (needsPath) {
      const p = findPath(estan.x, estan.z, best.x, best.z, 6000);
      if (p && p.length) {
        estan.path = p;
        estan.pi = 0;
      }
      estan.target = best.id;
      estan.repathAt = t + REPATH_MS;
    }
  } else {
    estan.path = [];
    estan.pi = 0;
  }

  /* --- 3. jump check (before gravity) --- */
  if (estan.onGround && estan.pi < estan.path.length) {
    const wp = estan.path[estan.pi];
    const wy = heightAt(wp.x, wp.z);
    if (wy > estan.y + 0.65) {
      estan.vy = JUMP_V;
      estan.onGround = false;
      estan.jumping = true;
    }
  }

  /* --- 4. follow path --- */
  if (estan.pi < estan.path.length) {
    const wp = estan.path[estan.pi];
    const dx = wp.x - estan.x;
    const dz = wp.z - estan.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.9) {
      estan.pi++;
    } else {
      const ux = dx / dist;
      const uz = dz / dist;
      const step = ESTAN_SPEED * dt;
      estan.x += ux * step;
      estan.z += uz * step;
      estan.ry = Math.atan2(ux, uz);
    }
  }

  /* --- 5. gravity + ground --- */
  const gh = heightAt(estan.x, estan.z);
  estan.vy += GRAVITY * dt;
  estan.y += estan.vy * dt;

  if (estan.y <= gh) {
    estan.y = gh;
    estan.vy = 0;
    if (!estan.onGround) estan.jumping = false;
    estan.onGround = true;
  } else {
    estan.onGround = false;
  }

  /* --- 6. catch --- */
  for (const p of players.values()) {
    if (t < p.invulnUntil) continue;
    const d = Math.hypot(p.x - estan.x, p.z - estan.z);
    if (d < CATCH_DIST && Math.abs(p.y - estan.y) < 4.5) {
      p.invulnUntil = t + INVULN_MS;
      const sp = randomSpawn(90, 170);
      p.x = sp.x;
      p.z = sp.z;
      p.y = heightAt(sp.x, sp.z) + 1.2;
      io.to(p.id).emit('caught', { x: p.x, y: p.y, z: p.z });
    }
  }

  /* --- 7. broadcast --- */
  const snap = {
    t,
    e: {
      x: +estan.x.toFixed(2),
      y: +estan.y.toFixed(2),
      z: +estan.z.toFixed(2),
      j: estan.jumping ? 1 : 0
    },
    p: []
  };

  for (const p of players.values()) {
    snap.p.push({
      id: p.id,
      n: p.name,
      c: p.color,
      x: +p.x.toFixed(2),
      y: +p.y.toFixed(2),
      z: +p.z.toFixed(2),
      r: +p.ry.toFixed(2)
    });
  }

  io.volatile.emit('snap', snap);
}

setInterval(tick, TICK_MS);

/* ---------- networking ---------- */

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    const raw = (data && data.name) ? String(data.name) : 'anon';
    const name = raw.slice(0, 14).trim() || 'anon';
    const sp = randomSpawn(30, 150);

    const p = {
      id: socket.id,
      name,
      color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 62%)`,
      x: sp.x,
      y: heightAt(sp.x, sp.z) + 1.2,
      z: sp.z,
      ry: 0,
      invulnUntil: now() + 2500
    };

    players.set(socket.id, p);

    socket.emit('welcome', {
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      water: WATER_LEVEL,
      world: WORLD_SIZE
    });

    io.emit('joined', { id: p.id, n: p.name, c: p.color });
  });

  socket.on('state', (s) => {
    const p = players.get(socket.id);
    if (!p || !s) return;

    if (Number.isFinite(s.x)) p.x = s.x;
    if (Number.isFinite(s.y)) p.y = s.y;
    if (Number.isFinite(s.z)) p.z = s.z;
    if (Number.isFinite(s.r)) p.ry = s.r;

    const lim = WORLD_SIZE / 2 - 2;
    if (p.x < -lim) p.x = -lim;
    if (p.x > lim) p.x = lim;
    if (p.z < -lim) p.z = -lim;
    if (p.z > lim) p.z = lim;
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('left', { id: socket.id });
  });
});

server.listen(PORT, () => {
  console.log(`ESTAN ISLAND running on http://localhost:${PORT}`);
});
