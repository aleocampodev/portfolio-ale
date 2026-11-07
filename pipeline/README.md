# 🚀 3D LiveSync Pipeline (Blender ➔ Three.js)

Este módulo implementa una arquitectura **unidireccional y reactiva** para sincronizar cambios visuales y geométricos desde Blender hacia el cliente web Three.js en tiempo real, sin congelar la interfaz gráfica ni depender de puertos lentos.

---

## 📐 Arquitectura del Sistema

```mermaid
flowchart LR
    subgraph Blender [Blender Desktop]
        A[unified_room.blend] --"Ctrl + S (Guardar)"--> B[Disco Local]
    end

    subgraph Watcher [Pipeline Daemon (:8081)]
        B --"inotify (fs.watch)"--> C[watch_sync.js]
        C --"Spawn Headless"--> D[export_glb.py]
        D --"Compilación GLB (1.1s)"--> E[unified_room.glb]
        C --"WebSocket broadcast\n(GLB_UPDATED)"--> F[ws://localhost:8081]
    end

    subgraph Browser [Three.js Client]
        F --"LiveSync.js\n(WS Client)"--> G[WebGL Viewport\nhttp://localhost:8080]
        G --"Hot Reload / Refresh"--> H[Escena Actualizada]
    end
```

---

## 📁 Estructura de Archivos

```text
pipeline/
├── export_glb.py     # Script headless de Blender para compilar unified_room.glb
├── watch_sync.js     # Watcher Node.js + Servidor WebSocket (puerto 8081)
└── README.md         # Esta documentación
```

---

## 🛠️ Comandos Disponibles

Desde la raíz del proyecto (`portfolio-ale-web/joan-portfolio`):

| Comando | Descripción |
|---|---|
| `npm run sync` | Inicia únicamente el observador y servidor WebSocket de LiveSync. |
| `npm run export:glb` | Ejecuta una exportación única a GLB de forma manual. |
| `npm run dev:all` | **(Recomendado)** Inicia en paralelo el servidor Webpack (`:8080`) y el sincronizador (`:8081`). |

---

## 🎨 Buenas Prácticas y Reglas WebGL para Blender

Para garantizar que cualquier cambio en Blender se visualice idéntico en Three.js:

1. **Aplicar Transformaciones (`Ctrl + A`)**:
   - Siempre aplica **Rotation & Scale** a tus mallas antes de guardar.
2. **Materiales Compatibles (Principled BSDF & Unlit)**:
   - Los nodos procedurales complejos de Cycles (Voronoi, Noise, ColorRamp) **no se exportan a la web**. Deben hornearse a mapas de textura o recrearse mediante shaders GLSL en Three.js.
   - Si un material usa iluminación horneada (como los baked de la habitación), configura el nodo de imagen conectado a **Base Color** y a **Emission Color** con `Emission Strength: 1.0` para un resultado limpio y sin sombras duplicadas.
3. **Malla del Whiteboard**:
   - La cara frontal del canvas está orientada hacia el eje $+X$ e integrada en las dimensiones de la pizarra metálica.
4. **Tapete (Carpet)**:
   - En Three.js utiliza un shader procedural multicapa de 24 niveles (*shell texturing*). En Blender se representa con textura y mapa de relieve equivalente.
