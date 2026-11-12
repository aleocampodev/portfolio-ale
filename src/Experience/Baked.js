import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  ExtrudeGeometry,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  Path,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  Quaternion,
  SRGBColorSpace,
  ShadowMaterial,
  TorusGeometry,
  Vector3,
} from "three";
import Experience from "./Experience.js";

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

  /**
   * Elimina de la pared trasera (`baked1`) las sombras horneadas antiguas del
   * monitor derecho eliminado, de la barra vertical de la esquina y el recorte
   * oscuro que sobresalia sobre el monitor izquierdo (u in [0.460, 0.516],
   * v in [0.788, 0.998]), clonando el estuco rosa limpio contiguo de la misma
   * pared (u in [0.517, 0.531]) para conservar el grano y gradiente horizontal.
   */
  cleanBackWallShadows = (texture) => {
    if (!texture || !texture.image) return texture;

    const img = texture.image;
    const w = img.width;
    const h = img.height;
    if (!w || !h) return texture;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const xMin = Math.floor(0.459 * w);
    const xMax = Math.ceil(0.516 * w);
    const xSrcBase = Math.floor(0.518 * w);
    const xSrcSpan = Math.max(8, Math.floor(0.012 * w));

    const yMin = Math.floor(0.788 * h);
    const yMax = Math.ceil(0.998 * h);

    const regionW = xMax - xMin;
    const regionH = yMax - yMin;

    const targetData = ctx.getImageData(xMin, yMin, regionW, regionH);
    const srcData = ctx.getImageData(xSrcBase, yMin, xSrcSpan, regionH);
    const dst = targetData.data;
    const src = srcData.data;

    for (let ry = 0; ry < regionH; ry++) {
      for (let rx = 0; rx < regionW; rx++) {
        const idx = (ry * regionW + rx) * 4;
        const r = dst[idx];

        // Solo reparar los texels oscurecidos por las sombras antiguas (R < 222)
        if (r < 222) {
          const sx = (rx * 7 + ry * 3) % xSrcSpan;
          const sy = Math.min(regionH - 1, Math.max(0, ry + ((rx % 5) - 2)));
          const sIdx = (sy * xSrcSpan + sx) * 4;

          // Suave atenuacion vertical (0.975 abajo junto al tablero -> 1.0 arriba)
          const tVert = rx / Math.max(1, regionW - 1);
          const gain = 0.975 + 0.025 * tVert;

          // Fundido suave si el pixel esta cerca del umbral limpio (205..222)
          const blend = r > 205 ? (222 - r) / 17 : 1.0;

          const nr = Math.round(src[sIdx] * gain);
          const ng = Math.round(src[sIdx + 1] * gain);
          const nb = Math.round(src[sIdx + 2] * gain);

          dst[idx] = Math.round(r * (1 - blend) + nr * blend);
          dst[idx + 1] = Math.round(dst[idx + 1] * (1 - blend) + ng * blend);
          dst[idx + 2] = Math.round(dst[idx + 2] * (1 - blend) + nb * blend);
        }
      }
    }

    ctx.putImageData(targetData, xMin, yMin);

    // 2. Limpiar la sombra diagonal antigua que el viejo gabinete marron bajo
    // proyectaba sobre la pared trasera (u in [0.365, 0.460], v in [0.650, 0.788]),
    // muestreando a la misma altura `u` desde la franja limpia bajo la pizarra
    // (v in [0.610, 0.638]) para conservar el degradado vertical del zocalo LED:
    const cabXMin = Math.floor(0.365 * w);
    const cabXMax = Math.ceil(0.460 * w);
    const cabYMin = Math.floor(0.650 * h);
    const cabYMax = Math.ceil(0.788 * h);
    const cabYSrcBase = Math.floor(0.610 * h);
    const cabYSrcSpan = Math.max(8, Math.floor(0.026 * h));

    const cabW = cabXMax - cabXMin;
    const cabH = cabYMax - cabYMin;
    const cabTarget = ctx.getImageData(cabXMin, cabYMin, cabW, cabH);
    const cabSrc = ctx.getImageData(cabXMin, cabYSrcBase, cabW, cabYSrcSpan);
    const cDst = cabTarget.data;
    const cSrc = cabSrc.data;

    for (let ry = 0; ry < cabH; ry++) {
      // Fundido suave en los bordes izquierdo y derecho de la ventana de reparacion
      const edgeFadeY = Math.min(1, ry / 24, (cabH - 1 - ry) / 24);
      for (let rx = 0; rx < cabW; rx++) {
        const idx = (ry * cabW + rx) * 4;
        const r = cDst[idx];
        const sy = (rx * 5 + ry * 7) % cabYSrcSpan;
        const sx = Math.min(cabW - 1, Math.max(0, rx + ((ry % 3) - 1)));
        const sIdx = (sy * cabW + sx) * 4;
        const sr = cSrc[sIdx];

        // Si el texel es mas oscuro que la pared limpia a esa misma altura `u`
        if (r < sr - 2) {
          const diff = sr - r;
          const strength = Math.min(1, diff / 10) * edgeFadeY;

          cDst[idx] = Math.round(r * (1 - strength) + sr * strength);
          cDst[idx + 1] = Math.round(
            cDst[idx + 1] * (1 - strength) + cSrc[sIdx + 1] * strength
          );
          cDst[idx + 2] = Math.round(
            cDst[idx + 2] * (1 - strength) + cSrc[sIdx + 2] * strength
          );
        }
      }
    }

    ctx.putImageData(cabTarget, cabXMin, cabYMin);

    const cleanedTexture = new CanvasTexture(canvas);
    cleanedTexture.anisotropy = this.maxAnisotropy;
    cleanedTexture.colorSpace = SRGBColorSpace;
    cleanedTexture.flipY = false;
    cleanedTexture.needsUpdate = true;
    return cleanedTexture;
  };

  setModels = () => {
    this.model = {};

    this.model.room1 = this.resources.items._roomModel.scene;
    this.bakedTexture1 = this.cleanBackWallShadows(
      this.configureTexture(this.resources.items.baked1)
    );
    // El lightmap de la sala llega como imagen (webp): desactivamos el volteo
    // vertical para que las UV coincidan con el bake original.
    if (this.bakedTexture1) {
      this.bakedTexture1.flipY = false;
      this.bakedTexture1.needsUpdate = true;
    }
    this.model.material = new MeshBasicMaterial({
      map: this.bakedTexture1,
    });

    // El piso viejo (plano + textura procedural) se conserva por su geometria:
    // ShadowPlane lo usa como base. El piso visible ahora es PlankFloor
    // (InstancedMesh de tablones 3D), asi que la malla original se oculta.
    this.floorMesh = null;

    // El zocalo de la pared derecha es una tira 3D propia (Material_Socalo) cuya
    // zona del atlas esta horneada en negro por la sombra del arcade. Como es una
    // tira simple, se pinta con un blanco plano: uniforme de esquina a esquina.
    const skirtingMaterial = new MeshBasicMaterial({ color: 0xe3d9ce });

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
          // Visible en la escena pero no dibujado: sigue aportando su
          // matrixWorld (altura real del suelo) a ShadowPlane.
          child.visible = false;
          this.floorMesh = child;
        } else {
          child.material = this.model.material;
        }
      }
    });

    this.model.room2 = this.resources.items._roomModel2.scene;
    this.bakedTexture2 = this.configureTexture(this.resources.items.baked2);
    // Igual que baked1: el atlas llega como webp y necesita el mismo volteo
    // vertical para que las UV del glTF coincidan con los texeles.
    if (this.bakedTexture2) {
      this.bakedTexture2.flipY = false;
      this.bakedTexture2.needsUpdate = true;
    }
    if (this.bakedTexture2) {
      this.bakedTexture2.flipY = false;
      this.bakedTexture2.needsUpdate = true;
    }
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

    this.setDeskWoodTop();
    this.setShadows();
  };

  /**
   * Reconstruccion Parte 1 del escritorio: Tablero en L unificado de madera
   * clara calida (estilo roble miel escandinavo).
   *
   * 1. Oculta las caras de los dos tableros escalonados antiguos en `BAKED_2`
   *    (el principal en Y=1.919 y el retorno derecho bajo en Y=1.710) y estira
   *    el soporte blanco frontal derecho hasta la nueva altura unificada.
   * 2. Eleva la laptop cerrada en `BAKED_3` (+0.21m en Y) para que apoye sobre
   *    el nuevo retorno derecho nivelado a Y=1.9185.
   * 3. Construye las dos alas del tablero en L de madera con veta longitudinal
   *    y cantos biselados calidos.
   */
  setDeskWoodTop = () => {
    // 1. Filtrar tableros antiguos y ajustar soportes en room2 (BAKED_2)
    if (this.model.room2) {
      this.model.room2.traverse((child) => {
        if (child.isMesh && child.name === "LeftMonitor") {
          // LeftMonitor ya se renderiza e interactua desde LeftMonitorScreen.js;
          // ocultamos el duplicado estatico de room2 para evitar doble marco.
          child.visible = false;
          return;
        }
        if (child.isMesh && child.name.includes("BAKED_2.001")) {
          // BAKED_2.001 es la malla estatica duplicada de la silla dentro de room2;
          // Chair.js ya gestiona la silla interactiva (topChair.glb).
          child.visible = false;
          return;
        }
        if (!child.isMesh || child.name !== "BAKED_2") return;

        const tx = child.position.x;
        const ty = child.position.y;
        const tz = child.position.z;

        const geom = child.geometry.clone();
        const pos = geom.attributes.position;
        const index = geom.index;

        if (index) {
          const oldIndices = index.array;
          const newIndices = [];

          for (let i = 0; i < oldIndices.length; i += 3) {
            const i0 = oldIndices[i];
            const i1 = oldIndices[i + 1];
            const i2 = oldIndices[i + 2];

            const x0 = pos.getX(i0) + tx;
            const y0 = pos.getY(i0) + ty;
            const z0 = pos.getZ(i0) + tz;

            const x1 = pos.getX(i1) + tx;
            const y1 = pos.getY(i1) + ty;
            const z1 = pos.getZ(i1) + tz;

            const x2 = pos.getX(i2) + tx;
            const y2 = pos.getY(i2) + ty;
            const z2 = pos.getZ(i2) + tz;

            const minX = Math.min(x0, x1, x2);
            const maxX = Math.max(x0, x1, x2);
            const minY = Math.min(y0, y1, y2);
            const maxY = Math.max(y0, y1, y2);
            const minZ = Math.min(z0, z1, z2);
            const maxZ = Math.max(z0, z1, z2);

            const dx = maxX - minX;
            const dz = maxZ - minZ;

            // Las grandes caras planas de los 2 tableros antiguos miden > 0.95m
            // en X o Z y viven entre Y=1.56 y Y=1.922 (el mousepad esta en
            // Y=1.9279, por lo que queda 100% intacto).
            const isOldSlabFace =
              (dx > 0.95 || dz > 0.95) && minY >= 1.56 && maxY <= 1.922;

            // Los 40 triangulos del gabinete marron antiguo de 2 cajones a la
            // izquierda viven en maxX < 0.02 y maxZ < -3.30:
            const isOldBrownCabinet = maxX < 0.02 && maxZ < -3.30;

            // Bloque / caja negra antigua bajo el escritorio (X: 2.15..3.65, Z: -4.20..-0.95, Y: 0..1.45)
            const isOldPCTower =
              minX >= 2.10 &&
              maxX <= 3.65 &&
              minY >= 0.00 &&
              maxY <= 1.45 &&
              minZ >= -4.20 &&
              maxZ <= -0.95;

            // Antigua pata blanca frontal del retorno derecho en BAKED_2 (X: 2.75..4.02, Z: -1.25..-0.90)
            // que bloqueaba la apertura frontal del nicho del computador:
            const isOldReturnFrontLeg =
              minX >= 2.75 &&
              maxX <= 4.02 &&
              minZ >= -1.25 &&
              maxZ <= -0.90 &&
              maxY <= 1.86;

            if (
              !isOldSlabFace &&
              !isOldBrownCabinet &&
              !isOldPCTower &&
              !isOldReturnFrontLeg
            ) {
              newIndices.push(i0, i1, i2);
            }
          }

          geom.setIndex(newIndices);
        }

        const uv = geom.attributes.uv;

        // Ajustar altura superior de las patas para que lleguen a la base del
        // nuevo tablero de madera (Y = 1.855) sin dejar huecos.
        for (let i = 0; i < pos.count; i++) {
          const wx = pos.getX(i) + tx;
          const wy = pos.getY(i) + ty;
          const wz = pos.getZ(i) + tz;

          // Pata blanca frontal del retorno derecho (Z ~ -1.116..-0.986)
          if (wx >= 2.78 && wx <= 3.86 && wz >= -1.13 && wz <= -0.97) {
            if (wy >= 1.55 && wy <= 1.73) {
              pos.setY(i, 1.855 - ty);
            }
            if (wx >= 3.82) {
              pos.setX(i, 3.978 - tx);
            }
          }

          // Patas laterales y faldon trasero del escritorio principal
          if (wx >= 0.04 && wx <= 3.99 && wz >= -4.65 && wz <= -2.93) {
            if (wy >= 1.78 && wy <= 1.805) {
              pos.setY(i, 1.855 - ty);
            }
          }

          // Corregir UV del canto frontal de la pata blanca izquierda
          // (X = 0.051..0.182, Z = -2.945) que caia en una zona oscura del atlas:
          if (
            uv &&
            wx >= 0.04 &&
            wx <= 0.19 &&
            wz >= -2.96 &&
            wz <= -2.93 &&
            wy <= 1.86
          ) {
            uv.setXY(i, 0.74, 0.8);
          }
        }

        if (uv) uv.needsUpdate = true;

        pos.needsUpdate = true;
        geom.computeBoundingBox();
        geom.computeBoundingSphere();
        child.geometry = geom;
      });
    }

    // 2. Elevar la laptop cerrada del retorno derecho y trasladar los lapices /
    //    borrador a la bandeja inferior del Whiteboard en room3 (BAKED_3)
    if (this.model.room3) {
      this.model.room3.traverse((child) => {
        if (!child.isMesh || child.name !== "BAKED_3") return;

        const tx = child.position.x;
        const ty = child.position.y;
        const tz = child.position.z;

        const geom = child.geometry.clone();
        const pos = geom.attributes.position;

        for (let i = 0; i < pos.count; i++) {
          const wx = pos.getX(i) + tx;
          const wy = pos.getY(i) + ty;
          const wz = pos.getZ(i) + tz;

          // Laptop cerrada sobre el retorno derecho -> eliminada (colapsada fuera de escena)
          if (
            wx >= 3.05 &&
            wx <= 3.75 &&
            wy >= 1.65 &&
            wy <= 2.25 &&
            wz >= -2.55 &&
            wz <= -1.65
          ) {
            pos.setXYZ(i, 0, -50, 0);
          }

          // Lapices/marcadores y borrador que estaban sobre el gabinete marron
          // (X: -1.26..-0.93, Y: 1.45..1.79, Z: -4.45..-4.07) -> mover a la
          // bandeja inferior del Whiteboard (Y_top = 2.176m):
          if (
            wx >= -1.28 &&
            wx <= -0.92 &&
            wy >= 1.44 &&
            wy <= 1.80 &&
            wz >= -4.46 &&
            wz <= -4.05
          ) {
            if (wz > -4.22) {
              // Borrador / marcador acostado -> centro de la bandeja del Whiteboard
              const nx = (wx - -1.1015) + -3.28;
              const ny = (wy - 1.4639) + 2.176;
              const nz = (wz - -4.150) * 0.75 + -4.51;
              pos.setXYZ(i, nx - tx, ny - ty, nz - tz);
            } else {
              // Vaso con lapices/marcadores -> esquina derecha de la bandeja del Whiteboard
              const scaleCup = 0.72;
              const nx = (wx - -1.0965) * scaleCup + -2.36;
              const ny = (wy - 1.4639) * scaleCup + 2.176;
              const nz = (wz - -4.3255) * scaleCup + -4.50;
              pos.setXYZ(i, nx - tx, ny - ty, nz - tz);
            }
          }
          // Planta Monstera (maceta y hojas: wx in [2.2, 4.1], wy in [0.0, 2.3], wz in [-0.7, 1.3]):
          // Desplazar suavemente hacia la derecha (+0.35m en X) y hacia adelante (+0.35m en Z)
          // para despejar la vista de la CPU en el rincón derecho y alinearla junto a la lámpara de pie como en la referencia.
          if (
            wx >= 2.20 &&
            wx <= 4.10 &&
            wy >= 0.00 &&
            wy <= 2.30 &&
            wz >= -0.70 &&
            wz <= 1.30
          ) {
            pos.setXYZ(i, (wx + 0.35) - tx, wy - ty, (wz + 0.35) - tz);
          }
        }

        pos.needsUpdate = true;

        // Extraer los 274 triángulos continuos de la maceta de la monstera (índices 11573..11865, Y: 0.02..0.72)
        // para renderizarla 100% con material cerámico blanco puro, de base a borde superior sin corte
        if (geom.index) {
          const origIndices = geom.index.array;
          const keepIndices = [];
          const potIndices = [];
          for (let i = 0; i < origIndices.length; i += 3) {
            const i0 = origIndices[i];
            const i1 = origIndices[i + 1];
            const i2 = origIndices[i + 2];

            const isMonsteraPot =
              i0 >= 11573 && i0 <= 11865 &&
              i1 >= 11573 && i1 <= 11865 &&
              i2 >= 11573 && i2 <= 11865;

            if (isMonsteraPot) {
              potIndices.push(i0, i1, i2);
            } else {
              keepIndices.push(i0, i1, i2);
            }
          }

          geom.setIndex(keepIndices);

          if (potIndices.length > 0) {
            const potGeom = geom.clone();
            potGeom.setIndex(potIndices);
            potGeom.computeBoundingBox();
            potGeom.computeBoundingSphere();
            const potMat = new MeshStandardMaterial({
              color: 0xf5f3ee,
              roughness: 0.35,
              metalness: 0.04,
            });
            const potMesh = new Mesh(potGeom, potMat);
            potMesh.name = "MonsteraWhitePot";
            potMesh.position.set(tx, ty, tz);
            potMesh.rotation.copy(child.rotation);
            potMesh.scale.copy(child.scale);
            potMesh.castShadow = true;
            potMesh.receiveShadow = true;
            if (child.parent) {
              child.parent.add(potMesh);
            } else {
              this.scene.add(potMesh);
            }
          }
        }

        geom.computeBoundingBox();
        geom.computeBoundingSphere();
        child.geometry = geom;
      });
    }

    // 3. Crear el tablero en L de madera clara calida
    const deskGroup = new Group();
    deskGroup.name = "DeskWoodTopGroup";

    const topMainTex = this.createDeskWoodTopTexture(false);
    const topReturnTex = this.createDeskWoodTopTexture(true);
    const edgeTex = this.createDeskWoodEdgeTexture();

    const topMainMat = new MeshStandardMaterial({
      map: topMainTex,
      roughness: 0.42,
      metalness: 0.02,
      emissive: new Color(0xc88d5c),
      emissiveIntensity: 0.24,
    });

    const topReturnMat = new MeshStandardMaterial({
      map: topReturnTex,
      roughness: 0.42,
      metalness: 0.02,
      emissive: new Color(0xc88d5c),
      emissiveIntensity: 0.24,
    });

    const edgeMat = new MeshStandardMaterial({
      map: edgeTex,
      roughness: 0.46,
      metalness: 0.02,
      emissive: new Color(0xc48856),
      emissiveIntensity: 0.36,
    });

    const bottomMat = new MeshBasicMaterial({ color: 0x8c5d38 });

    // Altura superior en 1.9185 (0.5 mm bajo el mousepad en 1.919) y grosor de 8 cm
    const topY = 1.9185;
    const thickness = 0.08;
    const centerY = topY - thickness / 2;

    // Ala principal (bajo el monitor, teclado y raton):
    // X: 0.048 a 3.980 (3.932 m), Z: -4.638 a -2.942 (1.696 m)
    const mainWidth = 3.932;
    const mainDepth = 1.696;
    const mainGeo = new BoxGeometry(mainWidth, thickness, mainDepth);
    const mainMesh = new Mesh(mainGeo, [
      edgeMat, // +X
      edgeMat, // -X
      topMainMat, // +Y (cara superior)
      bottomMat, // -Y (cara inferior)
      edgeMat, // +Z (canto frontal)
      edgeMat, // -Z (canto trasero)
    ]);
    mainMesh.name = "DeskMainWoodTop";
    mainMesh.position.set(0.048 + mainWidth / 2, centerY, -4.638 + mainDepth / 2);
    mainMesh.castShadow = true;
    mainMesh.receiveShadow = false;
    deskGroup.add(mainMesh);

    // Ala derecha del retorno en L (bajo la laptop):
    // X: 2.792 a 3.980 (1.188 m), Z: -2.942 a -0.984 (1.958 m)
    const returnWidth = 1.188;
    const returnDepth = 1.958;
    const returnGeo = new BoxGeometry(returnWidth, thickness, returnDepth);
    const returnMesh = new Mesh(returnGeo, [
      edgeMat, // +X
      edgeMat, // -X (canto interior visible hacia la silla)
      topReturnMat, // +Y (cara superior con veta a lo largo de Z)
      bottomMat, // -Y
      edgeMat, // +Z (canto frontal derecho)
      edgeMat, // -Z (union interna con el ala principal)
    ]);
    returnMesh.name = "DeskReturnWoodTop";
    returnMesh.position.set(
      2.792 + returnWidth / 2,
      centerY,
      -2.942 + returnDepth / 2
    );
    returnMesh.castShadow = true;
    returnMesh.receiveShadow = false;
    deskGroup.add(returnMesh);

    // Paneles laterales blancos 3D: la pata izquierda bajo el ala principal
    // (X: 0.050..0.183, Z: -4.636..-2.942). El ala derecha queda soportada por
    // el mueble del computador (nicho con zócalo, costados y apertura frontal para el PC).
    const legSideMat = new MeshBasicMaterial({ color: 0xefebe4 });
    const legInnerMat = new MeshBasicMaterial({ color: 0xd8d2c9 });
    const legEdgeMat = new MeshBasicMaterial({ color: 0xe2ddd4 });

    const leftLegW = 0.133;
    const leftLegH = 1.825;
    const leftLegD = 1.694;
    const leftLegMesh = new Mesh(
      new BoxGeometry(leftLegW, leftLegH, leftLegD),
      [
        legInnerMat, // +X (interior bajo el escritorio)
        legSideMat, // -X (cara exterior blanca visible)
        legEdgeMat, // +Y
        legInnerMat, // -Y
        legEdgeMat, // +Z (borde frontal blanco definido)
        legInnerMat, // -Z
      ]
    );
    leftLegMesh.name = "DeskLeftWhiteLeg";
    leftLegMesh.position.set(
      0.05 + leftLegW / 2,
      0.02 + leftLegH / 2,
      -4.636 + leftLegD / 2
    );
    leftLegMesh.castShadow = true;
    deskGroup.add(leftLegMesh);

    // 4. Cajonera blanca izquierda de 4 cajones con tapa de madera a ras del
    //    escritorio (Parte 2: X = -1.220 a 0.046, Z = -4.636 a -2.942)
    this.addLeftWhiteDrawerCabinet(
      deskGroup,
      topMainMat,
      edgeMat,
      bottomMat,
      legSideMat,
      legInnerMat,
      legEdgeMat,
      centerY,
      thickness
    );

    // 5. Bandeja inferior porta-marcadores en el borde del Whiteboard
    this.addWhiteboardMarkerTray(deskGroup);

    // 6. Torre Gamer PC contemporánea con vidrio templado y ventiladores RGB
    this.addGamingPCTower(deskGroup);

    this.scene.add(deskGroup);
    this.model.deskWoodTop = deskGroup;
  };

  /**
   * Construye la cajonera blanca izquierda de 4 cajones con uñeros superiores
   * oscuros y tapa superior de madera de roble alineada a Y = 1.9185m.
   */
  addLeftWhiteDrawerCabinet = (
    deskGroup,
    topMainMat,
    edgeMat,
    bottomMat,
    legSideMat,
    legInnerMat,
    legEdgeMat,
    centerY,
    thickness
  ) => {
    const cabGroup = new Group();
    cabGroup.name = "DeskLeftDrawerCabinetGroup";

    const cabMinX = -1.22;
    const cabMaxX = 0.046;
    const cabWidth = cabMaxX - cabMinX; // 1.266 m
    const cabMinZ = -4.638;
    const cabMaxZ = -2.942;
    const cabDepth = cabMaxZ - cabMinZ; // 1.696 m

    // 1. Tapa superior de madera de roble sobre la cajonera (Y = 1.9185m)
    const cabTopMesh = new Mesh(
      new BoxGeometry(cabWidth, thickness, cabDepth),
      [
        edgeMat, // +X (junta sutil con el tablero principal)
        edgeMat, // -X (canto izquierdo visible)
        topMainMat, // +Y (cara superior de roble)
        bottomMat, // -Y
        edgeMat, // +Z (canto frontal)
        edgeMat, // -Z
      ]
    );
    cabTopMesh.name = "DeskCabinetWoodTop";
    cabTopMesh.position.set(
      cabMinX + cabWidth / 2,
      centerY,
      cabMinZ + cabDepth / 2
    );
    cabTopMesh.castShadow = true;
    cabTopMesh.receiveShadow = false;
    cabGroup.add(cabTopMesh);

    // 2. Cuerpo blanco y fondo oscuro tras las entrecalles y uñeros
    const bodyHeight = 1.825;
    const bodyCenterY = 0.02 + bodyHeight / 2;
    const darkRecessMat = new MeshBasicMaterial({ color: 0x221d1a });
    const drawerFaceMat = new MeshBasicMaterial({ color: 0xe4dfd6 });
    const drawerBevelMat = new MeshBasicMaterial({ color: 0xd5cfc5 });
    const plinthMat = new MeshBasicMaterial({ color: 0xddd7ce });

    // Panel lateral izquierdo blanco con espesor real (4.5 cm)
    const sideWallThick = 0.045;
    const leftSideWall = new Mesh(
      new BoxGeometry(sideWallThick, bodyHeight, cabDepth),
      [
        legInnerMat, // +X
        legSideMat, // -X (cara exterior izquierda iluminada)
        legEdgeMat, // +Y
        legInnerMat, // -Y
        legEdgeMat, // +Z (borde frontal izquierdo blanco)
        legInnerMat, // -Z
      ]
    );
    leftSideWall.position.set(
      cabMinX + sideWallThick / 2,
      bodyCenterY,
      cabMinZ + cabDepth / 2
    );
    leftSideWall.castShadow = true;
    cabGroup.add(leftSideWall);

    // Caja interior retranqueada 2.6 cm en el frente para dar sombra real a
    // las entrecalles entre cajones y a los 4 uñeros superiores:
    const innerWidth = cabWidth - sideWallThick;
    const innerDepth = cabDepth - 0.026;
    const innerCarcass = new Mesh(
      new BoxGeometry(innerWidth, bodyHeight, innerDepth),
      [
        legInnerMat, // +X
        legInnerMat, // -X
        legInnerMat, // +Y
        legInnerMat, // -Y
        darkRecessMat, // +Z (fondo oscuro para uñeros y entrecalles)
        legInnerMat, // -Z
      ]
    );
    innerCarcass.position.set(
      cabMinX + sideWallThick + innerWidth / 2,
      bodyCenterY,
      cabMinZ + innerDepth / 2
    );
    innerCarcass.castShadow = true;
    cabGroup.add(innerCarcass);

    // Zocalo inferior blanco y travesaño superior blanco en el frente
    const drawerCenterX = cabMinX + sideWallThick + innerWidth / 2 - 0.004;
    const drawerW = innerWidth - 0.022;
    const plinthH = 0.082;
    const plinthMesh = new Mesh(
      new BoxGeometry(drawerW, plinthH, 0.024),
      [
        drawerBevelMat,
        drawerBevelMat,
        drawerBevelMat,
        drawerBevelMat,
        plinthMat,
        drawerBevelMat,
      ]
    );
    plinthMesh.position.set(
      drawerCenterX,
      0.02 + plinthH / 2,
      cabMaxZ - 0.012
    );
    cabGroup.add(plinthMesh);

    const topRailH = 0.026;
    const topRailMesh = new Mesh(
      new BoxGeometry(drawerW, topRailH, 0.024),
      [
        drawerBevelMat,
        drawerBevelMat,
        drawerBevelMat,
        drawerBevelMat,
        plinthMat,
        drawerBevelMat,
      ]
    );
    topRailMesh.position.set(
      drawerCenterX,
      1.8385 - topRailH / 2,
      cabMaxZ - 0.012
    );
    cabGroup.add(topRailMesh);

    // 3. Los 4 frentes de cajon con hendidura superior centrada (uñero)
    const halfW = drawerW / 2;
    const notchTopHalf = 0.145;
    const notchBotHalf = 0.105;
    const notchDepth = 0.044;

    const drawerSpecs = [
      { yMin: 0.116, h: 0.482 }, // Cajon 4 (inferior, mas alto)
      { yMin: 0.613, h: 0.382 }, // Cajon 3
      { yMin: 1.010, h: 0.382 }, // Cajon 2
      { yMin: 1.407, h: 0.382 }, // Cajon 1 (superior)
    ];

    drawerSpecs.forEach((spec, idx) => {
      const h = spec.h;
      const shape = new Shape();
      // Contorno del cajon con recorte trapezoidal centrado en el borde superior
      shape.moveTo(-halfW, 0);
      shape.lineTo(halfW, 0);
      shape.lineTo(halfW, h);
      shape.lineTo(notchTopHalf, h);
      shape.lineTo(notchBotHalf, h - notchDepth);
      shape.lineTo(-notchBotHalf, h - notchDepth);
      shape.lineTo(-notchTopHalf, h);
      shape.lineTo(-halfW, h);
      shape.closePath();

      const extrudeGeo = new ExtrudeGeometry(shape, {
        depth: 0.022,
        bevelEnabled: true,
        bevelThickness: 0.003,
        bevelSize: 0.003,
        bevelSegments: 2,
      });

      const drawerMesh = new Mesh(extrudeGeo, [
        drawerFaceMat, // Cara frontal (+Z/-Z)
        drawerBevelMat, // Cantos y bisel del uñero
      ]);
      drawerMesh.name = `DeskLeftDrawer_${idx + 1}`;
      drawerMesh.position.set(drawerCenterX, spec.yMin, cabMaxZ - 0.024);
      drawerMesh.castShadow = true;
      cabGroup.add(drawerMesh);
    });

    deskGroup.add(cabGroup);
  };

  /**
   * Bandeja soporte en el borde inferior del Whiteboard donde descansan el
   * vaso de lapices/marcadores y el borrador.
   */
  addWhiteboardMarkerTray = (deskGroup) => {
    const trayGroup = new Group();
    trayGroup.name = "WhiteboardMarkerTray";

    const trayMat = new MeshBasicMaterial({ color: 0x57524e });
    const trayTopMat = new MeshBasicMaterial({ color: 0x6e6863 });
    const trayEdgeMat = new MeshBasicMaterial({ color: 0x45403d });

    const trayW = 1.42;
    const trayH = 0.026;
    const trayD = 0.25;
    const trayCenterX = -2.82;
    const trayTopY = 2.175;
    const trayCenterZ = -4.53;

    const baseMesh = new Mesh(new BoxGeometry(trayW, trayH, trayD), [
      trayEdgeMat,
      trayEdgeMat,
      trayTopMat,
      trayEdgeMat,
      trayMat,
      trayEdgeMat,
    ]);
    baseMesh.position.set(trayCenterX, trayTopY - trayH / 2, trayCenterZ);
    trayGroup.add(baseMesh);

    // Labio frontal de contencion de la bandeja
    const lipH = 0.036;
    const lipD = 0.018;
    const lipMesh = new Mesh(new BoxGeometry(trayW, lipH, lipD), [
      trayEdgeMat,
      trayEdgeMat,
      trayTopMat,
      trayEdgeMat,
      trayMat,
      trayEdgeMat,
    ]);
    lipMesh.position.set(
      trayCenterX,
      trayTopY - trayH + lipH / 2,
      trayCenterZ + trayD / 2 - lipD / 2
    );
    trayGroup.add(lipMesh);

    deskGroup.add(trayGroup);
  };

  /**
   * Construye la torre de PC gamer contemporánea bajo el ala derecha del
   * escritorio, fiel a la imagen de referencia: chasis negro mate, panel lateral
   * de vidrio templado transparente, componentes internos y ventiladores con
   * halos LED RGB en tono violeta/magenta (0xb838ff).
   */
  /**
   * Construye el mueble del computador bajo el ala derecha del escritorio
   * (nicho/compartimento blanco abierto hacia la habitación) y aloja la torre
   * contemporánea con los ventiladores RGB violeta en el frente (+Z) y el lateral
   * de vidrio templado a la izquierda (-X), corrida hacia la pared exterior y
   * 100% visible sin obstrucciones, exactamente como en la imagen de referencia.
   */
  addGamingPCTower = (deskGroup) => {
    const pcGroup = new Group();
    pcGroup.name = "GamingPCTowerGroup";

    const whiteMat = new MeshStandardMaterial({
      color: 0xf5f3ee,
      roughness: 0.40,
      metalness: 0.04,
    });
    const chassisMat = new MeshStandardMaterial({
      color: 0x141416,
      roughness: 0.5,
      metalness: 0.4,
    });
    const innerChassisMat = new MeshStandardMaterial({
      color: 0x0f0f12,
      roughness: 0.8,
      metalness: 0.1,
    });
    const accentMat = new MeshStandardMaterial({
      color: 0x202025,
      roughness: 0.35,
      metalness: 0.55,
    });
    const footMat = new MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.9,
    });

    // 1. Mueble blanco del computador (nicho en el rincón derecho bajo el retorno):
    // En la imagen de referencia, el nicho del PC ocupa exclusivamente el rincón derecho
    // (X: 3.42 a 3.98 m, centro 3.70 m), dejando el resto del retorno (X: 2.792 a 3.42 m) totalmente
    // libre y abierto para las piernas y la silla.
    // La cara frontal (+Z en Z = -1.020 m) está abierta mostrando los ventiladores de la torre.
    const muebleMinX = 3.420;
    const muebleMaxX = 3.980;
    const muebleW = muebleMaxX - muebleMinX; // 0.560 m
    const muebleCenterX = (muebleMinX + muebleMaxX) / 2; // 3.700 m
    const muebleMinZ = -2.200;
    const muebleMaxZ = -1.020;
    const muebleD = muebleMaxZ - muebleMinZ; // 1.180 m
    const muebleCenterZ = (muebleMinZ + muebleMaxZ) / 2; // -1.610 m
    const deskUnderY = 1.8785;
    const floorY = 0.020;
    const legH = deskUnderY - floorY; // 1.8585 m
    const sideThick = 0.045;

    // Costado derecho del mueble (pegado a la pared lateral derecha):
    const rightPanel = new Mesh(
      new BoxGeometry(sideThick, legH, muebleD),
      whiteMat
    );
    rightPanel.name = "MuebleRightPanel";
    rightPanel.position.set(muebleMaxX - sideThick / 2, floorY + legH / 2, muebleCenterZ);
    rightPanel.castShadow = true;
    rightPanel.receiveShadow = true;
    pcGroup.add(rightPanel);

    // Costado izquierdo del mueble (divisor hacia el espacio de piernas en X = 3.42):
    const leftPanel = new Mesh(
      new BoxGeometry(sideThick, legH, muebleD),
      whiteMat
    );
    leftPanel.name = "MuebleLeftPanel";
    leftPanel.position.set(muebleMinX + sideThick / 2, floorY + legH / 2, muebleCenterZ);
    leftPanel.castShadow = true;
    leftPanel.receiveShadow = true;
    pcGroup.add(leftPanel);

    // Pata frontal izquierda del retorno (soporte de la esquina interior del tablero en X = 2.792):
    const frontLegCorner = new Mesh(
      new BoxGeometry(sideThick, legH, 0.08),
      whiteMat
    );
    frontLegCorner.position.set(2.792 + sideThick / 2, floorY + legH / 2, muebleMaxZ + 0.04);
    frontLegCorner.castShadow = true;
    pcGroup.add(frontLegCorner);

    // Zócalo / base inferior sobre el piso para el PC (Y: 0.02 a 0.08 m):
    const plinthH = 0.060;
    const plinth = new Mesh(
      new BoxGeometry(muebleW, plinthH, muebleD),
      whiteMat
    );
    plinth.name = "MuebleBottomPlinth";
    plinth.position.set(muebleCenterX, floorY + plinthH / 2, muebleCenterZ);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    pcGroup.add(plinth);

    // Fondo trasero del nicho del PC:
    const innerW = muebleW - sideThick * 2; // 0.470 m
    const backWall = new Mesh(
      new BoxGeometry(innerW, legH - plinthH, sideThick),
      whiteMat
    );
    backWall.name = "MuebleBackWall";
    backWall.position.set(
      muebleCenterX,
      floorY + plinthH + (legH - plinthH) / 2,
      muebleMinZ + sideThick / 2
    );
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    pcGroup.add(backWall);

    // Techo interior bajo el tablero de madera:
    const innerTop = new Mesh(
      new BoxGeometry(innerW, 0.030, muebleD - sideThick),
      whiteMat
    );
    innerTop.name = "MuebleInnerTop";
    innerTop.position.set(
      muebleCenterX,
      deskUnderY - 0.015,
      muebleCenterZ + sideThick / 2
    );
    pcGroup.add(innerTop);

    // 2. Torre Gamer PC:
    // Alojada de forma justa dentro del nicho derecho (X = 3.70 m),
    // con los ventiladores RGB violeta en la cara frontal (+Z)
    // mirando hacia la habitación/cámara, y el lateral de vidrio templado en (-X)
    // visible hacia el espacio de la silla.
    const caseWidth = 0.36; // grosor en X
    const caseDepth = 0.68; // profundidad en Z
    const caseHeight = 1.26; // altura en Y
    const pcPlinthY = floorY + plinthH; // 0.080 m
    const footH = 0.025;
    const caseBottomY = pcPlinthY + footH; // 0.105 m
    const caseCenterY = caseBottomY + caseHeight / 2; // 0.735 m

    // Centrada en el compartimento de la torre:
    const pcCenterX = muebleCenterX; // 3.700 m
    // Cara frontal del PC a 0.03 m del frente del nicho:
    const pcFrontZ = muebleMaxZ - 0.03; // -1.050 m
    const pcCenterZ = pcFrontZ - caseDepth / 2; // -1.390 m

    // Patas de la torre sobre el zócalo blanco:
    const footRadius = 0.016;
    const footGeom = new CylinderGeometry(footRadius, footRadius, footH, 16);
    const fxOffsets = [-caseWidth / 2 + 0.04, caseWidth / 2 - 0.04];
    const fzOffsets = [-caseDepth / 2 + 0.06, caseDepth / 2 - 0.06];
    fxOffsets.forEach((ox) => {
      fzOffsets.forEach((oz) => {
        const foot = new Mesh(footGeom, footMat);
        foot.position.set(pcCenterX + ox, pcPlinthY + footH / 2, pcCenterZ + oz);
        foot.castShadow = true;
        pcGroup.add(foot);
      });
    });

    // Panel superior de la torre con rejilla antipolvo:
    const topPanelH = 0.022;
    const topPanel = new Mesh(
      new BoxGeometry(caseWidth, topPanelH, caseDepth),
      chassisMat
    );
    topPanel.position.set(pcCenterX, caseBottomY + caseHeight - topPanelH / 2, pcCenterZ);
    topPanel.castShadow = true;
    pcGroup.add(topPanel);

    // PSU Shroud en la base:
    const psuHeight = 0.16;
    const psuShroud = new Mesh(
      new BoxGeometry(caseWidth - 0.015, psuHeight, caseDepth - 0.02),
      innerChassisMat
    );
    psuShroud.position.set(pcCenterX, caseBottomY + psuHeight / 2, pcCenterZ);
    psuShroud.castShadow = true;
    pcGroup.add(psuShroud);

    // Pared trasera de la torre (-Z):
    const rearWall = new Mesh(
      new BoxGeometry(caseWidth, caseHeight - topPanelH, 0.018),
      chassisMat
    );
    rearWall.position.set(
      pcCenterX,
      caseCenterY - topPanelH / 2,
      pcCenterZ - caseDepth / 2 + 0.009
    );
    rearWall.castShadow = true;
    pcGroup.add(rearWall);

    // Pared lateral derecha ciega (+X contra la pared):
    const rightCaseWall = new Mesh(
      new BoxGeometry(0.016, caseHeight - topPanelH, caseDepth),
      chassisMat
    );
    rightCaseWall.position.set(
      pcCenterX + caseWidth / 2 - 0.008,
      caseCenterY - topPanelH / 2,
      pcCenterZ
    );
    rightCaseWall.castShadow = true;
    pcGroup.add(rightCaseWall);

    // Marco frontal de la torre (+Z):
    const frontFrame = new Mesh(
      new BoxGeometry(caseWidth, caseHeight - topPanelH, 0.022),
      accentMat
    );
    frontFrame.position.set(
      pcCenterX,
      caseCenterY - topPanelH / 2,
      pcCenterZ + caseDepth / 2 - 0.011
    );
    frontFrame.castShadow = true;
    pcGroup.add(frontFrame);

    // 3. Dos Ventiladores RGB violeta colocados en la cara FRONTAL (+Z):
    // Miran directamente hacia el frente de la habitación / cámara isométrica.
    const fanMat = new MeshBasicMaterial({
      color: new Color(0x8b5cf6).multiplyScalar(3.2),
      toneMapped: false,
    });
    const fanGlowMat = new MeshBasicMaterial({
      color: new Color(0xd8b4ff).multiplyScalar(3.6),
      toneMapped: false,
    });
    const fanPlateMat = new MeshStandardMaterial({
      color: 0x0b0b0f,
      roughness: 0.7,
      metalness: 0.2,
    });
    const fanBladeMat = new MeshStandardMaterial({
      color: 0x17171c,
      roughness: 0.5,
      metalness: 0.3,
    });
    const fanCenterMat = new MeshStandardMaterial({ color: 0x0d0d11, roughness: 0.4 });

    const createFrontFan = (x, y, z) => {
      const fGroup = new Group();

      const plate = new Mesh(
        new CylinderGeometry(0.125, 0.125, 0.006, 32),
        fanPlateMat
      );
      plate.rotation.x = Math.PI / 2;
      fGroup.add(plate);

      for (let b = 0; b < 6; b += 1) {
        const blade = new Mesh(new BoxGeometry(0.026, 0.068, 0.004), fanBladeMat);
        const angle = (b / 6) * Math.PI * 2;
        blade.position.set(
          Math.cos(angle) * 0.050,
          Math.sin(angle) * 0.050,
          0.005
        );
        blade.rotation.z = angle;
        fGroup.add(blade);
      }

      const ring = new Mesh(new TorusGeometry(0.112, 0.011, 12, 40), fanMat);
      ring.position.z = 0.008;
      fGroup.add(ring);

      const hub = new Mesh(new CylinderGeometry(0.030, 0.030, 0.018, 20), fanCenterMat);
      hub.rotation.x = Math.PI / 2;
      hub.position.z = 0.008;
      fGroup.add(hub);

      const hubDot = new Mesh(new TorusGeometry(0.015, 0.003, 8, 20), fanGlowMat);
      hubDot.position.z = 0.019;
      fGroup.add(hubDot);

      fGroup.position.set(x, y, z);
      return fGroup;
    };

    const fansFrontZ = pcCenterZ + caseDepth / 2 + 0.005; // -1.055 m
    const fan1 = createFrontFan(pcCenterX, caseBottomY + caseHeight * 0.72, fansFrontZ);
    const fan2 = createFrontFan(pcCenterX, caseBottomY + caseHeight * 0.30, fansFrontZ);
    pcGroup.add(fan1);
    pcGroup.add(fan2);

    // 4. Panel lateral de Vidrio Templado en la cara izquierda (-X):
    // Mira hacia el espacio central y la silla, visible en ángulo de 45° por la cámara isométrica.
    const glassThick = 0.006;
    const glassW = caseDepth - 0.06; // profundidad a lo largo de Z
    const glassH = caseHeight - topPanelH - 0.02;
    const glassMat = new MeshPhysicalMaterial({
      color: 0x120a22,
      transparent: true,
      opacity: 0.25,
      roughness: 0.04,
      metalness: 0.1,
      transmission: 0.88,
      ior: 1.52,
    });
    const glassPanel = new Mesh(
      new BoxGeometry(glassThick, glassH, glassW),
      glassMat
    );
    const glassX = pcCenterX - caseWidth / 2 + glassThick / 2;
    glassPanel.position.set(glassX, caseCenterY - topPanelH / 2, pcCenterZ - 0.01);
    pcGroup.add(glassPanel);

    // Luz violeta interna proyectada a través del cristal:
    const innerGlow = new Mesh(
      new PlaneGeometry(glassW - 0.06, glassH - 0.15),
      new MeshBasicMaterial({
        map: this.createRadialGlowTexture([
          [0, "rgba(160, 95, 255, 0.70)"],
          [0.55, "rgba(120, 65, 230, 0.30)"],
          [1, "rgba(90, 50, 200, 0)"],
        ]),
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      })
    );
    innerGlow.rotation.y = -Math.PI / 2;
    innerGlow.position.set(pcCenterX - 0.02, caseCenterY + 0.04, pcCenterZ - 0.01);
    pcGroup.add(innerGlow);

    // Componentes internos (Motherboard, GPU y Disipador CPU):
    const mobo = new Mesh(
      new BoxGeometry(0.008, 0.58, 0.44),
      new MeshStandardMaterial({ color: 0x121318, roughness: 0.7 })
    );
    mobo.position.set(pcCenterX + caseWidth / 2 - 0.03, caseCenterY + 0.08, pcCenterZ - 0.02);
    pcGroup.add(mobo);

    const gpuGroup = new Group();
    const gpuBody = new Mesh(
      new BoxGeometry(0.14, 0.060, 0.34),
      new MeshStandardMaterial({ color: 0x1c1d22, metalness: 0.6, roughness: 0.3 })
    );
    gpuGroup.add(gpuBody);
    const gpuLed = new Mesh(
      new BoxGeometry(0.008, 0.015, 0.32),
      new MeshBasicMaterial({
        color: new Color(0x8b5cf6).multiplyScalar(2.4),
        toneMapped: false,
      })
    );
    gpuLed.position.set(-0.07, 0, 0);
    gpuGroup.add(gpuLed);
    gpuGroup.position.set(pcCenterX, caseBottomY + psuHeight + 0.18, pcCenterZ - 0.02);
    pcGroup.add(gpuGroup);

    const cpuCooler = new Mesh(
      new CylinderGeometry(0.055, 0.055, 0.028, 24),
      new MeshStandardMaterial({ color: 0x18181c, metalness: 0.4 })
    );
    cpuCooler.rotation.z = Math.PI / 2;
    cpuCooler.position.set(pcCenterX + 0.06, caseCenterY + 0.22, pcCenterZ - 0.02);
    pcGroup.add(cpuCooler);

    const cpuHalo = new Mesh(
      new TorusGeometry(0.048, 0.007, 12, 28),
      new MeshBasicMaterial({
        color: new Color(0x8b5cf6).multiplyScalar(2.6),
        toneMapped: false,
      })
    );
    cpuHalo.rotation.y = Math.PI / 2;
    cpuHalo.position.set(pcCenterX + 0.045, caseCenterY + 0.22, pcCenterZ - 0.02);
    pcGroup.add(cpuHalo);

    const rgbLight = new PointLight(0x8b5cf6, 4.2, 2.6, 1.8);
    rgbLight.position.set(pcCenterX - 0.08, caseCenterY + 0.08, pcCenterZ);
    pcGroup.add(rgbLight);

    deskGroup.add(pcGroup);
  };

  /**
   * Gradiente radial configurable. Se usa para el rebote de luz del PC en el
   * piso, que necesita un halo violeta aditivo en lugar del contacto oscuro.
   */
  createRadialGlowTexture = (stops) => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    stops.forEach(([offset, color]) => grad.addColorStop(offset, color));

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  };

  /**
   * Genera una textura radial suave para la micro-oclusión de contacto
   * debajo de las patas del PC, sin crear manchas rígidas sobre el piso.
   */
  createFootContactTexture = () => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2
    );
    grad.addColorStop(0, "rgba(18, 12, 10, 0.85)");
    grad.addColorStop(0.45, "rgba(18, 12, 10, 0.45)");
    grad.addColorStop(1, "rgba(18, 12, 10, 0)");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  };

  /**
   * Textura de madera roble claro calido para la superficie del tablero en L.
   * Si `verticalGrain` es true, la veta corre a lo largo del eje V (Z en mundo)
   * para acompaniar la direccion del retorno derecho.
   */
  createDeskWoodTopTexture = (verticalGrain = false) => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    if (verticalGrain) {
      ctx.translate(size / 2, size / 2);
      ctx.rotate(Math.PI / 2);
      ctx.translate(-size / 2, -size / 2);
    }

    // Base calida de roble miel claro
    const baseGrad = ctx.createLinearGradient(0, 0, size, size);
    baseGrad.addColorStop(0, "#e6bc92");
    baseGrad.addColorStop(0.5, "#dcaee0".replace("#dcaee0", "#dcad80"));
    baseGrad.addColorStop(1, "#cfa072");
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, size, size);

    // Listones alistonados sutiles (butcher-block escandinavo)
    const strips = 7;
    const stripH = size / strips;
    const stripPalette = [
      "rgba(238, 196, 154, 0.28)",
      "rgba(214, 164, 118, 0.22)",
      "rgba(232, 188, 145, 0.25)",
      "rgba(204, 152, 106, 0.24)",
      "rgba(240, 200, 160, 0.26)",
      "rgba(218, 168, 122, 0.22)",
      "rgba(228, 182, 138, 0.25)",
    ];

    for (let s = 0; s < strips; s++) {
      ctx.fillStyle = stripPalette[s % stripPalette.length];
      ctx.fillRect(0, s * stripH, size, stripH);

      // Linea fina de union entre listones
      if (s > 0) {
        ctx.strokeStyle = "rgba(155, 104, 62, 0.24)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, s * stripH);
        ctx.lineTo(size, s * stripH);
        ctx.stroke();
      }
    }

    // Vetas longitudinales suaves y organicas
    for (let i = 0; i < 160; i++) {
      const y = (i / 160) * size;
      const alpha = 0.035 + (i % 5) * 0.012;
      ctx.strokeStyle =
        i % 2 === 0
          ? `rgba(142, 92, 50, ${alpha})`
          : `rgba(255, 228, 196, ${alpha * 0.9})`;
      ctx.lineWidth = 1.0 + (i % 3) * 0.9;
      ctx.beginPath();
      ctx.moveTo(0, y);
      const wave = ((i * 37) % 15) - 7;
      ctx.bezierCurveTo(
        size * 0.33,
        y + wave,
        size * 0.66,
        y - wave,
        size,
        y
      );
      ctx.stroke();
    }

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = this.maxAnisotropy;
    texture.needsUpdate = true;
    return texture;
  };

  /**
   * Textura para los cantos laterales del tablero de madera, con bisel superior
   * iluminado y sombra inferior sutil para que el espesor se lea nitido en la
   * vista isometrica.
   */
  createDeskWoodEdgeTexture = () => {
    const w = 512;
    const h = 128;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#f2cfa8");
    grad.addColorStop(0.1, "#dfae80");
    grad.addColorStop(0.85, "#c58d5e");
    grad.addColorStop(1, "#9e6a3e");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Veta horizontal a lo largo del canto
    for (let i = 0; i < 24; i++) {
      const y = 8 + (i / 24) * (h - 16);
      ctx.strokeStyle =
        i % 2 === 0 ? "rgba(130, 82, 42, 0.14)" : "rgba(255, 225, 190, 0.12)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + 2, w * 0.7, y - 2, w, y);
      ctx.stroke();
    }

    // Filo superior biselado brillante
    ctx.fillStyle = "rgba(255, 240, 220, 0.55)";
    ctx.fillRect(0, 0, w, 5);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = this.maxAnisotropy;
    texture.needsUpdate = true;
    return texture;
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
    [
      this.model.room2,
      this.model.room3,
      this.model.deskWoodTop,
      this.model.linkedin,
      this.model.github,
      this.model.x,
    ].forEach(
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
    // Luz practicamente cenital: desde 14 de altura y 8 de lado las sombras
    // salian largas y se leian como manchas sucias sobre el piso.
    this.shadowLight.position.set(4, 24, 4);
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
    this.shadowLight.shadow.bias = -0.0004;
    this.shadowLight.shadow.normalBias = 0.03;
    this.shadowLight.shadow.radius = 3;

    if (!this.floorMesh) return;

    // La malla del piso ya no pasa por applyFloorWood (que era quien forzaba
    // updateWorldMatrix). Sin esto matrixWorld seria identidad y el plano de
    // sombras quedaria desplazado/bajo el suelo.
    this.floorMesh.updateWorldMatrix(true, false);

    this.shadowMaterial = new ShadowMaterial({
      color: 0x000000,
      opacity: 0.5,
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
