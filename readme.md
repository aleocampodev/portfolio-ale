# 🪐 3D Developer Portfolio — Three.js & Blender

Experiencia interactiva 3D en la web construida con **Three.js** y **Webpack**, ambientada en una habitación isométrica estilizada que incluye modelos 3D detallados, texturas horneadas (*baked lighting*), shader procedural de alfombra (*shell texturing*), pizarra interactiva, máquina arcade y mini-juegos (como el Cubo de Rubik).

---

## 🛠️ Stack Tecnológico

- **Motor 3D Web**: [Three.js](https://threejs.org/) (`^0.161.0`)
- **Modelado & Iluminación**: [Blender](https://www.blender.org/) (`5.2+ LTS`)
- **Pipeline de Texturas**: KTX2 / Basis Universal & mapas PNG 4K horneados
- **Animaciones & UI**: GSAP, Tweakpane, HTML5 Canvas
- **Bundler & Tooling**: Webpack 5, Babel, Concurrently, WebSockets
- **Pipeline 3D LiveSync**: Sincronización reactiva unidireccional (Blender ➔ Three.js)

---

## 📁 Estructura del Proyecto

```text
joan-portfolio/
├── backup/                            # Respaldo de seguridad (.blend, .glb y scripts estables)
│   ├── unified_room_backup.blend
│   └── unified_room_backup.glb
│
├── pipeline/                          # Herramientas del pipeline 3D en tiempo real
│   ├── export_glb.py                  # Script headless de exportación a GLB
│   ├── watch_sync.js                  # Watcher Node.js + WebSocket Server (:8081)
│   └── README.md                      # Documentación técnica del pipeline
│
├── static/assets/
│   ├── models/                        # Modelos 3D (.blend de trabajo y .glb unificado)
│   │   ├── unified_room.blend         # Escena principal editable en Blender
│   │   └── unified_room.glb           # Modelo compilado para Three.js
│   └── textures/                      # Texturas horneadas (baked1..3) y mapas de dibujo
│
├── src/
│   ├── Experience/                    # Lógica central Three.js (Cámara, Render, Luces, Mundo)
│   │   ├── Utils/
│   │   │   └── LiveSync.js            # Cliente WebSocket para Hot-Swap en desarrollo
│   │   ├── Baked.js                   # Asignación de mapas de texturas horneadas
│   │   ├── Carpet.js                  # Lógica del tapete con Shell Texturing
│   │   ├── Whiteboard.js              # Pizarra interactiva con dibujo sobre Canvas
│   │   └── World.js                   # Ensamblado del mundo 3D
│   └── index.js                       # Punto de entrada de la aplicación
│
├── bundler/                           # Configuraciones de Webpack (dev & prod)
└── package.json
```

---

## ⚡ Inicio Rápido

### 1. Instalación de dependencias
```bash
npm install
```

### 2. Modo Desarrollo con LiveSync (Recomendado)
Para trabajar en el código web y en Blender simultáneamente:
```bash
npm run dev:all
```
Esto levantará:
- 🌐 **Frontend Three.js**: [http://localhost:8080](http://localhost:8080)
- ⚡ **LiveSync WebSocket Server**: `ws://localhost:8081`

### 3. Modo Desarrollo Web puro (Sin sincronización 3D)
```bash
npm run dev
```

### 4. Build de Producción
```bash
npm run build
```

---

## 🔄 Flujo de Trabajo 3D (Blender ➔ Three.js)

1. Abre [`static/assets/models/unified_room.blend`](static/assets/models/unified_room.blend) en Blender.
2. Ten corriendo `npm run dev:all` en tu terminal.
3. Cada vez que hagas un cambio en Blender y presiones **`Ctrl + S`**:
   - El watcher detecta el guardado en segundo plano.
   - Blender Headless compila `unified_room.glb` en ~1 segundo.
   - Three.js recibe la notificación vía WebSocket y recarga la escena automáticamente con los nuevos cambios.

> [!TIP]
> Tienes una copia de seguridad segura y probada en la carpeta `backup/`. Si necesitas restaurar una versión previa, los archivos se encuentran en `backup/unified_room_backup.blend`.
