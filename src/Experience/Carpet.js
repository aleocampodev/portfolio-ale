import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import Experience from "./Experience.js";

// Tapete rectangular crema con pelo (shag rug), mesa ratona redonda con libros y
// maceta, y lampara de pie negra junto a la maceta grande.
//
// Se integran en la esquina frontal del cuarto (en torno al puff), proyectando
// sombra real en el ShadowPlane de Baked.js e iluminados por la HemisphereLight
// de PlankFloor + DirectionalLight de sombras.

export default class Carpet {
  constructor() {
    this.experience = new Experience();
    this.scene = this.experience.scene;
    this.renderer = this.experience.renderer.instance;
    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.group = new Group();
    this.group.name = "CarpetAndLounge";

    this.setRug();
    this.setCoffeeTable();
    this.setFloorLamp();

    this.enableShadows();
    this.scene.add(this.group);
  }

  /**
   * Textura de pelo largo crema/beige (shag rug) + mapa de relieve.
   *
   * Incluye sombras de contacto horneadas en la propia textura para el puff y
   * la mesita, de modo que la textura del pelo se mantenga visible dentro de la
   * sombra en lugar de taparse con un parche opaco.
   */
  createRugTextures = () => {
    const size = 1024;
    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = size;
    colorCanvas.height = size;
    const cctx = colorCanvas.getContext("2d");

    const bumpCanvas = document.createElement("canvas");
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bctx = bumpCanvas.getContext("2d");

    // Base crema calida ligeramente sombreada en la raiz
    cctx.fillStyle = "#dfd0c0";
    cctx.fillRect(0, 0, size, size);

    bctx.fillStyle = "#686868";
    bctx.fillRect(0, 0, size, size);

    // Semilla determinista
    let seed = 133742;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    // Mechones gruesos y rizos de alfombra shag (visibles desde camara isometrica)
    const palette = [
      "#f6eee5",
      "#efe3d6",
      "#e4d4c3",
      "#d6c2ae",
      "#c8b099",
      "#faf3eb",
    ];

    cctx.lineCap = "round";
    bctx.lineCap = "round";

    for (let i = 0; i < 22000; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const len = 10 + rand() * 20;
      const angle = rand() * Math.PI * 2;
      const curve = (rand() - 0.5) * 12;
      const width = 2.4 + rand() * 3.8;

      const dx = Math.cos(angle) * len;
      const dy = Math.sin(angle) * len;
      const cx = x + dx * 0.5 - Math.sin(angle) * curve;
      const cy = y + dy * 0.5 + Math.cos(angle) * curve;

      const col = palette[Math.floor(rand() * palette.length)];
      const bval = Math.floor(115 + rand() * 140);

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const sx = x + ox * size;
          const sy = y + oy * size;
          if (sx < -32 || sx > size + 32 || sy < -32 || sy > size + 32)
            continue;

          // Sombra en la base del mechon (da volumen 3D al pelo)
          cctx.strokeStyle = "rgba(115, 90, 70, 0.24)";
          cctx.lineWidth = width + 2.0;
          cctx.beginPath();
          cctx.moveTo(sx + 1.8, sy + 1.8);
          cctx.quadraticCurveTo(
            cx + ox * size + 1.8,
            cy + oy * size + 1.8,
            sx + dx + 1.8,
            sy + dy + 1.8
          );
          cctx.stroke();

          // Hebra iluminada
          cctx.strokeStyle = col;
          cctx.lineWidth = width;
          cctx.beginPath();
          cctx.moveTo(sx, sy);
          cctx.quadraticCurveTo(
            cx + ox * size,
            cy + oy * size,
            sx + dx,
            sy + dy
          );
          cctx.stroke();

          // Relieve
          bctx.strokeStyle = `rgb(${bval},${bval},${bval})`;
          bctx.lineWidth = width;
          bctx.beginPath();
          bctx.moveTo(sx, sy);
          cctx.quadraticCurveTo(
            cx + ox * size,
            cy + oy * size,
            sx + dx,
            sy + dy
          );
          bctx.stroke();
        }
      }
    }

    const map = new CanvasTexture(colorCanvas);
    map.colorSpace = SRGBColorSpace;
    map.wrapS = RepeatWrapping;
    map.wrapT = RepeatWrapping;
    map.repeat.set(3.2, 2.8);
    map.anisotropy = this.maxAnisotropy;

    const bumpMap = new CanvasTexture(bumpCanvas);
    bumpMap.wrapS = RepeatWrapping;
    bumpMap.wrapT = RepeatWrapping;
    bumpMap.repeat.set(3.2, 2.8);
    bumpMap.anisotropy = this.maxAnisotropy;

    return { map, bumpMap };
  };

  /**
   * Tapete rectangular grande en la esquina inferior/frontal, cubriendo la zona
   * del puff y la mesita ratona.
   */
  setRug = () => {
    const { map, bumpMap } = this.createRugTextures();

    const width = 4.95; // eje X
    const depth = 4.35; // eje Z
    const height = 0.036;

    const rugGeo = new RoundedBoxGeometry(width, height, depth, 4, 0.016);
    const rugMat = new MeshStandardMaterial({
      map,
      bumpMap,
      bumpScale: 0.032,
      color: new Color(0xfffaf3),
      roughness: 0.92,
      metalness: 0.0,
    });

    // Posicionado en la esquina frontal-inferior de la camara isometrica:
    // X de -4.35 a +0.60, Z de -0.05 a +4.30 (justo dentro del zocalo/borde).
    const rug = new Mesh(rugGeo, rugMat);
    rug.name = "ShagRug";
    rug.position.set(-1.88, 0.011 + height / 2, 2.12);
    rug.receiveShadow = true;
    rug.castShadow = true;
    this.group.add(rug);
  };

  /**
   * Textura de madera calida para el tablero de la mesita ratona.
   */
  createWoodTexture = () => {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, "#d79f73");
    grad.addColorStop(0.5, "#cc9164");
    grad.addColorStop(1, "#bf8356");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 90; i++) {
      const y = (i / 90) * size;
      ctx.strokeStyle =
        i % 2 === 0 ? "rgba(95, 55, 28, 0.08)" : "rgba(255, 230, 205, 0.06)";
      ctx.lineWidth = 1.5 + (i % 4);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(
        size * 0.33,
        y + ((i % 5) - 2) * 4,
        size * 0.66,
        y - ((i % 3) - 1) * 4,
        size,
        y
      );
      ctx.stroke();
    }

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    return tex;
  };

  /**
   * Textura de hojas apiladas para los cantos del libro (micro-lineas de papel).
   */
  createPagesEdgeTexture = () => {
    const w = 128;
    const h = 128;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#f7f2e7";
    ctx.fillRect(0, 0, w, h);

    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle =
        y % 4 === 0 ? "rgba(160, 140, 115, 0.22)" : "rgba(255, 252, 245, 0.35)";
      ctx.fillRect(0, y, w, 1);
    }

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  };

  /**
   * Textura del lomo estilo O'Reilly para "Evals for AI Engineers" (franja
   * superior carmesi/borgona O'Reilly + titulo en el lomo blanco).
   */
  createOReillySpineTexture = () => {
    const w = 512;
    const h = 96;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#faf8f5";
    ctx.fillRect(0, 0, w, h);

    // Banda caracteristica de O'Reilly en el extremo superior del lomo
    ctx.fillStyle = "#b52025";
    ctx.fillRect(0, 0, 54, h);

    // Sombra sutil de pliegue de encuadernacion
    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    ctx.fillRect(0, 0, w, 6);
    ctx.fillRect(0, h - 6, w, 6);

    // Titulo impreso a lo largo del lomo
    ctx.fillStyle = "#1d1d1f";
    ctx.font = "bold 30px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("Evals for AI Engineers", 76, h * 0.52);

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    return tex;
  };

  /**
   * Mesa ratona circular con 3 patas negras inclinadas, 2 libros apilados y
   * una maceta blanca con planta verde.
   */
  setCoffeeTable = () => {
    const tableGroup = new Group();
    tableGroup.name = "CoffeeTableGroup";
    // Al lado del puff (que esta en X: -3.55, Z: 2.8) hacia el centro/derecha
    tableGroup.position.set(-1.35, 0.047, 1.98);

    const tableHeight = 0.72;
    const tableRadius = 0.68;
    const topThickness = 0.052;

    const woodMat = new MeshStandardMaterial({
      map: this.createWoodTexture(),
      roughness: 0.44,
      metalness: 0.02,
    });

    // Tablero circular con borde biselado ligeramente mas oscuro en el canto
    const edgeMat = new MeshStandardMaterial({
      color: 0xa0673e,
      roughness: 0.52,
      metalness: 0.02,
    });
    const topGeo = new CylinderGeometry(
      tableRadius,
      tableRadius * 0.985,
      topThickness,
      56
    );
    const topMesh = new Mesh(topGeo, [edgeMat, woodMat, edgeMat]);
    topMesh.position.y = tableHeight;
    tableGroup.add(topMesh);

    // 3 patas cilindricas negras conicas e inclinadas hacia afuera (splayed legs)
    // En la perspectiva isometrica desde (-23, 17, 23):
    //  - Pata central-frontal: angulo 2.35 rad (apunta hacia abajo en pantalla)
    //  - Pata izquierda: angulo 3.32 rad (sale bien despejada por el borde izquierdo)
    //  - Pata derecha: angulo 1.38 rad (sale bien despejada por el borde derecho)
    const legMat = new MeshStandardMaterial({
      color: 0x161618,
      roughness: 0.35,
      metalness: 0.4,
    });
    const tilt = 0.28; // ~16 grados de apertura hacia afuera
    const verticalDrop = tableHeight - topThickness * 0.3;
    const legLength = verticalDrop / Math.cos(tilt);
    const legGeo = new CylinderGeometry(0.035, 0.023, legLength, 20);

    // Casquillo/soporte de fijacion bajo el tablero para realismo
    const mountGeo = new CylinderGeometry(0.056, 0.045, 0.025, 16);

    const legAngles = [2.356, 3.35, 1.36];
    legAngles.forEach((angle) => {
      const topAttachRadius = tableRadius * 0.75;
      const radialShift = (legLength * 0.5) * Math.sin(tilt);
      const midRadius = topAttachRadius + radialShift;

      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);

      // Soporte superior bajo la madera
      const mount = new Mesh(mountGeo, legMat);
      mount.position.set(
        dirX * topAttachRadius,
        tableHeight - topThickness * 0.5 - 0.008,
        dirZ * topAttachRadius
      );
      tableGroup.add(mount);

      // Pata inclinada hacia afuera en la direccion (dirX, 0, dirZ)
      const leg = new Mesh(legGeo, legMat);
      leg.position.set(dirX * midRadius, verticalDrop * 0.5, dirZ * midRadius);
      leg.rotation.z = dirX * tilt;
      leg.rotation.x = -dirZ * tilt;
      tableGroup.add(leg);
    });

    // --- Libros realistas apilados sobre la mesa ---
    const surfaceY = tableHeight + topThickness / 2;
    const booksGroup = new Group();
    booksGroup.position.set(-0.22, surfaceY, -0.02);
    // Orientado con el lomo hacia arriba-izquierda y el pie de la portada hacia
    // abajo-derecha, exactamente como en la imagen de referencia.
    booksGroup.rotation.y = -0.68;

    const loader = new TextureLoader();
    const evalsCoverTex = loader.load(
      "/assets/textures/evals_for_ai_engineers_cover.webp"
    );
    evalsCoverTex.colorSpace = SRGBColorSpace;
    evalsCoverTex.anisotropy = this.maxAnisotropy;

    const pagesSideTex = this.createPagesEdgeTexture();
    const oreillySpineTex = this.createOReillySpineTexture();

    // Constructor de libro fisico realista:
    //  - Tapa superior, tapa inferior y lomo independiente (con grosor de carton)
    //  - Bloque de hojas interiores blancas con micro-estrias de papel en los 3 cantos
    //  - Portada impresa con MeshBasicMaterial ligeramente atenuado (0xf5efe8) para
    //    conservar el 100% de la nitidez tipografica sin quemarse por las luces
    const createRealisticBook = ({
      w,
      h,
      d,
      boardColor,
      spineColor,
      coverTexture,
      spineTexture,
      yOffset,
      rotY,
    }) => {
      const bGroup = new Group();
      bGroup.position.y = yOffset;
      bGroup.rotation.y = rotY;

      const boardThickness = 0.005;
      const spineThickness = 0.006;
      const overhang = 0.007; // ceja de las tapas sobre el bloque de hojas

      const boardMat = new MeshStandardMaterial({
        color: boardColor,
        roughness: 0.45,
        metalness: 0.02,
      });

      const spineMat = spineTexture
        ? new MeshBasicMaterial({
            map: spineTexture,
            color: 0xf4eee6,
          })
        : new MeshStandardMaterial({
            color: spineColor ?? boardColor,
            roughness: 0.48,
            metalness: 0.02,
          });

      // 1. Tapa inferior (contra-cubierta)
      const bottomBoard = new Mesh(
        new RoundedBoxGeometry(w, boardThickness, d, 2, 0.0018),
        boardMat
      );
      bottomBoard.position.y = boardThickness / 2;
      bGroup.add(bottomBoard);

      // 2. Bloque de hojas de papel (retranqueado en frente, arriba y abajo; pegado al lomo en -X)
      const pagesW = w - overhang - spineThickness;
      const pagesH = h - boardThickness * 2;
      const pagesD = d - overhang * 2;

      const pageBlockMat = new MeshStandardMaterial({
        map: pagesSideTex,
        color: 0xf8f3e8,
        roughness: 0.85,
        metalness: 0.0,
      });

      const pagesMesh = new Mesh(
        new BoxGeometry(pagesW, pagesH, pagesD),
        pageBlockMat
      );
      pagesMesh.position.set(
        -w / 2 + spineThickness + pagesW / 2,
        boardThickness + pagesH / 2,
        0
      );
      bGroup.add(pagesMesh);

      // 3. Lomo (spine) en el costado izquierdo (-X), que mira hacia la camara
      const spineGeo = new RoundedBoxGeometry(
        spineThickness * 1.35,
        h,
        d,
        2,
        0.0025
      );
      const spineMesh = new Mesh(spineGeo, spineMat);
      spineMesh.position.set(-w / 2 + spineThickness * 0.55, h / 2, 0);
      bGroup.add(spineMesh);

      // 4. Tapa superior (portada)
      const topBoard = new Mesh(
        new RoundedBoxGeometry(w, boardThickness, d, 2, 0.0018),
        boardMat
      );
      topBoard.position.y = h - boardThickness / 2;
      bGroup.add(topBoard);

      // 5. Lamina impresa de la portada sobre la cara superior de la tapa
      if (coverTexture) {
        const coverMat = new MeshBasicMaterial({
          map: coverTexture,
          color: 0xf5efe8, // papel mate calido sin quemado especular
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
        const coverPlane = new Mesh(
          new PlaneGeometry(w * 0.985, d * 0.985),
          coverMat
        );
        coverPlane.rotation.x = -Math.PI / 2;
        coverPlane.position.y = h + 0.0004;
        bGroup.add(coverPlane);
      }

      return bGroup;
    };

    // Libro inferior (azul editorial oscuro con hojas crema)
    const bottomH = 0.056;
    booksGroup.add(
      createRealisticBook({
        w: 0.36,
        h: bottomH,
        d: 0.46,
        boardColor: 0x1a2847,
        spineColor: 0x142038,
        coverTexture: null,
        spineTexture: null,
        yOffset: 0,
        rotY: 0.08,
      })
    );

    // Libro superior: "Evals for AI Engineers" (O'Reilly) con proporcion real 291:382 (0.34m x 0.446m)
    booksGroup.add(
      createRealisticBook({
        w: 0.34,
        h: 0.052,
        d: 0.446,
        boardColor: 0xf4efe8,
        spineColor: 0xf4efe8,
        coverTexture: evalsCoverTex,
        spineTexture: oreillySpineTex,
        yOffset: bottomH,
        rotY: -0.1,
      })
    );
    tableGroup.add(booksGroup);

    // --- Maceta blanca con plantita frondosa ---
    const plantGroup = new Group();
    plantGroup.position.set(0.18, surfaceY, 0.11);

    const potMat = new MeshStandardMaterial({
      color: 0xf4eee8,
      roughness: 0.35,
      metalness: 0.05,
    });

    const saucer = new Mesh(
      new CylinderGeometry(0.135, 0.12, 0.022, 28),
      potMat
    );
    saucer.position.y = 0.011;
    plantGroup.add(saucer);

    const pot = new Mesh(
      new CylinderGeometry(0.14, 0.108, 0.205, 28),
      potMat
    );
    pot.position.y = 0.022 + 0.1025;
    plantGroup.add(pot);

    const soil = new Mesh(
      new CylinderGeometry(0.13, 0.13, 0.02, 24),
      new MeshStandardMaterial({ color: 0x3b281e, roughness: 0.95 })
    );
    soil.position.y = 0.21;
    plantGroup.add(soil);

    const leafMatDark = new MeshStandardMaterial({
      color: 0x2c4f26,
      roughness: 0.55,
      side: DoubleSide,
    });
    const leafMatMid = new MeshStandardMaterial({
      color: 0x3e6933,
      roughness: 0.5,
      side: DoubleSide,
    });
    const leafMatLight = new MeshStandardMaterial({
      color: 0x548244,
      roughness: 0.48,
      side: DoubleSide,
    });

    const leafGeo = new SphereGeometry(1, 10, 8);
    leafGeo.scale(0.052, 0.015, 0.145);
    leafGeo.translate(0, 0, 0.105);

    const rings = [
      { count: 10, pitch: 0.26, y: 0.22, scale: 1.08, mat: leafMatDark },
      { count: 9, pitch: 0.6, y: 0.24, scale: 0.96, mat: leafMatMid },
      { count: 7, pitch: 1.0, y: 0.26, scale: 0.8, mat: leafMatLight },
    ];

    rings.forEach((ring, rIdx) => {
      for (let i = 0; i < ring.count; i++) {
        const yaw = (i / ring.count) * Math.PI * 2 + rIdx * 0.42;
        const leaf = new Mesh(leafGeo, ring.mat);
        leaf.position.y = ring.y;
        leaf.rotation.order = "YXZ";
        leaf.rotation.y = yaw;
        leaf.rotation.x = -ring.pitch;
        leaf.scale.setScalar(ring.scale);
        plantGroup.add(leaf);
      }
    });

    tableGroup.add(plantGroup);
    this.group.add(tableGroup);
  };

  /**
   * Lampara de pie negra minimalista (base circular, poste esbelto, pantalla
   * semiesferica negra con interior calido suave), ubicada en la esquina
   * derecha del cuarto al lado de la planta Monstera.
   */
  setFloorLamp = () => {
    const lampGroup = new Group();
    lampGroup.name = "FloorLampGroup";
    // Posicionada a la derecha de la Monstera, cerca de la esquina frontal-derecha
    lampGroup.position.set(3.52, 0.011, 2.35);

    const blackMetal = new MeshStandardMaterial({
      color: 0x1e1e22,
      roughness: 0.36,
      metalness: 0.35,
    });

    // 1. Base circular pesada con escalon suave
    const baseBottom = new Mesh(
      new CylinderGeometry(0.32, 0.33, 0.034, 36),
      blackMetal
    );
    baseBottom.position.y = 0.017;
    lampGroup.add(baseBottom);

    const baseTop = new Mesh(
      new CylinderGeometry(0.065, 0.28, 0.025, 32),
      blackMetal
    );
    baseTop.position.y = 0.044;
    lampGroup.add(baseTop);

    // 2. Poste vertical esbelto
    const poleHeight = 2.48;
    const pole = new Mesh(
      new CylinderGeometry(0.024, 0.028, poleHeight, 20),
      blackMetal
    );
    pole.position.y = 0.045 + poleHeight / 2;
    lampGroup.add(pole);

    // 3. Pantalla tipo domo (dome shade) negra mate/satinada
    // Construida con pared doble para que la cupula exterior jamas sea tapada
    // por el difusor interior y mantenga su silueta negra nitida.
    const domeY = 0.045 + poleHeight;
    const domeRadius = 0.39;
    const domeHeight = 0.31;
    const pts = [];
    const steps = 20;
    // Perfil exterior de la cupula (de arriba hacia el borde inferior)
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * (Math.PI / 2);
      const r = Math.sin(t) * domeRadius;
      const y = Math.cos(t) * domeHeight;
      pts.push(new Vector2(r, y));
    }
    // Cerrar hacia adentro con un labio oscuro sin cruzar el poste central
    pts.push(new Vector2(domeRadius * 0.88, -0.008));
    pts.push(new Vector2(0.032, 0.24));

    const domeGeo = new LatheGeometry(pts, 40);
    const dome = new Mesh(domeGeo, blackMetal);
    dome.position.y = domeY - domeHeight * 0.45;
    dome.renderOrder = 5;
    lampGroup.add(dome);

    // Remate superior del domo
    const finial = new Mesh(
      new CylinderGeometry(0.036, 0.05, 0.048, 20),
      blackMetal
    );
    finial.position.y = domeY + domeHeight * 0.55;
    finial.renderOrder = 5;
    lampGroup.add(finial);

    // 4. Haz de luz calida dorada sobre la pared + cono volumetrico bajo el domo
    // Como la pared rosada es muy clara (~0.92), AdditiveBlending puro tiende a
    // saturar a blanco. Combinamos:
    //  - una capa NormalBlending en tono ambar/naranja calido (#ff9a42) que tiñe
    //    la pared con el color calido de la foto,
    //  - una capa AdditiveBlending en el nucleo bajo la pantalla para el brillo,
    //  - y un cono 3D sutil centrado en el poste para que el haz se vea simetrico
    //    a ambos lados del tubo negro desde la camara.
    const wallLightTex = this.createLampWallGlowTexture();

    const coneHeight = 2.55;
    const coneWidth = 2.65;
    // La camara mira desde (-23, 17, 23): cuando el rayo va hacia la pared en X = 4.00
    // (delta X = +0.468 respecto al centro de la lampara en X = 3.52), el rayo avanza
    // en Z delta Z = -0.468. Por tanto, en Z_local = -0.45 el haz sobre la pared queda
    // exactamente detras del poste y de la cupula desde la vista isometrica!
    const wallZOffset = -0.45;
    const wallApexY = domeY - domeHeight * 0.14;

    // Capa 1: tinte ambar/dorado sobre la pared (NormalBlending para no quemar a blanco)
    const wallWarmTint = new Mesh(
      new PlaneGeometry(coneWidth, coneHeight),
      new MeshBasicMaterial({
        map: wallLightTex,
        color: new Color(0xff9638),
        transparent: true,
        opacity: 0.76,
        blending: NormalBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      })
    );
    wallWarmTint.name = "LampWallWarmTint";
    wallWarmTint.rotation.y = -Math.PI / 2;
    wallWarmTint.position.set(
      0.468,
      wallApexY - coneHeight * 0.46,
      wallZOffset
    );
    wallWarmTint.renderOrder = 2;
    lampGroup.add(wallWarmTint);

    // Capa 2: brillo aditivo concentrado en la parte alta del cono (bajo la cupula)
    const wallBrightCore = new Mesh(
      new PlaneGeometry(coneWidth * 0.85, coneHeight * 0.72),
      new MeshBasicMaterial({
        map: wallLightTex,
        color: new Color(1.0, 0.58, 0.2),
        transparent: true,
        opacity: 0.62,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      })
    );
    wallBrightCore.name = "LampWallLightCone";
    wallBrightCore.rotation.y = -Math.PI / 2;
    wallBrightCore.position.set(
      0.466,
      wallApexY - coneHeight * 0.33,
      wallZOffset
    );
    wallBrightCore.renderOrder = 3;
    lampGroup.add(wallBrightCore);

    // Capa 3: cono volumetrico suave bajo la pantalla (centrado en el poste)
    // Arranca exactamente en el borde inferior de la cupula (domeY - domeHeight * 0.46)
    // con el mismo radio de la boca (domeRadius * 0.96) para que el haz nazca de las
    // dos puntas de la pantalla negra sin dejar escalon ni pintar encima del domo.
    const beamConeTex = this.createBeamConeTexture();
    const beamConeHeight = 1.45;
    const beamConeGeo = new CylinderGeometry(
      domeRadius * 0.96,
      domeRadius * 2.55,
      beamConeHeight,
      36,
      1,
      true
    );
    const beamCone = new Mesh(
      beamConeGeo,
      new MeshBasicMaterial({
        map: beamConeTex,
        color: new Color(0xffa444),
        transparent: true,
        opacity: 0.48,
        blending: NormalBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      })
    );
    beamCone.name = "LampVolumetricCone";
    beamCone.position.set(
      0,
      domeY - domeHeight * 0.46 - beamConeHeight * 0.5,
      0
    );
    beamCone.renderOrder = 2;
    lampGroup.add(beamCone);

    // Resplandor brillante en la pared justo debajo del borde inferior del domo
    const rimGlowTex = this.createRadialGlowTexture([
      [0, 1.0],
      [0.35, 0.68],
      [0.7, 0.24],
      [1, 0],
    ]);
    const rimGlow = new Mesh(
      new PlaneGeometry(domeRadius * 2.8, domeRadius * 1.1),
      new MeshBasicMaterial({
        map: rimGlowTex,
        color: new Color(1.0, 0.72, 0.28),
        transparent: true,
        opacity: 0.92,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      })
    );
    rimGlow.name = "LampRimGlow";
    rimGlow.rotation.y = -Math.PI / 2;
    rimGlow.position.set(0.464, wallApexY - 0.14, wallZOffset);
    rimGlow.renderOrder = 3;
    lampGroup.add(rimGlow);

    // Halo calido circular sobre el piso de madera alrededor de la base
    const floorPoolTex = this.createRadialGlowTexture([
      [0, 0.78],
      [0.35, 0.45],
      [0.7, 0.14],
      [1, 0],
    ]);
    const floorPool = new Mesh(
      new PlaneGeometry(2.3, 2.3),
      new MeshBasicMaterial({
        map: floorPoolTex,
        color: new Color(1.0, 0.55, 0.18),
        transparent: true,
        opacity: 0.58,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      })
    );
    floorPool.name = "LampFloorGlow";
    floorPool.rotation.x = -Math.PI / 2;
    floorPool.position.set(-0.08, 0.01, 0);
    floorPool.renderOrder = 2;
    lampGroup.add(floorPool);

    // 5. Luz puntual calida que ilumina los tablones 3D del piso, el poste y la base
    const warmLight = new PointLight(0xff9c40, 2.6, 5.5, 1.4);
    warmLight.position.set(-0.15, domeY - 0.18, 0);
    warmLight.castShadow = false;
    lampGroup.add(warmLight);

    this.group.add(lampGroup);
  };

  /**
   * Textura vertical con degradado suave para el cono volumetrico bajo la pantalla.
   */
  createBeamConeTexture = () => {
    const w = 64;
    const h = 128;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(255, 220, 165, 0.95)");
    grad.addColorStop(0.22, "rgba(255, 185, 105, 0.58)");
    grad.addColorStop(0.55, "rgba(255, 160, 75, 0.22)");
    grad.addColorStop(1, "rgba(255, 145, 60, 0)");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  };

  /**
   * Textura de abanico/cono de luz proyectado hacia abajo sobre la pared desde
   * el borde inferior de la pantalla negra de la lampara.
   */
  createLampWallGlowTexture = () => {
    const w = 256;
    const h = 256;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    // El apice del cono esta cerca de y = 0.06 (borde inferior de la pantalla)
    const apexY = 0.05;
    for (let py = 0; py < h; py++) {
      const v = py / (h - 1); // 0 arriba, 1 abajo
      for (let px = 0; px < w; px++) {
        const u = (px / (w - 1)) * 2 - 1; // -1..1

        let alpha = 0;
        if (v >= apexY) {
          const dy = (v - apexY) / (1 - apexY); // 0 en la boca de la pantalla, 1 abajo
          // El haz se abre como un cono desde el ancho del domo (0.18) hasta 0.95
          const halfSpread = 0.17 + dy * 0.78;
          const normX = Math.abs(u) / halfSpread;

          if (normX < 1.0) {
            // Caida lateral suave (coseno/gaussiana)
            const angular = Math.pow(1.0 - normX * normX, 1.85);
            // Caida vertical suave desde el foco brillante bajo la cupula
            const vertical = Math.pow(1.0 - dy, 1.45);
            alpha = angular * vertical;
          }
        }

        const idx = (py * w + px) * 4;
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = Math.min(255, Math.round(alpha * 255));
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  };

  createRadialGlowTexture = (stops) => {
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
    stops.forEach(([offset, alpha]) => {
      grad.addColorStop(offset, `rgba(255,255,255,${alpha})`);
    });

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  };

  /**
   * Activa proyeccion y recepcion de sombras en todas las mallas y fuerza una
   * actualizacion del mapa de sombras de Baked.js.
   */
  enableShadows = () => {
    this.group.traverse((child) => {
      // La lampara de pie esta encendida e ilumina el piso hacia abajo, por lo
      // que su cupula superior no debe proyectar un disco oscuro desplazado en
      // el suelo (su base ya tiene su sombra de contacto e iluminacion calida).
      let inFloorLamp = false;
      let p = child.parent;
      while (p) {
        if (p.name === "FloorLampGroup") {
          inFloorLamp = true;
          break;
        }
        p = p.parent;
      }

      if (
        child.isMesh &&
        !inFloorLamp &&
        !child.name.includes("Glow") &&
        !child.name.includes("Cone") &&
        !child.name.includes("Tint") &&
        !child.material.transparent
      ) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material.shadowSide = DoubleSide;
        }
      }
    });

    if (this.renderer && this.renderer.shadowMap) {
      this.renderer.shadowMap.needsUpdate = true;
    }
  };

  update = () => {};
}
