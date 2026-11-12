import EventEmitter from "./Utils/EventEmitter.js";
import Experience from "./Experience.js";
import Baked from "./Baked.js";
import PlankFloor from "./PlankFloor.js";
import Carpet from "./Carpet.js";
import Skybox from "./Skybox.js";
import TopChair from "./TopChair.js";
import Whiteboard from "./Whiteboard.js";
import LeftMonitorScreen from "./LeftMonitorScreen.js";
import AudioManager from "./AudioManager.js";
import LedStrips from "./LedStrips.js";
import ContactShadows from "./ContactShadows.js";

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
        this.setPlankFloor();
        this.setCarpet();

        this.setContactShadows();
        this.setLedStrips();
        this.setWhiteboard();
        this.setTopChair();

        this.setLeftMonitorScreen();
        this.setSkybox();

        // Trigger worldready so Preloader dismisses the cover
        this.trigger("worldready");
      }
    });
  }

  setBaked() {
    this.baked = new Baked();
  }

  setPlankFloor() {
    this.plankFloor = new PlankFloor();
  }

  setCarpet() {
    this.carpet = new Carpet();
  }

  setContactShadows() {
    this.contactShadows = new ContactShadows();
  }

  setLedStrips() {
    this.ledStrips = new LedStrips();
  }

  setSkybox() {
    this.skybox = new Skybox();
  }

  setTopChair() {
    this.topChair = new TopChair();
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
    if (this.topChair) this.topChair.update();
    if (this.skybox) this.skybox.update();
    if (this.leftMonitorScreen) this.leftMonitorScreen.update();
    if (this.whiteboard) this.whiteboard.update();
  }

  destroy() {}
}
