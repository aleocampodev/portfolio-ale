import { CanvasTexture, RepeatWrapping } from "three";

/**
 * Generador procedural de textura de piso de madera / tablilla (parquet)
 * Crea una textura de alta resolución con vetas, uniones de tablas y biseles.
 */
export function createParquetTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");

  // Fondo base de madera cálida
  ctx.fillStyle = "#c19a6b";
  ctx.fillRect(0, 0, 1024, 1024);

  const numPlanksY = 16;
  const plankHeight = 1024 / numPlanksY;
  const numPlanksX = 4;
  const plankWidth = 1024 / numPlanksX;

  // Tonos variados de tablillas de madera (roble / teca / nogal claro)
  const tones = ["#b58d5f", "#ba9365", "#af8658", "#c29c6f", "#ab8051"];

  for (let y = 0; y < numPlanksY; y++) {
    // Desfase alternado tipo entablado / parquet corrido
    const offsetX = (y % 2) * (plankWidth / 2);
    for (let x = -1; x <= numPlanksX + 1; x++) {
      const px = x * plankWidth + offsetX;
      const py = y * plankHeight;

      // Color aleatorio determinista por tabla
      const toneIndex = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 10000) % tones.length;
      ctx.fillStyle = tones[Math.floor(toneIndex)];
      ctx.fillRect(px, py, plankWidth, plankHeight);

      // Dibujar vetas suaves de madera en cada tabla
      ctx.strokeStyle = "rgba(90, 55, 30, 0.08)";
      ctx.lineWidth = 1;
      for (let g = 0; g < 6; g++) {
        const gy = py + (g / 6) * plankHeight + Math.sin(px + g) * 2;
        ctx.beginPath();
        ctx.moveTo(px, gy);
        ctx.lineTo(px + plankWidth, gy);
        ctx.stroke();
      }

      // Bisel / unión oscura entre tablillas (ranura)
      ctx.strokeStyle = "rgba(45, 25, 10, 0.45)";
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, plankWidth, plankHeight);
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(4, 4);
  texture.needsUpdate = true;
  return texture;
}
