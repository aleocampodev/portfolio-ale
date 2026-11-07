# 3D Asset Synchronization Pipeline

This module implements a **unidirectional, reactive architecture** to synchronize visual and geometric changes from Blender into the Three.js runtime client in real time, without freezing the GUI or relying on heavyweight polling sockets.

---

## System Architecture

```mermaid
flowchart LR
    subgraph Blender [Blender Desktop Suite]
        A[unified_room.blend] --"Ctrl + S (Save)"--> B[Local Disk Write]
    end

    subgraph Watcher [Pipeline Daemon (:8081)]
        B --"inotify (fs.watch)"--> C[watch_sync.js]
        C --"Spawn Headless CLI"--> D[export_glb.py]
        D --"Fast glTF Compilation (~1.2s)"--> E[unified_room.glb]
        D --"State Manifest"--> M[carpet_status.json]
        C --"WebSocket Broadcast (GLB_UPDATED)"--> F[ws://localhost:8081]
    end

    subgraph Browser [Three.js Client Application]
        F --"LiveSync.js (WS Client)"--> G[WebGL Viewport :8080]
        E --> G
        M --> G
        G --"Hot Reload / Scene Refresh"--> H[Updated 3D Scene Graph]
    end
```

---

## Directory Structure

```text
pipeline/
├── export_glb.py     # Headless Blender Python compiler
├── watch_sync.js     # Node.js file watcher + WebSocket broadcast daemon (port 8081)
└── README.md         # Technical documentation
```

---

## Available Commands

From the project root (`portfolio-ale-web/joan-portfolio`):

| Command | Description |
|---|---|
| `npm run sync` | Starts only the LiveSync file watcher and WebSocket server. |
| `npm run export:glb` | Triggers a single manual headless glTF/GLB compilation. |
| `npm run dev:all` | **(Recommended)** Runs Webpack dev server (`:8080`) and LiveSync (`:8081`) concurrently. |

---

## WebGL & 3D Authoring Conventions

To ensure that 3D assets modified in Blender render consistently in WebGL with Three.js:

1. **Apply Object Transformations (`Ctrl + A`):**
   - Always apply **Rotation & Scale** to geometry prior to saving.
2. **PBR Compatibility & Unlit Shading:**
   - Procedural Cycles shader nodes (Noise, Voronoi) are not natively supported in standard glTF 2.0 runtime models. Complex procedural details must either be baked into high-resolution texture maps or recreated using custom Three.js GLSL shaders.
   - For pre-baked lightmaps, map the texture to both **Base Color** and **Emission Color** (`Strength: 1.0`) to avoid duplicate runtime lighting calculations.
3. **Whiteboard Canvas Geometry:**
   - The front face of the drawing canvas is aligned along the $+X$ axis and mapped to avoid z-fighting with the metal frame.
4. **Carpet / Rug Entity:**
   - Represented as a reactive entity. The Three.js runtime supports multi-layered shell texturing (24–40 shells) controlled by `carpet_status.json` dynamically generated during headless export.
