import * as THREE from 'three';

/* ---------- texture ---------- */

function makeFallbackCanvas() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const g = c.getContext('2d');

  // background
  const bg = g.createLinearGradient(0, 0, 0, 384);
  bg.addColorStop(0, '#0c0e12');
  bg.addColorStop(1, '#04050a');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 384);

  // head
  g.fillStyle = '#d8d1c4';
  g.beginPath();
  g.ellipse(128, 168, 92, 118, 0, 0, Math.PI * 2);
  g.fill();

  // shading
  g.fillStyle = 'rgba(60,50,45,0.22)';
  g.beginPath();
  g.ellipse(128, 200, 92, 118, 0, Math.PI * 0.15, Math.PI * 1.05);
  g.fill();

  // eye sockets
  g.fillStyle = '#050506';
  g.beginPath(); g.ellipse(92, 148, 26, 34, -0.1, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(164, 148, 26, 34, 0.1, 0, Math.PI * 2); g.fill();

  // pupils
  g.fillStyle = '#efefef';
  g.beginPath(); g.arc(92, 154, 8, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(164, 154, 8, 0, Math.PI * 2); g.fill();

  // mouth
  g.fillStyle = '#1a0505';
  g.beginPath(); g.ellipse(128, 268, 48, 32, 0, 0, Math.PI * 2); g.fill();

  // teeth
  g.fillStyle = '#f4f1e8';
  for (let i = 0; i < 7; i++) {
    g.fillRect(88 + i * 13, 246, 9, 17);
    g.fillRect(88 + i * 13, 274, 9, 15);
  }

  // blood
  g.fillStyle = '#8e1616';
  for (let i = 0; i < 6; i++) {
    const x = 52 + i * 32;
    g.fillRect(x, 300, 6, 18 + (i % 3) * 14);
  }

  // grain
  const img = g.getImageData(0, 0, 256, 384);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);

  return c;
}

export async function loadEstanTexture() {
  try {
    const res = await fetch('/assets/estan.png', { method: 'HEAD' });
    if (res.ok) {
      const tex = await new THREE.TextureLoader().loadAsync('/assets/estan.png');
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      return tex;
    }
  } catch (_) { /* fall through */ }

  const canvas = makeFallbackCanvas();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- view ---------- */

export class EstanView {
  constructor(scene, texture) {
    this.material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.04,
      fog: true
    });

    this.sprite = new THREE.Sprite(this.material);
    this.sprite.center.set(0.5, 0.0);        // origin at the feet
    this.sprite.scale.set(3.4, 4.8, 1);
    scene.add(this.sprite);

    this.cur = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.bob = Math.random() * 10;
    this.visible = false;
  }

  /** snap.e = { x, y, z, j } */
  push(e) {
    this.target.set(e.x, e.y, e.z);
    if (!this.visible) {
      this.cur.copy(this.target);
      this.prev.copy(this.target);
      this.visible = true;
    }
  }

  update(dt) {
    if (!this.visible) return;

    this.prev.copy(this.cur);
    this.cur.lerp(this.target, Math.min(1, dt * 18));

    // vertical bob while moving
    const speed = this.prev.distanceTo(this.cur) / Math.max(dt, 1e-4);
    this.bob += dt * (6 + Math.min(speed, 9) * 1.1);
    const bobY = Math.sin(this.bob) * 0.11 * Math.min(1, speed * 0.4);

    this.sprite.position.set(this.cur.x, this.cur.y + bobY, this.cur.z);

    // slight sway
    this.sprite.material.rotation = Math.sin(this.bob * 0.55) * 0.035;
  }

  hide() {
    this.visible = false;
    this.sprite.position.set(0, -9999, 0);
  }
}
