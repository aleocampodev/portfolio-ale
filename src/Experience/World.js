import EventEmitter from "./Utils/EventEmitter.js";
import Experience from "./Experience.js";
import Baked from "./Baked.js";
import CoffeeSteam from "./CoffeeSteam.js";
import Skybox from "./Skybox.js";
import TopChair from "./TopChair.js";
import Whiteboard from "./Whiteboard.js";
import LeftMonitorScreen from "./LeftMonitorScreen.js";
import RubiksCube from "./RubiksCube.js";
import Confetti from "./Confetti.js";
import AudioManager from "./AudioManager.js";
import LedStrips from "./LedStrips.js";

import { RUBIK_POSITION, RUBIK_SCALE } from "./constants.js";

export default class World extends EventEmitter {
  constructor(_options) {
    super();
    this.experience = new Experience();
    this.config = this.experience.config;
    this.scene = this.experience.scene;
    this.resources = this.experience.resources;

    this.resources.on("groupEnd", (_group) => {
      if (_group.name === "base") {
        this.setAudioManager();
        this.setBaked();

        this.setLedStrips();
        this.setWhiteboard();
        this.setTopChair();

        this.setLeftMonitorScreen();
        this.setSkybox();
        this.setConfetti();
        this.setCoffeeSteam();
        this.setRubiksCube();

        // Trigger worldready so Preloader dismisses the cover
        this.trigger("worldready");
      }
    });
  }

  setBaked() {
    this.baked = new Baked();
  }

  setLedStrips() {
    this.ledStrips = new LedStrips();
  }

  setRubiksCube() {
    this.rubiksCube = new RubiksCube(RUBIK_POSITION, RUBIK_SCALE);
  }

  setSkybox() {
    this.skybox = new Skybox();
  }

  setCoffeeSteam() {
    this.coffeeSteam = new CoffeeSteam();
  }

  setTopChair() {
    this.topChair = new TopChair();
  }

  setConfetti() {
    this.confetti = new Confetti();
  }

  setWhiteboard() {
    this.whiteboard = new Whiteboard();
  }

  setLeftMonitorScreen() {
    this.leftMonitorScreen = new LeftMonitorScreen();
  }
  setAudioManager() {
    this.audioManager = new AudioManager();
  }

  resize() {}

  update() {
    if (this.coffeeSteam) this.coffeeSteam.update();
    if (this.topChair) this.topChair.update();
    if (this.rubiksCube) this.rubiksCube.update();
    if (this.skybox) this.skybox.update();
    if (this.leftMonitorScreen) this.leftMonitorScreen.update();
    if (this.confetti) this.confetti.update();
    if (this.whiteboard) this.whiteboard.update();
  }

  destroy() {}
}
