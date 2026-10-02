import * as THREE from 'three';

import { World } from './world.js';
import { Net } from './net.js';
import { LocalPlayer } from './player.js';
import { EstanView, loadEstanTexture } from './nextbot.js';
import { GameAudio } from './audio.js';

import { heightAt } from '/shared/terrain.js';

/* ==================== DOM ==================== */

const canvas     = document.getElementById('game');
const menuEl     = document.getElementById('menu');
const playBtn    = document.getElementById('play');
const nameInput  = document.getElementById('name');
const loadingEl  = document.getElementById('loading');
const hudEl      = document.getElementById('hud');
const distEl     = document.getElementById('dist');
const playersEl  = document.getElementById('players');
const warnEl     = document.getElementById('warning');
const caughtEl   = document.getElementById('caught');
const caughtImg  = document.getElementById('caught-img');

/* ==================== RENDERER ==================== */

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 900);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ==================== WORLD ==================== */

const world = new World(scene);

/* ==================== REMOTE PLAYERS ==================== */

const tagCache = new Map();

function makeTag(name) {
  if (tagCache.has(name)) return tagCache.get(name).clone();

  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');

  g.font = 'bold 62px "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  g.fillStyle = 'rgba(0,0,0,0.55)';
  const w = g.measureText(name).width + 46;
  g.beginPath();
  g.roundRect((512 - w) / 2, 22, w, 84, 20);
  g.fill();

  g.fillStyle = '#ffffff';
  g.fillText(name, 256, 66);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tagCache.set(name, tex);
  return tex;
}

class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
  }

  _create(p) {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 1.0, 4, 10),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(p.c) })
    );
    this.scene.add(mesh);

    const tag = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeTag(p.n),
        transparent: true,
        depthTest: false,
        fog: false
      })
    );
    tag.scale.set(3.2, 0.8, 1);
    tag.renderOrder = 999;
    this.scene.add(tag);

    return { mesh, tag };
  }

  _dispose(e) {
    this.scene.remove(e.mesh);
    this.scene.remove(e.tag);
    e.mesh.geometry.dispose();
    e.mesh.material.dispose();
    e.tag.material.dispose();
  }

  sync(snap, myId) {
    const live = new Set();

    for (const p of snap.p) {
      if (p.id === myId) continue;
      live.add(p.id);

      let e = this.map.get(p.id);
      if (!e) {
        e = this._create(p);
        this.map.set(p.id, e);
      }

      e.mesh.position.set(p.x, p.y + 0.95, p.z);
      e.mesh.rotation.y = p.r;

      e.tag.position.set(p.x, p.y + 2.7, p.z);
    }

    for (const [id, e] of this.map) {
      if (!live.has(id)) {
        this._dispose(e);
        this.map.delete(id);
      }
    }
  }

  clear() {
    for (const e of this.map.values()) this._dispose(e);
    this.map.clear();
  }
}

const remotes = new RemotePlayers(scene);

/* ==================== SYSTEMS ==================== */

const net = new Net();
const audio = new GameAudio();
const player = new LocalPlayer(camera, canvas, world.trees);

let estanView = null;
let started = false;
let lastT = performance.now();
let sendAcc = 0;
let catchTimer = null;

/* ==================== TEXTURE ==================== */

const estanTexture = await loadEstanTexture();
estanView = new EstanView(scene, estanTexture);

if (estanTexture.image instanceof HTMLCanvasElement) {
  caughtImg.src = estanTexture.image.toDataURL();
} else {
  caughtImg.src = '/assets/estan.png';
}

/* ==================== NET EVENTS ==================== */

net.on('caught', (d) => {
  audio.scare();

  caughtEl.classList.add('show');
  clearTimeout(catchTimer);
  catchTimer = setTimeout(() => caughtEl.classList.remove('show'), 1700);

  player.pos.set(d.x, d.y, d.z);
  player.vel.set(0, 0, 0);
  estanView.hide();
});

net.on('left', () => {
  /* RemotePlayers.sync handles cleanup automatically next frame */
});

/* ==================== START ==================== */

async function start() {
  playBtn.disabled = true;
  loadingEl.textContent = 'connecting…';

  audio.init();
  audio.resume();

  let welcome;
  try {
    welcome = await net.connect(nameInput.value || 'anon');
  } catch (err) {
    loadingEl.textContent = 'connection failed — retry';
    playBtn.disabled = false;
    return;
  }

  loadingEl.textContent = 'building island…';

  player.spawn(welcome.x, welcome.y, welcome.z);
  player.yaw = Math.random() * Math.PI * 2;

  menuEl.classList.add('hidden');
  hudEl.classList.remove('hidden');

  started = true;
  lastT = performance.now();

  requestAnimationFrame(() => canvas.requestPointerLock?.());
}

playBtn.addEventListener('click', start);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') start();
});

/* ==================== LOOP ==================== */

function frame() {
  requestAnimationFrame(frame);

  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  world.update(now);

  if (started) {
    player.update(dt);

    // send our state at ~20 Hz
    sendAcc += dt;
    if (sendAcc >= 0.05) {
      net.send(player.pos.x, player.pos.y, player.pos.z, player.yaw);
      sendAcc = 0;
    }

    const snap = net.sample(130);

    if (snap) {
      if (snap.e) estanView.push(snap.e);
      remotes.sync(snap, net.id);

      playersEl.textContent = String(snap.p.length);

      if (snap.e) {
        const d = Math.hypot(
          snap.e.x - player.pos.x,
          snap.e.z - player.pos.z
        );

        distEl.textContent = d.toFixed(0) + 'm';

        const warnAmt = Math.max(0, 1 - d / 26);
        warnEl.style.opacity = warnAmt.toFixed(2);

        audio.setTension(Math.max(0, Math.min(1, 1 - d / 55)));
      }
    }

    estanView.update(dt);
  }

  renderer.render(scene, camera);
}

frame();
