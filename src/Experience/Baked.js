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

    // Material exclusivo para el piso en Roble Escandinavo (#D4B293)
    // Preserva las tablillas de madera reales (ranuras y vetas) y desacopla sombras de arcade/pesas
    const floorMaterial = new MeshBasicMaterial({
      map: this.bakedTexture1,
    });
    floorMaterial.customProgramCacheKey = () => "floorScandinavianOak_v7";

    floorMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          #ifdef DECODE_VIDEO_TEXTURE
            sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
          #endif

          // Luminancia local del fragmento
          float lum = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));

          // Des-sombrado adaptativo: levanta sombras amplias residuales (arcade y mancuernas)
          float shadowMask = clamp((0.45 - lum) / 0.38, 0.0, 1.0);
          float liftedLum = lum + 0.38 * shadowMask;

          // Relieve de tablillas y vetas de madera:
          // Ranuras divisorias oscuras (~0.25) y cuerpo/veta de la tabla (1.0 - 1.25)
          float slatFactor = clamp((liftedLum - 0.18) / 0.36, 0.25, 1.25);

          // Tono Roble Escandinavo (#D4B293) en espacio lineal calibrado para GammaCorrectionShader
          vec3 oakLinear = vec3(0.6184, 0.4210, 0.2763);

          diffuseColor.rgb = oakLinear * slatFactor;
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
