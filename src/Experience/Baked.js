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
    // Preserva las sombras naturales de objetos existentes (silla, mesa, plantas, cama) y elimina
    // de forma localizada y limpia las sombras de objetos removidos (arcade y pesas)
    const floorMaterial = new MeshBasicMaterial({
      map: this.bakedTexture1,
    });
    floorMaterial.customProgramCacheKey = () => "floorOriginalSlatsTargetedShadows_v8";

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

          // Máscaras localizadas para objetos removidos (Arcade y Pesas):
          // Arcade: U en [0.08, 0.22], V en [0.04, 0.18]
          float mArcU = clamp((vMapUv.x - 0.05) / 0.03, 0.0, 1.0) * clamp((0.24 - vMapUv.x) / 0.03, 0.0, 1.0);
          float mArcV = clamp((vMapUv.y - 0.02) / 0.03, 0.0, 1.0) * clamp((0.20 - vMapUv.y) / 0.03, 0.0, 1.0);
          float maskArcade = mArcU * mArcV;

          // Pesas / Mancuernas: U en [0.13, 0.22], V en [0.21, 0.29]
          float mPesaU = clamp((vMapUv.x - 0.11) / 0.03, 0.0, 1.0) * clamp((0.24 - vMapUv.x) / 0.03, 0.0, 1.0);
          float mPesaV = clamp((vMapUv.y - 0.19) / 0.03, 0.0, 1.0) * clamp((0.31 - vMapUv.y) / 0.03, 0.0, 1.0);
          float maskPesas = mPesaU * mPesaV;

          float removeMask = max(maskArcade, maskPesas);

          // En las zonas de arcade y pesas elevamos la sombra para erradicarlas por completo
          // En el resto del cuarto (silla, matas, cama, escritorio) las sombras se conservan naturales
          float liftedLum = lum + removeMask * max(0.42 - lum, 0.0);

          // Textura natural con contraste claro de tablillas y sombras reales del entorno
          float slatFactor = 0.36 + 0.76 * clamp((liftedLum - 0.20) / 0.18, 0.0, 1.15);

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
