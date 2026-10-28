import * as THREE from 'three';
import { createKartModel } from './models.js';

let r = null;
let scene = null;
let cam = null;
const cache = new Map();

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  try {
    r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    r = null;
    return;
  }
  r.setPixelRatio(1);
  r.setSize(192, 192, false);
  r.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 1.6);
  d.position.set(3, 5, 6);
  scene.add(d);
  cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
}

export function portrait(character, vehicle = 'car', mode = 'head') {
  const key = `${character}:${vehicle}:${mode}`;
  if (cache.has(key)) return cache.get(key);
  if (!r) setup();
  if (!r) return '';
  const m = createKartModel(character, vehicle);
  m.rotation.y = mode === 'head' ? 0.5 : 0.75;
  scene.add(m);
  if (mode === 'head') {
    const headY = vehicle === 'plane' ? 2.5 : vehicle === 'hover' ? 2.35 : 2.1;
    cam.aspect = 1;
    cam.position.set(1.2, headY + 0.45, 3.9);
    cam.lookAt(0.05, headY - 0.25, 0);
  } else {
    const dist = vehicle === 'plane' ? 13 : 9.5;
    cam.position.set(dist * 0.55, dist * 0.42, dist * 0.8);
    cam.lookAt(0, 1, 0);
  }
  cam.updateProjectionMatrix();
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  scene.remove(m);
  cache.set(key, url);
  return url;
}
