import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  MeshBasicMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";

/**
 * Piso de tablones generado en tiempo de carga.
 *
 * Se dibuja una unica textura que cubre todo el suelo (sin repeticion) con:
 *  - tablones con bisel (canto iluminado + canto en sombra),
 *  - variacion de tono y veta por tabla,
 *  - oclusion ambiental junto a las paredes y caida de luz general.
 * Asi el piso tiene volumen sin necesidad de luces (la sala es un bake).
 *
 * La paleta esta ajustada al tono de la web oficial (roble naranja calido).
 */

const BASE_HUE = 20;
const BASE_SAT = 0.38;
const BASE_LIGHT = 0.58;

const PLANK_WIDTH_M = 0.24;
const PLANK_LENGTH_M = 2.2;

/**
 * Sombras suaves sobre el suelo. El suelo es un material sin luces, asi que las
 * unicas sombras son las que se pintan aqui. Coordenadas en el espacio del suelo
 * (x/z del mundo) y radios en metros.
 * Se desplazan un poco hacia -x porque la luz entra por la ventana (pared +x).
 */
// Las sombras ya no se pintan en la textura: se proyectan de verdad con una luz
// direccional sobre un ShadowMaterial (ver Experience/Baked.js -> setShadows).
// Esta lista se conserva vacia para no duplicar sombras.
export const FLOOR_SHADOWS = [];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hsl(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  return `hsl(${hh.toFixed(1)}, ${(Math.max(0, Math.min(1, s)) * 100).toFixed(1)}%, ${(
    Math.max(0, Math.min(1, l)) * 100
  ).toFixed(1)}%)`;
}

// ---------------------------------------------------------------------------
// Tablon
// ---------------------------------------------------------------------------

function drawPlank(ctx, x, y, w, h, rand) {
  const hue = BASE_HUE + (rand() - 0.5) * 9;
  const sat = BASE_SAT + (rand() - 0.5) * 0.09;
  const light = BASE_LIGHT + (rand() - 0.5) * 0.07;

  // Degradado transversal: canto claro arriba, tono base, canto en sombra abajo.
  const bevel = ctx.createLinearGradient(0, y, 0, y + h);
  bevel.addColorStop(0, hsl(hue + 2, sat * 0.9, light + 0.13));
  bevel.addColorStop(0.07, hsl(hue, sat, light + 0.028));
  bevel.addColorStop(0.55, hsl(hue, sat, light));
  bevel.addColorStop(0.9, hsl(hue + 1, sat * 1.05, light - 0.055));
  bevel.addColorStop(1, hsl(hue + 2, sat * 1.08, light - 0.13));
  ctx.fillStyle = bevel;
  ctx.fillRect(x, y, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Veta: trazos ondulados de bajo contraste.
  const grainLines = 12 + Math.floor(rand() * 7);
  for (let i = 0; i < grainLines; i++) {
    const gy = y + (i + 0.5) * (h / grainLines) + (rand() - 0.5) * (h / grainLines) * 0.7;
    const amp = h * (0.01 + rand() * 0.022);
    const dark = rand() > 0.32;
    const alpha = 0.028 + rand() * 0.045;
    ctx.strokeStyle = dark
      ? `rgba(92, 56, 26, ${alpha.toFixed(3)})`
      : `rgba(255, 244, 226, ${(alpha * 0.85).toFixed(3)})`;
    ctx.lineWidth = 0.6 + rand() * (h * 0.02);
    ctx.beginPath();
    const segs = 7;
    const phase = rand() * Math.PI * 2;
    const freq = 0.8 + rand() * 1.4;
    for (let s = 0; s <= segs; s++) {
      const px = x - 4 + ((w + 8) * s) / segs;
      const py = gy + Math.sin((s / segs) * Math.PI * freq + phase) * amp;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // Nudo ocasional, muy sutil.
  if (rand() < 0.025) {
    const kx = x + w * (0.2 + rand() * 0.6);
    const ky = y + h * (0.3 + rand() * 0.4);
    const kr = h * (0.1 + rand() * 0.09);
    const knot = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
    knot.addColorStop(0, "rgba(74, 40, 16, 0.16)");
    knot.addColorStop(0.55, "rgba(96, 58, 30, 0.07)");
    knot.addColorStop(1, "rgba(96, 58, 30, 0)");
    ctx.fillStyle = knot;
    ctx.beginPath();
    ctx.ellipse(kx, ky, kr * 1.9, kr, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Junta: linea oscura en el pie y en las testas, brillo fino en el canto.
  ctx.fillStyle = "rgba(52, 28, 10, 0.42)";
  ctx.fillRect(x, y + h - Math.max(1, h * 0.055), w, Math.max(1, h * 0.055));
  ctx.fillStyle = "rgba(52, 28, 10, 0.34)";
  ctx.fillRect(x, y, Math.max(1.5, w * 0.005), h);
  ctx.fillRect(x + w - Math.max(1, w * 0.004), y, Math.max(1, w * 0.004), h);
  ctx.fillStyle = "rgba(255, 246, 228, 0.16)";
  ctx.fillRect(x + w * 0.004, y, Math.max(1, w * 0.003), h);

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Sombreado
// ---------------------------------------------------------------------------

function paintShadows(ctx, width, height, shadows) {
  if (!shadows || !shadows.length) return;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (const s of shadows) {
    const cx = s.u * width;
    // La textura se sube con flipY = true, asi que la V del canvas va al reves
    // que la V de la UV: hay que invertirla para que la sombra caiga donde toca.
    const cy = (1 - s.v) * height;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(Math.max(1, s.rxPx), Math.max(1, s.ryPx));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(0, 0, 0, ${s.opacity})`);
    g.addColorStop(0.4, `rgba(0, 0, 0, ${s.opacity * 0.62})`);
    g.addColorStop(0.72, `rgba(0, 0, 0, ${s.opacity * 0.22})`);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function paintAmbientOcclusion(ctx, width, height, px) {
  const reach = Math.min(0.6 * px, Math.min(width, height) * 0.16);
  const edge = "rgba(220, 212, 203, 1)";
  const clean = "rgba(255, 255, 255, 1)";
  const sides = [
    [0, 0, reach, 0],
    [0, height, 0, height - reach],
    [0, 0, 0, reach],
    [width, 0, width - reach, 0],
  ];

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (const [x0, y0, x1, y1] of sides) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, edge);
    gradient.addColorStop(0.45, "rgba(242, 237, 230, 1)");
    gradient.addColorStop(1, clean);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  // Caida de luz general: centro ligeramente mas claro que las esquinas.
  const cx = width * 0.5;
  const cy = height * 0.5;
  const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
  radial.addColorStop(0, "rgba(255, 255, 255, 1)");
  radial.addColorStop(0.55, "rgba(251, 248, 243, 1)");
  radial.addColorStop(1, "rgba(232, 225, 215, 1)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Textura
// ---------------------------------------------------------------------------

function createFloorCanvas(lengthMeters, widthMeters, px, shadows) {
  const width = Math.round(lengthMeters * px);
  const height = Math.round(widthMeters * px);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1024, width);
  canvas.height = Math.max(1024, height);
  const ctx = canvas.getContext("2d");

  const rand = mulberry32(20261108);
  const plankW = PLANK_WIDTH_M * px;
  const plankL = PLANK_LENGTH_M * px;

  ctx.fillStyle = hsl(BASE_HUE, BASE_SAT, BASE_LIGHT);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rows = Math.ceil(canvas.height / plankW);
  for (let r = 0; r < rows; r++) {
    const y = r * plankW;
    const h = Math.min(plankW, canvas.height - y);
    if (h <= 0) break;
    let x = -plankL * (0.1 + rand() * 0.9);
    while (x < canvas.width) {
      const len = plankL * (0.62 + rand() * 0.5);
      drawPlank(ctx, x, y, len, h, rand);
      x += len;
    }
  }

  paintShadows(ctx, canvas.width, canvas.height, shadows);
  paintAmbientOcclusion(ctx, canvas.width, canvas.height, px);

  return canvas;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Sustituye el material del piso por madera procedural continua.
 *
 * @param {import("three").Mesh} mesh  mesh del suelo
 * @param {{ anisotropy?: number }} options
 * @returns {MeshBasicMaterial|null}
 */
export function applyFloorWood(mesh, { anisotropy = 1 } = {}) {
  if (!mesh) return null;

  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const count = position.count;

  // Direccion de los tablones: eje Z local de la sala (paralelo a la pared del
  // whiteboard, como en la web oficial) proyectado al plano del suelo.
  const matrix = mesh.matrixWorld;
  const dir = new Vector3(0, 0, 1).transformDirection(matrix);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();

  const perp = new Vector3(-dir.z, 0, dir.x);
  const point = new Vector3();

  const bounds = (d) => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < count; i++) {
      point.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(matrix);
      const value = point.x * d.x + point.z * d.z;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return [min, max];
  };

  const [uMin, uMax] = bounds(dir);
  const [vMin, vMax] = bounds(perp);
  const uSpan = Math.max(1e-3, uMax - uMin);
  const vSpan = Math.max(1e-3, vMax - vMin);

  // UV planar nueva (las originales son tiras sueltas por tablon).
  const newUv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    point.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(matrix);
    newUv[i * 2] = (point.x * dir.x + point.z * dir.z - uMin) / uSpan;
    newUv[i * 2 + 1] = (point.x * perp.x + point.z * perp.z - vMin) / vSpan;
  }
  const UvAttribute = Object.getPrototypeOf(geometry.attributes.uv).constructor;
  geometry.setAttribute("uv", new UvAttribute(newUv, 2));

  // Sombra de la silla y de la maceta, proyectadas al espacio de la textura.
  const px = Math.max(24, Math.min(180, 2048 / Math.max(uSpan, vSpan)));
  const toUnit = (x, z) => [
    (x * dir.x + z * dir.z - uMin) / uSpan,
    (x * perp.x + z * perp.z - vMin) / vSpan,
  ];
  const shadows = FLOOR_SHADOWS.map((s) => {
    const [u, v] = toUnit(s.x, s.z);
    return {
      u,
      v,
      rxPx: (Math.abs(s.rx * dir.x) + Math.abs(s.rz * dir.z)) * px,
      ryPx: (Math.abs(s.rx * perp.x) + Math.abs(s.rz * perp.z)) * px,
      opacity: s.opacity,
    };
  });

  const canvas = createFloorCanvas(uSpan, vSpan, px, shadows);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = anisotropy;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;

  return new MeshBasicMaterial({
    map: texture,
    color: new Color(0xffffff),
  });
}
