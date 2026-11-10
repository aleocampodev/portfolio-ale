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
// (para que solo ellas entren en el bloom selectivo) y un halo aditivo con
// gradiente que simula el derrame de luz sobre la pared o el suelo.
//
// Cada segmento se define por dos puntos y una normal de la superficie sobre la
// que se pega. El nucleo queda separado por LED_GAP para evitar z-fighting.

const CORE_COLOR = new Color(1.0, 0.66, 0.36);
const CORE_HDR_GAIN = 2.6;
const GLOW_COLOR = new Color(1.0, 0.72, 0.45);
const GLOW_OPACITY = 0.3;
const LED_GAP = 0.008;

// Alto del nucleo (m) y alto por defecto del halo (m).
const CORE_THICKNESS = 0.02;
const GLOW_HEIGHT = 0.36;

// Medidas del modelo cargado (room1 / room2).
const WALL_X = 4.0; // pared derecha, cara interior (normal -x)
const WALL_Z = -4.66; // pared del fondo, cara interior (normal +z)
const ROOM_MIN_X = -5.07;
const ROOM_MAX_Z = 4.4;

const SKIRT_TOP = 0.235; // borde superior del zocalo

const SEGMENTS = [
  {
    name: "skirting-back",
    a: [ROOM_MIN_X, SKIRT_TOP, WALL_Z],
    b: [WALL_X, SKIRT_TOP, WALL_Z],
    normal: [0, 0, 1],
  },
  {
    name: "skirting-right",
    a: [WALL_X, SKIRT_TOP, WALL_Z],
    b: [WALL_X, SKIRT_TOP, ROOM_MAX_Z],
    normal: [-1, 0, 0],
  },
  // El canto frontal del escritorio queda descartado por ahora: al estar el
  // tablero por delante del respaldo de la silla, la tira se lee como una linea
  // flotante cruzando la silla en vez de como luz bajo el escritorio.
];

export default class LedStrips {
  constructor() {
    this.experience = new Experience();
    this.scene = this.experience.scene;

    this.coreGeometry = new PlaneGeometry(1, CORE_THICKNESS);
    this.glowGeometry = new PlaneGeometry(1, 1);
    this.glowTexture = this.createGlowTexture();

    this.coreMaterial = new MeshBasicMaterial({
      color: CORE_COLOR.clone().multiplyScalar(CORE_HDR_GAIN),
      toneMapped: false,
      side: DoubleSide,
      depthWrite: false,
    });

    this.setStrips();
  }

  createGlowTexture = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 128;

    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, canvas.height, 0, 0);

    // Abajo (pegado a la tira) intenso, se apaga hacia arriba: la luz
    // artificial cae muy rapido con la distancia.
    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
    gradient.addColorStop(0.18, "rgba(255,255,255,0.55)");
    gradient.addColorStop(0.5, "rgba(255,255,255,0.18)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;

    return texture;
  };

  setStrips = () => {
    this.group = new Group();
    this.group.name = "ledStrips";

    SEGMENTS.forEach((segment) => {
      const { origin, length, basis, up } = this.getSegmentFrame(segment);
      const scale = new Vector3(length, 1, 1);

      // Nucleo: plano largo y fino pegado a la superficie.
      const core = new Mesh(this.coreGeometry, this.coreMaterial);
      core.name = `led-${segment.name}`;
      core.matrixAutoUpdate = false;
      core.matrix.copy(basis).scale(scale).setPosition(origin);
      core.renderOrder = 3;

      // Halo: arranca en la tira y se apaga hacia fuera.
      const glowHeight = segment.glowHeight || GLOW_HEIGHT;
      const glowMaterial = new MeshBasicMaterial({
        color: GLOW_COLOR,
        map: this.glowTexture,
        transparent: true,
        opacity: segment.glowOpacity ?? GLOW_OPACITY,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      });

      const glow = new Mesh(this.glowGeometry, glowMaterial);
      glow.name = `led-glow-${segment.name}`;
      glow.matrixAutoUpdate = false;
      glow.matrix
        .copy(basis)
        .scale(new Vector3(length, glowHeight, 1))
        .setPosition(origin.clone().addScaledVector(up, glowHeight / 2));
      glow.renderOrder = 2;

      this.group.add(core, glow);
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
      .addScaledVector(forward, LED_GAP);

    return { origin, length, basis, up };
  };

  update = () => {};
}
