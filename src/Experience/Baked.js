import { Mesh, MeshBasicMaterial, SRGBColorSpace } from "three";
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

  setMaterial = (object, defaultBakedMaterial) => {
    object.traverse((child) => {
      if (child.isMesh) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((mat) => {
            if (mat && mat.color) {
              const c = mat.color;
              const isDefaultGray = Math.abs(c.r - 0.8) < 0.05 && Math.abs(c.g - 0.8) < 0.05 && Math.abs(c.b - 0.8) < 0.05;
              if (!isDefaultGray) {
                return new MeshBasicMaterial({ color: c, map: mat.map || null });
              }
            }
            return defaultBakedMaterial;
          });
        } else {
          if (child.material && child.material.color) {
            const c = child.material.color;
            const isDefaultGray = Math.abs(c.r - 0.8) < 0.05 && Math.abs(c.g - 0.8) < 0.05 && Math.abs(c.b - 0.8) < 0.05;
            if (!isDefaultGray) {
              child.material = new MeshBasicMaterial({ color: c, map: child.material.map || null });
              return;
            }
          }
          child.material = defaultBakedMaterial;
        }
      }
    });
  };

  configureTexture = (texture) => {
    texture.anisotropy = this.maxAnisotropy;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  };

  setModels = () => {
    this.model = {};

    if (this.resources.items.unifiedRoom && this.useUnifiedRoom) {
      this.model.unified = this.resources.items.unifiedRoom.scene;

      this.bakedTexture1 = this.configureTexture(this.resources.items.baked1);
      this.bakedTexture2 = this.configureTexture(this.resources.items.baked2);
      this.bakedTexture3 = this.configureTexture(this.resources.items.baked3);

      this.matBaked1 = new MeshBasicMaterial({ map: this.bakedTexture1 });
      this.matBaked2 = new MeshBasicMaterial({ map: this.bakedTexture2 });
      this.matBaked3 = new MeshBasicMaterial({ map: this.bakedTexture3 });

      this.model.unified.traverse((child) => {
        if (child.isMesh) {
          const name = child.name;
          if (name.includes('BAKED_1') || name.includes('Claqueta') || name.includes('Whiteboard')) {
            child.material = this.matBaked1;
          } else if (name.includes('BAKED_2') || name.includes('TopChair') || name.includes('LeftMonitor') || name.includes('RightMonitor')) {
            child.material = this.matBaked2;
          } else if (name.includes('BAKED_3') || name.includes('Linkedin') || name.includes('Github') || name.includes('Itchio')) {
            child.material = this.matBaked3;
          } else if (!child.material || child.material.type === 'MeshStandardMaterial') {
            // Fallback unlit
            child.material = new MeshBasicMaterial({ color: child.material.color, map: child.material.map });
          }
        }
      });

      this.scene.add(this.model.unified);
      return;
    }

    this.model.room1 = this.resources.items._roomModel.scene;

    this.bakedTexture1 = this.configureTexture(this.resources.items.baked1);
    this.model.material = new MeshBasicMaterial({
      map: this.bakedTexture1,
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

    this.model.linkedin = this.resources.items.linkedin.scene;
    this.model.linkedin.name = "linkedin";
    this.model.github = this.resources.items.github.scene;
    this.model.github.name = "github";
    this.model.itchio = this.resources.items.itchio.scene;
    this.model.itchio.name = "itchio";

    this.setMaterial(this.model.room1, this.model.material);
    if (this.resources.items.floorModel) {
      this.model.floor = this.resources.items.floorModel.scene;
      this.model.floor.name = "floor";
      this.setMaterial(this.model.floor, this.model.material);
      this.scene.add(this.model.floor);
    }
    this.setMaterial(this.model.room2, this.model.material2);
    this.setMaterial(this.model.room3, this.model.material3);
    this.setMaterial(this.model.linkedin, this.model.material3);
    this.setMaterial(this.model.github, this.model.material3);
    this.setMaterial(this.model.itchio, this.model.material3);

    this.scene.add(this.model.room1);
    this.scene.add(this.model.room2);
    this.scene.add(this.model.room3);

    this.scene.add(this.model.linkedin);
    this.scene.add(this.model.github);
    this.scene.add(this.model.itchio);
  };
}
