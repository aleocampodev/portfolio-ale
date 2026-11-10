import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";

import Experience from "./Experience.js";

// Sombras de contacto manuales.
//
// El plano de sombras de Baked.js solo recibe las sombras de room2 y room3: la
// geometria de room1 (puff, paredes, suelo) no proyecta, asi que el puff queda
// flotando sin apoyo. Estos discos con degradado radial le devuelven el contacto
// con el piso sin tocar la malla horneada.

const Y = 0.016; // por encima del piso (0.007) y del plano de sombras (0.011)

const CONTACTS = [
  {
    name: "puff",
    position: [-3.55, Y, 2.8],
    size: [3.1, 2.9],
    opacity: 0.65,
  },
];

export default class ContactShadows {
  constructor() {
    this.experience = new Experience();
    this.scene = this.experience.scene;
    this.geometry = new PlaneGeometry(1, 1);
    this.texture = this.createTexture();
    this.setShadows();
  }

  createTexture = () => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );

    // El centro no es negro puro: una sombra de contacto real nunca tapa la
    // textura del piso por completo.
    gradient.addColorStop(0, "rgba(24,14,10,0.9)");
    gradient.addColorStop(0.45, "rgba(24,14,10,0.65)");
    gradient.addColorStop(0.75, "rgba(24,14,10,0.28)");
    gradient.addColorStop(1, "rgba(24,14,10,0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;

    return texture;
  };

  setShadows = () => {
    CONTACTS.forEach((contact) => {
      const material = new MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        opacity: contact.opacity,
        depthWrite: false,
        toneMapped: false,
      });

      const mesh = new Mesh(this.geometry, material);
      mesh.name = `contact-shadow-${contact.name}`;
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(...contact.position);
      mesh.scale.set(contact.size[0], contact.size[1], 1);
      mesh.renderOrder = 2;

      this.scene.add(mesh);
    });
  };

  update = () => {};
}
