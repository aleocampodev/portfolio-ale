import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";

import Experience from "./Experience.js";

// Tiras LED calidas de la habitacion.
//
// La escena usa luz horneada (MeshBasicMaterial + atlas), asi que las tiras no
// iluminan nada: se resuelven con un nucleo emisivo por encima de 1.0 en lineal
// (para que solo ellas entren en el bloom selectivo) y dos halos aditivos que
// simulan el derrame real: uno corto sobre la pared y otro, mas ancho, sobre el
// piso. La luz de una tira baja es casi toda reflejo en el suelo, no una banda
// luminosa en el zocalo.
//
// Cada segmento se define por dos puntos y una normal de la superficie sobre la
// que se pega.

const CORE_COLOR = new Color(1.0, 0.56, 0.26);
const CORE_HDR_GAIN = 2.2;
const GLOW_COLOR = new Color(1.0, 0.6, 0.3);
const LED_GAP = 0.008;

// El zocalo sobresale de la pared: la tira debe quedar por delante de su cara,
// si no la geometria la oculta y solo se ve el halo.
const SKIRTING_GAP = 0.04;

// Nucleo: una linea fina, no una banda.
const CORE_THICKNESS = 0.022;

// Halo sobre la pared: corto y debil, para que el zocalo no se lea encendido.
const WALL_GLOW_HEIGHT = 0.06;
const WALL_GLOW_OPACITY = 0.1;

// Halo sobre el piso: ancho y calido, es el que da la sensacion de alumbrado.
const FLOOR_GLOW_WIDTH = 0.95;
const FLOOR_GLOW_OPACITY = 0.8;
const FLOOR_GLOW_Y = 0.02;

// Medidas del modelo cargado (room1).
const WALL_X = 4.0; // pared derecha, cara interior (normal -x)
const WALL_Z = -4.66; // pared del fondo, cara interior (normal +z)
const ROOM_MIN_X = -5.07;
const ROOM_MAX_Z = 4.4;

// La tira va en la junta piso-pared, por debajo del zocalo.
const LED_Y = 0.035;

const SEGMENTS = [
  {
    name: "skirting-back",
    a: [ROOM_MIN_X, LED_Y, WALL_Z],
    b: [WALL_X, LED_Y, WALL_Z],
    normal: [0, 0, 1],
    floorGlow: true,
    gap: SKIRTING_GAP,
  },
  {
    name: "skirting-right",
    a: [WALL_X, LED_Y, WALL_Z],
    b: [WALL_X, LED_Y, ROOM_MAX_Z],
    normal: [-1, 0, 0],
    floorGlow: true,
    gap: SKIRTING_GAP,
  },
  {
    // Bajo la repisa de libros: derrama luz hacia el escritorio.
    name: "shelf-underside",
    a: [0.88, 4.21, -4.22],
    b: [3.86, 4.21, -4.22],
    normal: [0, 0, 1],
    glowDown: true,
    wallGlowHeight: 0.3,
    wallGlowOpacity: 0.2,
  },
  // El canto frontal del escritorio queda descartado: al estar el tablero por
  // delante del respaldo de la silla, la tira se lee como una linea flotante
  // cruzando la silla en vez de como luz bajo el escritorio.
];

export default class LedStrips {
  constructor() {
    this.experience = new Experience();
    this.scene = this.experience.scene;

    this.coreGeometry = new PlaneGeometry(1, CORE_THICKNESS);
    this.glowGeometry = new PlaneGeometry(1, 1);
    this.wallGlowTexture = this.createGlowTexture([
      [0, 0.9],
      [0.14, 0.5],
      [0.4, 0.16],
      [1, 0],
    ]);
    this.floorGlowTexture = this.createGlowTexture([
      [0, 1],
      [0.2, 0.7],
      [0.55, 0.3],
      [1, 0],
    ]);

    this.coreMaterial = new MeshBasicMaterial({
      color: CORE_COLOR.clone().multiplyScalar(CORE_HDR_GAIN),
      toneMapped: false,
      side: DoubleSide,
      depthWrite: false,
    });

    this.setStrips();
  }

  createGlowTexture = (stops) => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 128;

    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, canvas.height, 0, 0);

    // v=0 (pegado a la tira) intenso, se apaga con la distancia siguiendo una
    // caida cuadratica: la luz artificial no llega lejos.
    stops.forEach(([offset, alpha]) => {
      gradient.addColorStop(offset, `rgba(255,255,255,${alpha})`);
    });

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;

    return texture;
  };

  createGlowMaterial = (opacity, map) =>
    new MeshBasicMaterial({
      color: GLOW_COLOR,
      map,
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });

  setStrips = () => {
    this.group = new Group();
    this.group.name = "ledStrips";

    SEGMENTS.forEach((segment) => {
      const { origin, length, basis, up, forward, x } =
        this.getSegmentFrame(segment);

      // Nucleo: linea fina pegada a la superficie.
      const core = new Mesh(this.coreGeometry, this.coreMaterial);
      core.name = `led-${segment.name}`;
      core.matrixAutoUpdate = false;
      core.matrix
        .copy(basis)
        .scale(new Vector3(length, 1, 1))
        .setPosition(origin);
      core.renderOrder = 3;

      // Halo corto sobre la pared (o cayendo desde la repisa).
      const glowHeight = segment.wallGlowHeight || WALL_GLOW_HEIGHT;
      const direction = segment.glowDown ? -1 : 1;
      const wallGlow = new Mesh(
        this.glowGeometry,
        this.createGlowMaterial(
          segment.wallGlowOpacity ?? WALL_GLOW_OPACITY,
          this.wallGlowTexture
        )
      );
      wallGlow.name = `led-wallglow-${segment.name}`;
      wallGlow.matrixAutoUpdate = false;
      wallGlow.matrix
        .copy(basis)
        .scale(new Vector3(length, glowHeight * direction, 1))
        .setPosition(
          origin.clone().addScaledVector(up, (glowHeight / 2) * direction)
        );
      wallGlow.renderOrder = 2;

      this.group.add(core, wallGlow);

      // Halo ancho sobre el piso: acostado, arranca en la pared y se apaga
      // hacia el centro del cuarto.
      if (segment.floorGlow) {
        const floorBasis = new Matrix4().makeBasis(x, forward, up);
        const floorCenter = new Vector3(origin.x, FLOOR_GLOW_Y, origin.z)
          .addScaledVector(forward, FLOOR_GLOW_WIDTH / 2);
        const floorGlow = new Mesh(
          this.glowGeometry,
          this.createGlowMaterial(FLOOR_GLOW_OPACITY, this.floorGlowTexture)
        );
        floorGlow.name = `led-floorglow-${segment.name}`;
        floorGlow.matrixAutoUpdate = false;
        floorGlow.matrix
          .copy(floorBasis)
          .scale(new Vector3(length, FLOOR_GLOW_WIDTH, 1))
          .setPosition(floorCenter);
        floorGlow.renderOrder = 1;

        this.group.add(floorGlow);
      }
    });

    this.scene.add(this.group);
  };

  // Punto medio sobre la superficie, longitud y base ortonormal: X sigue la
  // tira, Y es el "arriba" del plano y Z la normal de la superficie.
  getSegmentFrame = (segment) => {
    const a = new Vector3(...segment.a);
    const b = new Vector3(...segment.b);
    const normal = new Vector3(...segment.normal).normalize();

    const x = b.clone().sub(a);
    const length = x.length();
    x.normalize();

    const up = normal.clone().cross(x).normalize();
    const forward = x.clone().cross(up).normalize();

    const basis = new Matrix4().makeBasis(x, up, forward);
    const origin = a
      .clone()
      .add(b)
      .multiplyScalar(0.5)
      .addScaledVector(forward, segment.gap ?? LED_GAP);

    return { origin, length, basis, up, forward, x };
  };

  update = () => {};
}
