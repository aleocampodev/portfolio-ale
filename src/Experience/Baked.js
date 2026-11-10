import {
  BufferAttribute,
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  SRGBColorSpace,
  ShadowMaterial,
} from "three";
import Experience from "./Experience.js";
import { applyFloorWood } from "./Utils/FloorWoodTexture.js";

export default class Baked {
  constructor() {
    this.experience = new Experience();
    this.resources = this.experience.resources;
    this.scene = this.experience.scene;
    this.renderer = this.experience.renderer.instance;
    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.setModels();
  }

  setMaterial = (object, material) => {
    if (!object) return;
    object.traverse((child) => {
      if (child.isMesh) {
        child.material = material;
      }
    });
  };

  configureTexture = (texture) => {
    if (!texture) return null;
    texture.anisotropy = this.maxAnisotropy;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  };

  setModels = () => {
    this.model = {};

    this.model.room1 = this.resources.items._roomModel.scene;
    this.bakedTexture1 = this.configureTexture(this.resources.items.baked1);
    // El lightmap de la sala llega como imagen (webp): desactivamos el volteo
    // vertical para que las UV coincidan con el bake original.
    if (this.bakedTexture1) {
      this.bakedTexture1.flipY = false;
      this.bakedTexture1.needsUpdate = true;
    }
    this.model.material = new MeshBasicMaterial({
      map: this.bakedTexture1,
    });

    // El piso no usa el lightmap: lleva madera procedural continua, sin las
    // sombras horneadas de la alfombra, el arcade y las pesas.
    let floorMaterial = null;

    // El zocalo de la pared derecha es una tira 3D propia (Material_Socalo) cuya
    // zona del atlas esta horneada en negro por la sombra del arcade. Como es una
    // tira simple, se pinta con un blanco plano: uniforme de esquina a esquina.
    const skirtingMaterial = new MeshBasicMaterial({ color: 0xf6f5f1 });

    this.model.room1.traverse((child) => {
      if (child.isMesh) {
        const matName = (child.material && child.material.name) ? child.material.name.toLowerCase() : "";
        const meshName = child.name ? child.name.toLowerCase() : "";
        const isSkirting = matName.includes("socalo") || meshName.includes("socalo");
        const isFloor =
          matName.includes("piso") || meshName.includes("piso") || child.name === "Plane001_2";

        if (isSkirting) {
          child.material = skirtingMaterial;
        } else if (isFloor) {
          if (!floorMaterial) {
            floorMaterial = applyFloorWood(child, { anisotropy: this.maxAnisotropy });
          }
          child.material = floorMaterial || this.model.material;
          this.floorMesh = child;
        } else {
          child.material = this.model.material;
        }
      }
    });

    this.model.room2 = this.resources.items._roomModel2.scene;
    this.bakedTexture2 = this.configureTexture(this.resources.items.baked2);
    this.model.material2 = new MeshBasicMaterial({
      map: this.bakedTexture2,
    });

    this.model.room3 = this.resources.items._roomModel3.scene;
    this.bakedTexture3 = this.configureTexture(this.resources.items.baked3);
    this.model.material3 = new MeshBasicMaterial({
      map: this.bakedTexture3,
    });

    if (this.resources.items.linkedin) {
      this.model.linkedin = this.resources.items.linkedin.scene;
      this.model.linkedin.name = "linkedin";
      this.setMaterial(this.model.linkedin, this.model.material3);
      this.scene.add(this.model.linkedin);
    }

    if (this.resources.items.github) {
      this.model.github = this.resources.items.github.scene;
      this.model.github.name = "github";
      this.setMaterial(this.model.github, this.model.material3);
      this.scene.add(this.model.github);
    }

    this.model.room2 = this.resources.items._roomModel2.scene;
    this.setMaterial(this.model.room2, this.model.material2);
    this.setMaterial(this.model.room3, this.model.material3);

    this.scene.add(this.model.room1);
    this.scene.add(this.model.room2);
    this.scene.add(this.model.room3);

    this.setLogoX();

    // Eliminar silueta horneada duplicada de Github en room3:
    const bakedGithub = this.model.room3 && this.model.room3.getObjectByName("Github");
    if (bakedGithub) {
      bakedGithub.removeFromParent();
    }

    this.setShadows();
  };

  /**
   * El antiguo logo de itch.io pasa a ser el logo de X.
   *
   * `room3.glb` trae horneada la chapa del logo de itch.io: misma forma, tamano
   * y sitio en la pared que las de LinkedIn y GitHub. Se reutiliza esa misma
   * pieza (asi encaja perfecta en la rejilla de la pared) quitandola del modelo
   * horneado y dandole una textura propia con la X.
   *
   * El `x.glb` exportado aparte no se usa: su malla llega sin la cara frontal y
   * sus UV apuntan a una zona negra de `baked3` (el atlas se horneo antes de que
   * existiera la X), asi que se veia como un cuadrado negro.
   */
  setLogoX = () => {
    const plate = this.model.room3 && this.model.room3.getObjectByName("Itchio");
    if (!plate) return;

    // Sacar la chapa del modelo horneado sin moverla de sitio.
    this.scene.updateMatrixWorld(true);
    const world = plate.matrixWorld.clone();
    plate.removeFromParent();
    world.decompose(plate.position, plate.quaternion, plate.scale);

    plate.geometry.setAttribute("uv", this.getPlateUvs(plate.geometry));
    plate.name = "x";
    plate.material = new MeshBasicMaterial({
      map: this.createLogoXTexture(),
    });

    // La navegacion detecta los logos por el nombre del grupo padre, igual que
    // linkedin y github, asi que la chapa va dentro de un grupo "x".
    const group = new Group();
    group.name = "x";
    group.add(plate);
    this.scene.add(group);

    this.model.x = group;
  };

  /** UV planas para la chapa: la cara del logo vive en el plano local X/Z. */
  getPlateUvs = (geometry) => {
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    const width = max.x - min.x || 1;
    const height = max.z - min.z || 1;
    const position = geometry.attributes.position;
    const uv = new Float32Array(position.count * 2);

    for (let i = 0; i < position.count; i++) {
      uv[i * 2] = (position.getX(i) - min.x) / width;
      uv[i * 2 + 1] = (position.getZ(i) - min.z) / height;
    }

    return new BufferAttribute(uv, 2);
  };

  /**
   * Textura del logo de X, dibujada al vuelo.
   *
   * Reproduce el aspecto de las otras chapas (marco biselado oscuro y cara
   * clara) para que las tres se lean como una serie, con la X en el centro.
   */
  createLogoXTexture = () => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    // marco exterior (bisel)
    ctx.fillStyle = "#3a3128";
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 92);
    ctx.fill();

    // cara de la chapa, con el degradado de luz de la sala
    const face = ctx.createLinearGradient(0, 0, 0, size);
    face.addColorStop(0, "#efe1cd");
    face.addColorStop(1, "#ceb7a0");
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.roundRect(62, 62, size - 124, size - 124, 58);
    ctx.fill();

    // la X
    ctx.strokeStyle = "#2a231c";
    ctx.lineWidth = 84;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(146, 146);
    ctx.lineTo(366, 366);
    ctx.moveTo(366, 146);
    ctx.lineTo(146, 366);
    ctx.stroke();

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = this.maxAnisotropy;
    texture.needsUpdate = true;
    return texture;
  };

  /**
   * Sombras reales proyectadas sobre el piso.
   *
   * La sala esta horneada (todo `MeshBasicMaterial`, sin luces), asi que en vez
   * de iluminarla se anade:
   *  - una luz direccional que solo sirve para generar el mapa de sombras,
   *  - un plano extra con `ShadowMaterial` pegado al suelo, que es lo unico que
   *    recibe sombra.
   * Resultado: sombras con la forma real de cada objeto (hojas, asiento, patas)
   * sin alterar ni un pixel del bake de paredes y muebles.
   */
  setShadows = () => {
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // El escenario es casi estatico: recalcular el mapa de sombras cada frame
    // cuesta mas de la mitad del rendimiento, asi que se refresca a ~4 Hz.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    if (this.shadowTimer) clearInterval(this.shadowTimer);
    this.shadowTimer = setInterval(() => {
      this.renderer.shadowMap.needsUpdate = true;
    }, 250);

    // Solo los objetos proyectan. Los muros y el suelo no, porque taparian la
    // luz y la sala entera quedaria en sombra (no hay techo).
    [this.model.room2, this.model.room3, this.model.linkedin, this.model.github, this.model.x].forEach(
      (root) => {
        if (!root) return;
        root.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          // Las hojas son planos de una sola cara: si el mapa de sombras culea
          // las caras traseras, solo proyectan los bordes (lineas finas).
          if (child.material) child.material.shadowSide = DoubleSide;
        });
      }
    );

    // La luz entra por la ventana (pared +x) y cae hacia -x / -z.
    this.shadowLight = new DirectionalLight(0xffffff, 1);
    this.shadowLight.castShadow = true;
    this.shadowLight.position.set(8, 14, -2);
    this.shadowLight.target.position.set(0, 0, 0);
    this.scene.add(this.shadowLight);
    this.scene.add(this.shadowLight.target);

    const shadowCamera = this.shadowLight.shadow.camera;
    shadowCamera.left = -8;
    shadowCamera.right = 8;
    shadowCamera.top = 8;
    shadowCamera.bottom = -8;
    shadowCamera.near = 1;
    shadowCamera.far = 60;
    shadowCamera.updateProjectionMatrix();

    this.shadowLight.shadow.mapSize.set(4096, 4096);
    this.shadowLight.shadow.bias = -0.0006;
    this.shadowLight.shadow.normalBias = 0.02;
    this.shadowLight.shadow.radius = 1;

    if (!this.floorMesh) return;

    this.shadowMaterial = new ShadowMaterial({
      color: 0x000000,
      opacity: 0.55,
      transparent: true,
      depthWrite: false,
    });

    this.shadowPlane = new Mesh(this.floorMesh.geometry, this.shadowMaterial);
    this.shadowPlane.name = "ShadowPlane";
    this.shadowPlane.matrixAutoUpdate = false;
    this.shadowPlane.matrix.copy(this.floorMesh.matrixWorld);
    // 4 mm por encima del piso para evitar z-fighting.
    this.shadowPlane.matrix.elements[13] += 0.004;
    this.shadowPlane.receiveShadow = true;
    this.shadowPlane.castShadow = false;
    this.shadowPlane.renderOrder = 1;
    this.scene.add(this.shadowPlane);
  };
}
