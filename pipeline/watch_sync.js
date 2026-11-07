const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');

const REPO_ROOT = path.resolve(__dirname, '..');
const BLEND_FILE = path.join(REPO_ROOT, 'static', 'assets', 'models', 'unified_room.blend');
const BLEND_DIR = path.dirname(BLEND_FILE);
const EXPORT_SCRIPT = path.join(REPO_ROOT, 'pipeline', 'export_glb.py');

const WS_PORT = process.env.SYNC_PORT || 8081;
let wss;
try {
  wss = new WebSocketServer({ port: WS_PORT });
  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[LiveSync] Puerto ${WS_PORT} ocupado. Reintentando en 8083...`);
      wss = new WebSocketServer({ port: 8083 });
    }
  });
  console.log(`\x1b[32m✔ LiveSync WebSocket Server activo en ws://localhost:${WS_PORT}\x1b[0m`);
} catch (err) {
  console.error(`\x1b[31m✖ Error iniciando WebSocket Server en puerto ${WS_PORT}:\x1b[0m`, err);
}

let clients = new Set();
if (wss) {
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`\x1b[35m[LiveSync] Cliente web conectado (${clients.size} activos)\x1b[0m`);
    ws.on('close', () => clients.delete(ws));
  });
}

function broadcast(data) {
  const payload = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

let isExporting = false;
let debounceTimer = null;

function triggerExport() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runExport();
  }, 250);
}

function runExport() {
  if (isExporting) return;
  isExporting = true;
  console.log('\x1b[33m⚡ Guardado detectado en Blender (Ctrl+S). Exportando modelos para Three.js...\x1b[0m');

  const startTime = Date.now();
  const cmd = `PATH=/usr/bin:/bin /usr/bin/blender -b "${BLEND_FILE}" --python "${EXPORT_SCRIPT}"`;

  exec(cmd, { cwd: REPO_ROOT }, (error, stdout, stderr) => {
    isExporting = false;
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (error) {
      console.error(`\x1b[31m✖ Error en exportación (${duration}s):\x1b[0m`, stderr || error.message);
      broadcast({ type: 'ERROR', message: error.message });
    } else {
      console.log(`\x1b[32m✔ Modelos sincronizados exitosamente en ${duration}s.\x1b[0m`);
      broadcast({ type: 'GLB_UPDATED', duration });
    }
  });
}

console.log(`\x1b[36m[LiveSync] Observando: ${BLEND_FILE}\x1b[0m`);
console.log(`\x1b[90mPresiona Ctrl+S en Blender para sincronizar con Three.js\x1b[0m`);

// 1. Inotify watch on directory
try {
  fs.watch(BLEND_DIR, (eventType, filename) => {
    if (filename && filename.includes('unified_room.blend')) {
      triggerExport();
    }
  });
} catch (e) {
  console.warn('[LiveSync] Error agregando fs.watch a directorio:', e);
}

// 2. Fallback polling watchFile (immune to Linux inode changes on atomic save)
try {
  fs.watchFile(BLEND_FILE, { interval: 400 }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) {
      triggerExport();
    }
  });
} catch (e) {
  console.warn('[LiveSync] Error agregando fs.watchFile:', e);
}
