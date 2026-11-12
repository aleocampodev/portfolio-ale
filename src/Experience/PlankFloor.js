import {
  Color,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import Experience from "./Experience.js";

// Piso de tablones 3D.
//
// Sustituye al plano con textura 2D (FloorWoodTexture) por un unico
// InstancedMesh de bloques biselados: una sola draw call para toda la sala y
// volumen real en cada junta.
//
// La cara superior de los tablones queda por debajo de los tres planos que ya
// viven sobre el suelo:
//   - ShadowPlane de Baked  -> y = 0.011 (sombras dinamicas)
//   - ContactShadows        -> y = 0.016 (discos de contacto)
//   - LedStrips floor glow  -> y = 0.020 (halo del LED)
// Por eso TOP_Y <= 0.011 y el grosor crece hacia abajo.

const TOP_Y = 0.0095; // cara superior, 1.5 mm por debajo del ShadowPlane
const THICKNESS = 0.03;
const BEVEL_RADIUS = 0.005;
const BEVEL_SEGMENTS = 2;

const PLANK_MIN_WIDTH = 0.18;
const PLANK_MAX_WIDTH = 0.2;
const PLANK_MIN_LENGTH = 1.2;
const PLANK_MAX_LENGTH = 2.4;
const GAP = 0.005; // 5 mm entre tablas

// El piso se mete unos centimetros bajo los zocalos para que no se vea el canto
// del tablon ni el vacio en el perimetro.
const EDGE_MARGIN = 0.06;

// La sub-base oscura tapa el hueco de las juntas. Va 1 mm por debajo de la cara
// superior, asi que no compite en profundidad con las tablas.
// Paleta del piso original calido: HSL(14, 45%, 60%).
const BASE_HUE = 14;
const BASE_SAT = 0.45;
const BASE_LIGHT = 0.6;

// Fallback: medidas verificadas de la sala, por si el mesh del piso no llega.
const FALLBACK_BOUNDS = {
  minX: -5.085,
  maxX: 4.276,
  minZ: -4.934,
  maxZ: 4.426,
};

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

export default class PlankFloor {
  constructor() {
    this.experience = new Experience();
    this.scene = this.experience.scene;
    this.renderer = this.experience.renderer.instance;
    this.seed = 20261110;
    this.rand = mulberry32(this.seed);
    this.instanceCount = 0;

    this.setBounds();
    this.setLights();
    this.setSubBase();
    this.buildPlanks();
  }

  /**
   * Limites del suelo. Se sacan del mesh original (que Baked deja invisible
   * pero conserva) para que el piso encaje con la sala sin numeros magicos.
   */
  setBounds = () => {
    const floorMesh =
      this.experience.world && this.experience.world.baked
        ? this.experience.world.baked.floorMesh
        : null;

    let bounds = { ...FALLBACK_BOUNDS };
    let floorTopY = 0.0075;

    if (floorMesh) {
      floorMesh.updateWorldMatrix(true, false);
      const matrix = floorMesh.matrixWorld;
      const position = floorMesh.geometry.attributes.position;
      const e = matrix.elements;

      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let minY = Infinity;

      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wz < minZ) minZ = wz;
        if (wz > maxZ) maxZ = wz;
        if (wy < minY) minY = wy;
      }

      if (Number.isFinite(minX) && maxX - minX > 1) {
        bounds = { minX, maxX, minZ, maxZ };
        if (Number.isFinite(minY)) floorTopY = minY;
      }
    }

    this.bounds = bounds;
    // 2.5 mm por encima de la cara superior real del piso viejo, con techo en
    // 0.011 para no tapar ShadowPlane / ContactShadows / LED.
    this.topY = Math.min(0.011, Math.max(TOP_Y, floorTopY + 0.0025));
    this.subBaseY = this.topY - 0.001;

    this.center = new Vector3(
      (bounds.minX + bounds.maxX) / 2,
      this.topY,
      (bounds.minZ + bounds.maxZ) / 2
    );
  };

  /**
   * La escena esta horneada (MeshBasicMaterial) y no tiene luces ambientales:
   * sin relleno un MeshStandardMaterial saldria casi negro. La hemisferica solo
   * afecta al piso nuevo; las paredes son Basic y quedan intactas.
   */
  setLights = () => {
    this.hemiLight = new HemisphereLight(0xffe8d8, 0x8a5a44, 0.6);
    this.hemiLight.name = "plankFloorFill";
    this.hemiLight.position.copy(this.center).setY(this.topY + 1);
    this.scene.add(this.hemiLight);
  };

  /** Plano oscuro 1 mm bajo la cara superior: fondo de las juntas. */
  setSubBase = () => {
    const width = this.bounds.maxX - this.bounds.minX + EDGE_MARGIN * 2;
    const depth = this.bounds.maxZ - this.bounds.minZ + EDGE_MARGIN * 2;

    this.subBase = new Mesh(
      new PlaneGeometry(width, depth),
      new MeshBasicMaterial({ color: 0x1f120c })
    );
    this.subBase.name = "PlankFloorSubBase";
    this.subBase.rotation.x = -Math.PI / 2;
    this.subBase.position.set(this.center.x, this.subBaseY, this.center.z);
    this.subBase.renderOrder = 0;
    this.scene.add(this.subBase);
  };

  buildPlanks = () => {
    const rand = this.rand;
    const bounds = this.bounds;
    const minX = bounds.minX - EDGE_MARGIN;
    const maxX = bounds.maxX + EDGE_MARGIN;
    const minZ = bounds.minZ - EDGE_MARGIN;
    const maxZ = bounds.maxZ + EDGE_MARGIN;
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;

    // Distribucion de filas en X. El ancho varia dentro del rango pedido; la
    // fila se coloca por su borde, con el gap ya descontado.
    const rows = [];
    let cursor = minX;
    while (cursor < maxX) {
      const width = Math.min(
        PLANK_MIN_WIDTH + rand() * (PLANK_MAX_WIDTH - PLANK_MIN_WIDTH),
        maxX - cursor
      );
      if (width < 0.05) break;
      rows.push({ x: cursor + width / 2, width });
      cursor += width + GAP;
    }

    // Primera pasada para saber cuantas instancias necesita el InstancedMesh.
    const placements = [];
    rows.forEach((row) => {
      // Juntas a tope escalonadas: cada fila empieza con una tabla cortada
      // distinta, pero nunca se sale del borde de la sala.
      let z = minZ;
      let first = true;
      while (z < maxZ) {
        const remaining = maxZ - z;
        let length =
          PLANK_MIN_LENGTH + rand() * (PLANK_MAX_LENGTH - PLANK_MIN_LENGTH);
        if (first) {
          // Recorte inicial: la junta queda a una distancia aleatoria del muro.
          length = GAP + rand() * (PLANK_MAX_LENGTH - GAP);
          first = false;
        }
        length = Math.min(length, remaining);
        if (length < 0.08) break;

        placements.push({
          x: row.x,
          z: z + length / 2,
          width: row.width,
          length,
          hue: BASE_HUE + (rand() - 0.5) * 3, // +-1.5 grados
          light: BASE_LIGHT + (rand() - 0.5) * 0.08, // +-4%
          sat: BASE_SAT + (rand() - 0.5) * 0.04,
        });

        z += length + GAP;
      }
    });

    const geometry = new RoundedBoxGeometry(
      1,
      THICKNESS,
      1,
      BEVEL_SEGMENTS,
      BEVEL_RADIUS
    );
    // La geometria es unitaria en X/Z y se escala por instancia: el bisel de los
    // cantos largos queda constante y las testas se redondean en proporcion.
    const material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0,
    });

    const mesh = new InstancedMesh(geometry, material, placements.length);
    mesh.name = "PlankFloor";
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    const dummy = new Object3D();
    const color = new Color();

    placements.forEach((p, i) => {
      dummy.position.set(p.x, this.topY - THICKNESS / 2, p.z);
      dummy.scale.set(p.width, 1, p.length);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // setHSL en espacio sRGB y conversion al working color space (lineal), que
      // es lo que espera instanceColor. Sin esto el piso se ve lavado.
      color.setHSL(p.hue / 360, p.sat, p.light, SRGBColorSpace);
      mesh.setColorAt(i, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (typeof mesh.computeBoundingSphere === "function") {
      mesh.computeBoundingSphere();
    }

    this.mesh = mesh;
    this.instanceCount = placements.length;
    this.rows = rows.length;
    this.scene.add(mesh);

    // Datos utiles para depuracion y para medir el coste real.
    this.mesh.userData.plankCount = placements.length;
    this.mesh.userData.rowCount = rows.length;
    this.mesh.userData.area = spanX * spanZ;
  };

  update = () => {};
}
