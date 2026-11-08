import { CanvasTexture, RepeatWrapping } from "three";

/**
 * Generador procedural de textura de piso de madera / tablilla (parquet)
 * Crea una textura de alta resolución con vetas, uniones de tablas y biseles.
 * Permite configurar el color base para preservar la textura sin artefactos.
 */
export function createParquetTexture(baseHex = "#E79C6E") {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");

  // Fondo base con el color deseado
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 1024, 1024);

  const numPlanksY = 16;
  const plankHeight = 1024 / numPlanksY;
  const numPlanksX = 4;
  const plankWidth = 1024 / numPlanksX;

  // Parse hex a RGB para generar variaciones armónicas de tono
  const cleanHex = baseHex.replace("#", "").substring(0, 6);
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Tonos variados de tablillas alrededor del color base (#E79C6E)
  const variations = [-14, -7, 0, 8, 16];
  const tones = variations.map((v) => {
    const vr = Math.min(255, Math.max(0, r + v));
    const vg = Math.min(255, Math.max(0, g + Math.round(v * 0.75)));
    const vb = Math.min(255, Math.max(0, b + Math.round(v * 0.55)));
    return `rgb(${vr}, ${vg}, ${vb})`;
  });

  for (let y = 0; y < numPlanksY; y++) {
    // Desfase alternado tipo entablado / parquet corrido
    const offsetX = (y % 2) * (plankWidth / 2);
    for (let x = -1; x <= numPlanksX + 1; x++) {
      const px = x * plankWidth + offsetX;
      const py = y * plankHeight;

      // Color aleatorio determinista por tabla
      const toneIndex =
        Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 10000) % tones.length;
      ctx.fillStyle = tones[Math.floor(toneIndex)];
      ctx.fillRect(px, py, plankWidth, plankHeight);

      // Dibujar vetas suaves de madera en cada tabla
      ctx.strokeStyle = "rgba(75, 40, 20, 0.08)";
      ctx.lineWidth = 1;
      for (let gIdx = 0; gIdx < 6; gIdx++) {
        const gy = py + (gIdx / 6) * plankHeight + Math.sin(px + gIdx) * 2;
        ctx.beginPath();
        ctx.moveTo(px, gy);
        ctx.lineTo(px + plankWidth, gy);
        ctx.stroke();
      }

      // Bisel / unión oscura entre tablillas (ranura sin manchas de objetos)
      ctx.strokeStyle = "rgba(50, 25, 12, 0.35)";
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
