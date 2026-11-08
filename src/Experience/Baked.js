import { MeshBasicMaterial, SRGBColorSpace, Color } from "three";
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

  setModels = () => {
    this.model = {};

    this.model.room1 = this.resources.items._roomModel.scene;
    this.bakedTexture1 = this.configureTexture(this.resources.items.baked1);
    this.model.material = new MeshBasicMaterial({
      map: this.bakedTexture1,
    });

    // Material exclusivo para el piso: Textura original de tablillas de madera con acabado cálido suave
    // Des-sombrado fotométrico real: recupera las tablillas reales de madera dentro de la sombra del arcade y pesas,
    // eliminando las siluetas sin aplanar ni dejar parches, y manteniendo intactas las sombras de la silla y plantas.
    const floorMaterial = new MeshBasicMaterial({
      map: this.bakedTexture1,
    });
    floorMaterial.customProgramCacheKey = () => "floorTruePhotometricDeshadow_v9";

    floorMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          #ifdef DECODE_VIDEO_TEXTURE
            sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
          #endif

          // Luminancia local del bake original
          float lum = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));

          // Muestreo a medio periodo (19.3px = 0.0047 en UV) para desacoplar la ranura de la iluminación global
          vec4 tapA = texture2D( map, vMapUv + vec2(0.0, 0.0047) );
          vec4 tapB = texture2D( map, vMapUv - vec2(0.0, 0.0047) );
          float lumA = dot(tapA.rgb, vec3(0.299, 0.587, 0.114));
          float lumB = dot(tapB.rgb, vec3(0.299, 0.587, 0.114));
          float broadIllum = (lum + lumA + lumB) * 0.33333;

          // Máscaras localizadas para objetos removidos (Arcade y Pesas):
          // Arcade: U en [0.07, 0.23], V en [0.03, 0.19]
          float mArcU = clamp((vMapUv.x - 0.05) / 0.04, 0.0, 1.0) * clamp((0.25 - vMapUv.x) / 0.04, 0.0, 1.0);
          float mArcV = clamp((vMapUv.y - 0.02) / 0.03, 0.0, 1.0) * clamp((0.21 - vMapUv.y) / 0.03, 0.0, 1.0);
          float maskArcade = mArcU * mArcV;

          // Pesas / Mancuernas: U en [0.12, 0.23], V en [0.20, 0.30]
          float mPesaU = clamp((vMapUv.x - 0.10) / 0.04, 0.0, 1.0) * clamp((0.25 - vMapUv.x) / 0.04, 0.0, 1.0);
          float mPesaV = clamp((vMapUv.y - 0.18) / 0.03, 0.0, 1.0) * clamp((0.32 - vMapUv.y) / 0.03, 0.0, 1.0);
          float maskPesas = mPesaU * mPesaV;

          float removeMask = max(maskArcade, maskPesas);

          // Normalización fotométrica (des-sombrado por división):
          // En arcade y pesas divide por la sombra envolvente para rescatar las vetas y ranuras reales de madera,
          // en lugar de rellenar con un color plano que genera parches visuales.
          float effectiveIllum = mix(0.38, max(broadIllum, 0.06), removeMask);
          float normalizedLum = lum * (0.38 / effectiveIllum);

          // Textura natural continua con ranuras y cuerpo de tablilla equilibrados
          float slatFactor = 0.36 + 0.76 * clamp((normalizedLum - 0.20) / 0.18, 0.0, 1.15);

          // Tono cálido roble suave / café claro (espacio lineal compensando GammaCorrectionShader)
          vec3 woodLinear = vec3(0.50, 0.34, 0.22);

          diffuseColor.rgb = woodLinear * slatFactor;
        #endif
        `
      );
    };

    this.model.room1.traverse((child) => {
      if (child.isMesh) {
        const matName = (child.material && child.material.name) ? child.material.name.toLowerCase() : "";
        const meshName = child.name ? child.name.toLowerCase() : "";
        if (matName.includes("piso") || meshName.includes("piso") || child.name === "Plane001_2") {
          child.material = floorMaterial;
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

    if (this.resources.items.itchio) {
      this.model.itchio = this.resources.items.itchio.scene;
      this.model.itchio.name = "itchio";
      this.setMaterial(this.model.itchio, this.model.material3);
      this.scene.add(this.model.itchio);
    }

    this.setMaterial(this.model.room2, this.model.material2);
    this.setMaterial(this.model.room3, this.model.material3);

    this.scene.add(this.model.room1);
    this.scene.add(this.model.room2);
    this.scene.add(this.model.room3);
  };
}
