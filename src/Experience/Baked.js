import { Color, MeshBasicMaterial, SRGBColorSpace } from "three";
import Experience from "./Experience.js";
import { createFloorWoodTexture } from "./Utils/FloorWoodTexture.js";

export default class Baked {
  constructor() {
    this.experience = new Experience();
    this.resources = this.experience.resources;
    this.scene = this.experience.scene;
    this.renderer = this.experience.renderer.instance;
    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.floorWoodTexture = createFloorWoodTexture();
    this.setModels();
  }

  setMaterial = (object, defaultBakedMaterial) => {
    object.traverse((child) => {
      if (child.isMesh) {
        const processMat = (mat) => {
          if (!mat) return defaultBakedMaterial;
          const name = mat.name || "";

          // 1. Textura de tablilla para el suelo (Material_Piso)
          if (name.includes("Material_Piso")) {
            return new MeshBasicMaterial({
              map: this.floorWoodTexture,
            });
          }

          // 2. Color exacto de pared de Blender (Material_Pared) -> Rosa / Cyber-Rose de Blender (NO lila)
          if (name.includes("Material_Pared")) {
            const col = mat.color ? mat.color : new Color(0.800015, 0.148942, 0.245642);
            return new MeshBasicMaterial({
              color: col,
            });
          }

          // 3. Zócalo (Material_Socalo / Material_socalo) -> Blanco puro/hueso según configuración de Blender
          if (name.includes("Material_Socalo") || name.includes("Material_socalo")) {
            return new MeshBasicMaterial({
              color: new Color(0.98, 0.98, 0.98),
            });
          }

          // 4. Otros materiales personalizados con color distinto al gris por defecto
          if (mat.color) {
            const c = mat.color;
            const isGray = Math.abs(c.r - 0.8) < 0.05 && Math.abs(c.g - 0.8) < 0.05 && Math.abs(c.b - 0.8) < 0.05;
            if (!isGray && !name.includes("Baked1_Arch") && !name.includes("Baked2") && !name.includes("Baked3")) {
              return new MeshBasicMaterial({ color: c });
            }
          }

          return defaultBakedMaterial;
        };

        if (Array.isArray(child.material)) {
          child.material = child.material.map(processMat);
        } else {
          child.material = processMat(child.material);
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

    this.setMaterial(this.model.room1, this.model.material);
    this.setMaterial(this.model.room2, this.model.material2);
    this.setMaterial(this.model.room3, this.model.material3);

    this.scene.add(this.model.room1);
    this.scene.add(this.model.room2);
    this.scene.add(this.model.room3);
  };
}
