import {
  BufferAttribute,
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  ExtrudeGeometry,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  Path,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  Quaternion,
  SRGBColorSpace,
  ShadowMaterial,
  Vector3,
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

    // La cara de la X que se anadio en Blender es solo para el .blend; en la web
    // la chapa se pinta con su propia textura, asi que se quita del modelo.
    const bakedHelpers = ["X_Cara", "X_Logo3D"];
    bakedHelpers.forEach((name) => {
      const obj = this.model.room3 && this.model.room3.getObjectByName(name);
      if (obj) obj.removeFromParent();
    });

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
    // El objeto se llama "X" en el .blend actual; "Itchio" es el nombre antiguo.
    const plate =
      this.model.room3 &&
      (this.model.room3.getObjectByName("X") ||
        this.model.room3.getObjectByName("Itchio"));
    if (!plate) return;

    // La chapa y el logo 3D de X ya vienen modelados e integrados en room3.glb
    // con su placa base blanca/clara y el logo extruido en 3D con volumen idéntico a LinkedIn.
    // Mantenemos su material horneado para que el fondo y las sombras de luz coincidan al 100%,
    // y nombramos el objeto y su grupo 'x' para que la navegación por click funcione directamente.
    // La chapa se saca de room3 (donde el atlas la deja negra) y se cuelga de un
    // grupo "x" sobre el centro real de su malla, con su propia textura dibujada.
    plate.updateWorldMatrix(true, false);
    plate.geometry.computeBoundingBox();
    const bounds = plate.geometry.boundingBox
      .clone()
      .applyMatrix4(plate.matrixWorld);
    const center = bounds.getCenter(new Vector3());
    const size = plate.geometry.boundingBox.getSize(new Vector3());
    const worldQuaternion = plate.getWorldQuaternion(new Quaternion());
    // La chapa solo tiene marco: su centro cae dentro de la pared, asi que el
    // plano se adelanta media chapa hacia la sala (el grosor va en el eje Y
    // local de la malla).
    const normal = new Vector3(0, 1, 0).applyQuaternion(worldQuaternion);

    plate.name = "x";
    plate.visible = false;

    const group = new Group();
    group.name = "x";
    group.position.copy(center).addScaledVector(normal, size.y / 2 + 0.004);
    group.quaternion.copy(worldQuaternion);
    this.scene.add(group);

    // La chapa horneada ya trae el marco de madera (igual que LinkedIn y
    // GitHub); el plano solo tiene que tapar su cara negra interior.
    const side = Math.max(size.x, size.y, size.z) * 0.98;
    const plane = new Mesh(
      new PlaneGeometry(side, side),
      new MeshBasicMaterial({
        map: this.createLogoXTexture(),
        transparent: true,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    plane.name = "x";
    plane.rotation.x = -Math.PI / 2;
    group.add(plane);

    const logoShadow = this.createLogoXShadow();
    logoShadow.name = "x";
    logoShadow.rotation.x = -Math.PI / 2;
    logoShadow.position.set(0.008, 0.002, 0.008);
    group.add(logoShadow);

    const logo3d = this.createLogoXMesh();
    logo3d.name = "x";
    logo3d.rotation.x = -Math.PI / 2;
    logo3d.position.y = 0.006;
    group.add(logo3d);

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

    // Marco de madera, con la misma proporcion que el de LinkedIn y GitHub.
    const frame = ctx.createLinearGradient(0, 0, size * 0.25, size);
    frame.addColorStop(0, "#5d4a37");
    frame.addColorStop(0.45, "#4b3a2b");
    frame.addColorStop(1, "#3a2d21");
    ctx.fillStyle = frame;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.1);
    ctx.fill();

    // vetas muy suaves del marco
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.1);
    ctx.clip();
    for (let i = 0; i < 26; i++) {
      const y = (i / 26) * size + (Math.random() - 0.5) * 6;
      ctx.strokeStyle =
        i % 2 === 0 ? "rgba(120, 96, 70, 0.10)" : "rgba(30, 22, 16, 0.10)";
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(-10, y);
      ctx.bezierCurveTo(size * 0.3, y + 5, size * 0.7, y - 5, size + 10, y);
      ctx.stroke();
    }
    ctx.restore();

    // Panel interior con volumen: sombra suave abajo-derecha y filo iluminado
    // arriba, como el hueco donde van los iconos de las otras chapas.
    const pad = size * 0.115;
    const radius = size * 0.03;
    ctx.save();
    ctx.shadowColor = "rgba(92, 68, 44, 0.34)";
    ctx.shadowBlur = size * 0.022;
    ctx.shadowOffsetX = size * 0.004;
    ctx.shadowOffsetY = size * 0.009;
    const panel = ctx.createLinearGradient(0, pad, 0, size - pad);
    panel.addColorStop(0, "#f5ecdc");
    panel.addColorStop(1, "#e2d3bd");
    ctx.fillStyle = panel;
    ctx.beginPath();
    ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, radius);
    ctx.fill();
    ctx.restore();

    // Filo claro del panel (arriba-izquierda) y sombra fina (abajo-derecha).
    ctx.lineWidth = size * 0.009;
    ctx.strokeStyle = "rgba(255, 252, 244, 0.55)";
    ctx.beginPath();
    ctx.moveTo(pad + radius * 0.4, pad + size * 0.004);
    ctx.lineTo(size - pad - radius * 0.4, pad + size * 0.004);
    ctx.lineTo(pad + size * 0.004, pad + radius * 0.4);
    ctx.stroke();

    ctx.strokeStyle = "rgba(86, 62, 40, 0.35)";
    ctx.beginPath();
    ctx.moveTo(pad + radius * 0.4, size - pad - size * 0.004);
    ctx.lineTo(size - pad - radius * 0.4, size - pad - size * 0.004);
    ctx.lineTo(size - pad - size * 0.004, pad + radius * 0.4);
    ctx.stroke();

    // La X no se pinta aqui: va como pieza 3D extruida delante de la cara.
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = this.maxAnisotropy;
    texture.needsUpdate = true;
    return texture;
  };

  /**
   * X en 3D: el mismo trazado oficial, extruido, para que tenga profundidad y
   * no se vea como una calcomania plana.
   */
  createLogoXMesh = () => {
    const outline = [
      [18.901, 1.153], [22.581, 1.153], [14.541, 10.343], [24, 22.846],
      [16.594, 22.846], [10.794, 15.262], [4.156, 22.846], [0.474, 22.846],
      [9.074, 13.016], [0, 1.154], [7.594, 1.154], [12.837, 8.086],
    ];
    const holePoints = [
      [17.61, 20.644], [19.649, 20.644], [6.486, 3.24], [4.298, 3.24],
    ];

    const cx = 12;
    const cy = 12;
    const toX = (p) => p[0] - cx;
    const toY = (p) => cy - p[1];

    const shape = new Shape();
    outline.forEach((p, i) => {
      if (i === 0) shape.moveTo(toX(p), toY(p));
      else shape.lineTo(toX(p), toY(p));
    });
    shape.closePath();

    const hole = new Path();
    holePoints.forEach((p, i) => {
      if (i === 0) hole.moveTo(toX(p), toY(p));
      else hole.lineTo(toX(p), toY(p));
    });
    hole.closePath();
    shape.holes.push(hole);

    const geometry = new ExtrudeGeometry(shape, {
      depth: 3.4,
      bevelEnabled: true,
      bevelThickness: 0.45,
      bevelSize: 0.45,
      bevelSegments: 2,
      steps: 1,
    });

    // 24 unidades del trazado = 0.36 m en la sala.
    const scale = 0.36 / 24;
    geometry.scale(scale, scale, scale);

    // Cara casi negra y cantos mas claros: al ser una escena sin luces, el tono
    // del canto es lo que hace que se lea el grosor.
    const mesh = new Mesh(geometry, [
      new MeshBasicMaterial({ color: 0x121212 }),
      new MeshBasicMaterial({ color: 0x6b665d }),
    ]);
    mesh.castShadow = true;
    return mesh;
  };

  /**
   * Sombra de contacto de la X sobre la chapa: una copia plana del trazado,
   * desplazada, que hace que el logo despegue del fondo.
   */
  createLogoXShadow = () => {
    const outline = [
      [18.901, 1.153], [22.581, 1.153], [14.541, 10.343], [24, 22.846],
      [16.594, 22.846], [10.794, 15.262], [4.156, 22.846], [0.474, 22.846],
      [9.074, 13.016], [0, 1.154], [7.594, 1.154], [12.837, 8.086],
    ];
    const holePoints = [
      [17.61, 20.644], [19.649, 20.644], [6.486, 3.24], [4.298, 3.24],
    ];

    const shape = new Shape();
    outline.forEach((p, i) => {
      if (i === 0) shape.moveTo(p[0] - 12, 12 - p[1]);
      else shape.lineTo(p[0] - 12, 12 - p[1]);
    });
    shape.closePath();

    const hole = new Path();
    holePoints.forEach((p, i) => {
      if (i === 0) hole.moveTo(p[0] - 12, 12 - p[1]);
      else hole.lineTo(p[0] - 12, 12 - p[1]);
    });
    hole.closePath();
    shape.holes.push(hole);

    const geometry = new ShapeGeometry(shape, 8);
    const scale = 0.36 / 24;
    geometry.scale(scale, scale, scale);

    return new Mesh(
      geometry,
      new MeshBasicMaterial({
        color: 0x2a2118,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
    );
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
