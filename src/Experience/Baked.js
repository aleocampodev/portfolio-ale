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

    // Material exclusivo para el piso en café suave (#E5C9B6) sin sombras de arcade ni pesas
    const floorColor = new Color("#E5C9B6");
    const floorMaterial = new MeshBasicMaterial({
      map: this.bakedTexture1,
      color: floorColor,
    });

    floorMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "diffuseColor *= sampledDiffuseColor;",
        `
        // Eliminar sombras oscuras residuales (arcade y pesas) preservando la textura del piso
        float lum = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float shadowFactor = smoothstep(0.05, 0.60, lum);
        vec3 lifted = sampledDiffuseColor.rgb * (0.65 / max(lum, 0.12));
        sampledDiffuseColor.rgb = mix(lifted, sampledDiffuseColor.rgb, shadowFactor);
        diffuseColor *= sampledDiffuseColor;
        `
      );
    };

    this.model.room1.traverse((child) => {
      if (child.isMesh) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m, idx) => {
            const name = (m && m.name) ? m.name.toLowerCase() : "";
            if (name.includes("piso") || idx === 2) {
              return floorMaterial;
            }
            return this.model.material;
          });
        } else {
          const name = (child.material && child.material.name) ? child.material.name.toLowerCase() : "";
          if (name.includes("piso")) {
            child.material = floorMaterial;
          } else {
            child.material = this.model.material;
          }
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
