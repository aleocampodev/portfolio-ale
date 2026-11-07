export default class LiveSync {
  constructor() {
    // Only activate in local development environment
    const isLocal =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.port !== "";

    if (!isLocal) return;

    this.wsUrl = "ws://localhost:8081";
    this.retryDelay = 2000;
    this.toastElement = null;
    this.createUI();
    this.connect();
  }

  createUI() {
    if (document.getElementById("livesync-toast")) return;

    const toast = document.createElement("div");
    toast.id = "livesync-toast";
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.padding = "10px 16px";
    toast.style.borderRadius = "8px";
    toast.style.backgroundColor = "rgba(20, 20, 25, 0.85)";
    toast.style.backdropFilter = "blur(8px)";
    toast.style.border = "1px solid #E91E8C";
    toast.style.color = "#ffffff";
    toast.style.fontFamily = "system-ui, -apple-system, sans-serif";
    toast.style.fontSize = "13px";
    toast.style.fontWeight = "500";
    toast.style.boxShadow = "0 4px 20px rgba(233, 30, 140, 0.25)";
    toast.style.zIndex = "999999";
    toast.style.display = "none";
    toast.style.transition = "all 0.3s ease";
    toast.style.pointerEvents = "none";
    document.body.appendChild(toast);
    this.toastElement = toast;
  }

  showToast(message, duration = 2500) {
    if (!this.toastElement) return;
    this.toastElement.innerHTML = message;
    this.toastElement.style.display = "block";
    this.toastElement.style.opacity = "1";
    this.toastElement.style.transform = "translateY(0)";

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastElement.style.opacity = "0";
      this.toastElement.style.transform = "translateY(10px)";
      setTimeout(() => {
        this.toastElement.style.display = "none";
      }, 300);
    }, duration);
  }

  connect() {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        console.log("%c✔ [LiveSync] Conectado al pipeline Blender ➔ Three.js", "color: #E91E8C; font-weight: bold;");
        this.showToast("⚡ LiveSync conectado a Blender");
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "GLB_UPDATED") {
            console.log("%c🔄 [LiveSync] Modelo 3D actualizado desde Blender. Recargando escena...", "color: #00E5FF; font-weight: bold;", data);
            this.showToast(`🔄 Escena actualizada (${data.duration}s)... Recargando`);

            window.dispatchEvent(
              new CustomEvent("livesync:glb-updated", { detail: data })
            );

            // Auto reload after brief notice to ensure fresh assets
            setTimeout(() => {
              window.location.reload();
            }, 500);
          }
        } catch (e) {
          console.error("[LiveSync] Error procesando mensaje:", e);
        }
      };

      this.ws.onclose = () => {
        setTimeout(() => this.connect(), this.retryDelay);
      };

      this.ws.onerror = () => {
        this.ws.close();
      };
    } catch (err) {
      setTimeout(() => this.connect(), this.retryDelay);
    }
  }
}
