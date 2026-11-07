const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws');

const ROOT_DIR = path.resolve(__dirname, '..');
const BLEND_FILE = path.join(ROOT_DIR, 'static', 'assets', 'models', 'unified_room.blend');
const GLB_FILE = path.join(ROOT_DIR, 'static', 'assets', 'models', 'unified_room.glb');
const EXPORT_SCRIPT = path.join(__dirname, 'export_glb.py');

const WS_PORT = process.env.SYNC_PORT || 8081;
let wss;
try {
  wss = new WebSocketServer({ port: WS_PORT });
  console.log(`\x1b[32m✔ LiveSync WebSocket Server activo en ws://localhost:${WS_PORT}\x1b[0m`);
} catch (err) {
  console.error(`\x1b[31m✖ Error iniciando WebSocket Server en puerto ${WS_PORT}:\x1b[0m`, err);
  process.exit(1);
}

let connectedClients = 0;
wss.on('connection', (ws) => {
  connectedClients++;
  console.log(`\x1b[36m[LiveSync] Cliente web conectado. Activos: ${connectedClients}\x1b[0m`);

  ws.send(JSON.stringify({
    type: 'CONNECTED',
    message: 'LiveSync 3D Pipeline conectado',
    timestamp: Date.now()
  }));

  ws.on('close', () => {
    connectedClients = Math.max(0, connectedClients - 1);
    console.log(`\x1b[33m[LiveSync] Cliente web desconectado. Restantes: ${connectedClients}\x1b[0m`);
  });
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
      sent++;
    }
  });
  console.log(`\x1b[35m[LiveSync] Evento emitido a ${sent} cliente(s) en Three.js: ${data.type}\x1b[0m`);
}

let isExporting = false;
let pendingExport = false;
let debounceTimer = null;

function runExport() {
  if (isExporting) {
    pendingExport = true;
    return;
  }

  isExporting = true;
  const startTime = Date.now();
  console.log(`\x1b[34m[LiveSync] ⚙ Cambios detectados en unified_room.blend. Exportando a GLB...\x1b[0m`);

  const cmd = `PATH=/usr/bin:/bin /usr/bin/blender -b "${BLEND_FILE}" --python "${EXPORT_SCRIPT}"`;

  exec(cmd, (error, stdout, stderr) => {
    isExporting = false;
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (error) {
      console.error(`\x1b[31m[LiveSync] ✖ Error al exportar GLB (${duration}s):\x1b[0m`, error.message);
    } else {
      let sizeMB = '0';
      try {
        sizeMB = (fs.statSync(GLB_FILE).size / (1024 * 1024)).toFixed(2);
      } catch (e) {} console.log(`\x1b[32m[LiveSync] ✔ GLB exportado con éxito en ${duration}s (${sizeMB} MB)\x1b[0m`);

      broadcast({
        type: 'GLB_UPDATED',
        model: 'unified_room.glb',
        timestamp: Date.now(),
        duration
      });
    }

    if (pendingExport) {
      pendingExport = false;
      runExport();
    }
  });
}

// Watch the .blend file with debouncing
console.log(`\x1b[36m[LiveSync] Observando: ${BLEND_FILE}\x1b[0m`);
console.log(`\x1b[90mPresiona Ctrl+S en Blender para sincronizar automáticamente con Three.js.\x1b[0m\n`);

try {
  fs.watch(BLEND_FILE, (eventType) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runExport();
    }, 800);
  });
} catch (e) {
  console.error('[LiveSync] Error vigilando archivo:', e);
}

// Allow manual trigger by pressing 'r' + Enter in terminal
if (process.stdin.isTTY) {
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', (key) => {
    if (key.trim() === 'r') {
      console.log('\x1b[33m[LiveSync] Disparo manual de exportación...\x1b[0m');
      runExport();
    }
  });
}
