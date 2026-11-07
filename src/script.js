import "./style.css";
import Experience from "./Experience/Experience.js";
import LiveSync from "./Experience/Utils/LiveSync.js";

// Inicializar LiveSync 3D Pipeline en desarrollo
window.liveSync = new LiveSync();

const isMobile =
  /Mobi|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || navigator.userAgentData?.mobile;

if (window.innerWidth > 768 && !isMobile) {
  window.experience = new Experience({
    webglElement: document.querySelector("#webgl"),
    cssLeftMonitor: document.querySelector("#cssLeftMonitor"),
    cssRightMonitor: document.querySelector("#cssRightMonitor"),
  });
} else {
  const mobileAdvise = document.querySelector(".mobile-text");
  if (mobileAdvise) {
    mobileAdvise.style.display = "block";
  }
}
