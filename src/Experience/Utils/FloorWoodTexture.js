import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

/**
 * Generador procedural de textura de tablilla de madera (parquet / entablado)
 * con tonalidad cálida correspondiente a Material_Piso de Blender.
 */
export function createFloorWoodTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");

  // Fondo base de madera cálida terracota / roble
  ctx.fillStyle = "#c66538";
  ctx.fillRect(0, 0, 1024, 1024);

  const rows = 16;
  const plankH = 1024 / rows;
  const cols = 4;
  const plankW = 1024 / cols;

  // Paleta de variación de tablas de madera en tonos cálidos (terracota / caoba clara / roble)
  const woodTones = [
    "#c35f33",
    "#cb6a3d",
    "#b7562c",
    "#d27244",
    "#be5b30",
    "#ba5429",
  ];

  for (let r = 0; r < rows; r++) {
    const offsetX = (r % 2) * (plankW / 2);
    for (let c = -1; c <= cols + 1; c++) {
      const px = c * plankW + offsetX;
      const py = r * plankH;

      // Color variado por tabla determinista
      const idx = Math.abs(Math.sin(c * 37.1 + r * 91.7) * 10000) % woodTones.length;
      ctx.fillStyle = woodTones[Math.floor(idx)];
      ctx.fillRect(px, py, plankW, plankH);

      // Vetas suaves de madera longitudinales
      ctx.strokeStyle = "rgba(70, 25, 10, 0.12)";
      ctx.lineWidth = 1;
      for (let g = 1; g <= 5; g++) {
        const gy = py + (g / 6) * plankH;
        ctx.beginPath();
        ctx.moveTo(px, gy);
        ctx.lineTo(px + plankW, gy);
        ctx.stroke();
      }

      // Bisel / ranura oscura entre tablillas
      ctx.strokeStyle = "rgba(45, 15, 5, 0.55)";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px, py, plankW, plankH);
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
