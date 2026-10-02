/**
 * Socket.io wrapper + snapshot interpolation buffer.
 * Renders remote entities ~130 ms in the past so movement is smooth.
 */

function lerp(a, b, t) { return a + (b - a) * t; }

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function blend(a, b, t) {
  const out = { t: b.t, e: null, p: [] };

  out.e = (a.e && b.e)
    ? {
        x: lerp(a.e.x, b.e.x, t),
        y: lerp(a.e.y, b.e.y, t),
        z: lerp(a.e.z, b.e.z, t),
        j: b.e.j
      }
    : b.e;

  const prev = new Map();
  for (const p of a.p) prev.set(p.id, p);

  for (const p of b.p) {
    const q = prev.get(p.id);
    if (q) {
      out.p.push({
        id: p.id, n: p.n, c: p.c,
        x: lerp(q.x, p.x, t),
        y: lerp(q.y, p.y, t),
        z: lerp(q.z, p.z, t),
        r: lerpAngle(q.r, p.r, t)
      });
    } else {
      out.p.push(p);
    }
  }
  return out;
}

export class Net {
  constructor() {
    this.socket = null;
    this.id = null;
    this.buf = [];
    this.handlers = new Map();
  }

  connect(name) {
    return new Promise((resolve) => {
      const socket = io({ transports: ['websocket', 'polling'] });
      this.socket = socket;

      socket.on('welcome', (d) => {
        this.id = d.id;
        resolve(d);
      });

      socket.on('snap', (s) => {
        this.buf.push({ t: performance.now(), d: s });
        if (this.buf.length > 45) this.buf.splice(0, this.buf.length - 45);
      });

      socket.on('caught', (d) => this._fire('caught', d));
      socket.on('joined', (d) => this._fire('joined', d));
      socket.on('left',   (d) => this._fire('left', d));

      socket.on('connect_error', () => this._fire('error', null));

      socket.emit('join', { name });
    });
  }

  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, []);
    this.handlers.get(evt).push(fn);
  }

  _fire(evt, data) {
    const list = this.handlers.get(evt);
    if (list) for (const fn of list) fn(data);
  }

  send(x, y, z, r) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('state', { x, y, z, r });
    }
  }

  /** Interpolated world snapshot, rendered `delay` ms in the past. */
  sample(delay = 130) {
    const b = this.buf;
    if (!b.length) return null;
    if (b.length === 1) return b[0].d;

    const target = performance.now() - delay;

    let i = b.length - 2;
    while (i > 0 && b[i].t > target) i--;

    const a = b[i];
    const c = b[i + 1] || b[i];

    if (!c || c.t === a.t) return a.d;

    const alpha = Math.max(0, Math.min(1, (target - a.t) / (c.t - a.t)));
    return blend(a.d, c.d, alpha);
  }
}
