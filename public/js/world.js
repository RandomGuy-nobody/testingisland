import * as THREE from 'three';
import { heightAt, WATER_LEVEL, WORLD_SIZE, getScatter } from '/shared/terrain.js';

function terrainColor(h, c) {
  if (h < WATER_LEVEL + 0.35) c.setHex(0x8b7b56);      // wet sand
  else if (h < 1.9)           c.setHex(0xdccfa6);      // beach
  else if (h < 5.0)           c.setHex(0x4f8b3d);      // grass
  else if (h < 8.0)           c.setHex(0x3d6b31);      // dark grass
  else if (h < 11.5)          c.setHex(0x7d7b70);      // rock
  else                        c.setHex(0xd6dce2);      // snow
  return c;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.trees = getScatter('tree', 460, 1.0);
    this.rocks = getScatter('rock', 230, 2.0);

    this._ground();
    this._water();
    this._vegetation();
    this._sky();
  }

  _ground() {
    const SEG = 256;
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      terrainColor(h, col);
      colors[i * 3]     = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    this.ground = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true })
    );
    this.scene.add(this.ground);
  }

  _water() {
    const geo = new THREE.PlaneGeometry(WORLD_SIZE * 1.6, WORLD_SIZE * 1.6, 1, 1);
    geo.rotateX(-Math.PI / 2);

    this.water = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x1d6a9c,
        transparent: true,
        opacity: 0.78,
        roughness: 0.12,
        metalness: 0.35
      })
    );
    this.water.position.y = WATER_LEVEL;
    this.scene.add(this.water);
  }

  _vegetation() {
    const dummy = new THREE.Object3D();

    /* --- trunks --- */
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.52, 3.2, 5);
    trunkGeo.translate(0, 1.6, 0);
    const trunks = new THREE.InstancedMesh(
      trunkGeo,
      new THREE.MeshLambertMaterial({ color: 0x5a3e29 }),
      this.trees.length
    );

    /* --- foliage --- */
    const leafGeo = new THREE.ConeGeometry(2.25, 5.6, 7);
    leafGeo.translate(0, 5.3, 0);
    const leaves = new THREE.InstancedMesh(
      leafGeo,
      new THREE.MeshLambertMaterial({ color: 0x2e6a2a }),
      this.trees.length
    );

    this.trees.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.r, 0);
      dummy.scale.setScalar(t.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      leaves.setMatrixAt(i, dummy.matrix);
    });

    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    this.scene.add(trunks, leaves);

    /* --- rocks --- */
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(
      rockGeo,
      new THREE.MeshLambertMaterial({ color: 0x6d6f6b, flatShading: true }),
      this.rocks.length
    );

    this.rocks.forEach((r, i) => {
      dummy.position.set(r.x, r.y - 0.25, r.z);
      dummy.rotation.set(r.r * 0.4, r.r, r.r * 0.7);
      dummy.scale.set(r.s * 1.1, r.s * 0.75, r.s * 1.1);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    });

    rocks.instanceMatrix.needsUpdate = true;
    this.scene.add(rocks);
  }

  _sky() {
    this.scene.background = new THREE.Color(0x9dc6e6);
    this.scene.fog = new THREE.Fog(0x9dc6e6, 70, 330);

    const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a3a, 0.95);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.05);
    sun.position.set(120, 180, 80);
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x88a8cc, 0.3);
    fill.position.set(-100, 60, -120);
    this.scene.add(fill);
  }

  update(t) {
    if (this.water) {
      this.water.position.y = WATER_LEVEL + Math.sin(t * 0.0006) * 0.06;
    }
  }
}
