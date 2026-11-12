import {
  Vector2,
  Vector3,
  Color,
  Euler,
  PlaneGeometry,
  Quaternion,
} from "three";

// Camera
export const CAMERA_POSITION = new Vector3(-23, 17, 23);
export const CAMERA_QUATERNION = new Quaternion(
  -0.19229498096591757,
  -0.3743024144764491,
  -0.07965118909235921,
  0.9036459654580388
);
export const CAMERA_TARGET = new Vector3(0, 2.5, 0);

//Carpet
export const CARPET_SHELLCOUNT = 32;
export const CARPET_UNIFORMS = {
  uColor: new Color(0.7529412, 0.5424671, 0.4392157).convertSRGBToLinear(),
  uShellCount: 32,
  uShellLength: 0.16,
  uDensity: 250,
  uThickness: 5,
};
export const CARPET_GROUP_SCALE = new Vector3(0.0355, 0.0355, 0.0355);
export const CARPET_GROUP_POSITION = new Vector3(-2.61408, 0.377, -0.904327);
export const CARPET_GROUP_ROTATION = new Euler(-Math.PI / 2, 0, 0);

//  Coffee
export const COFFEE_GEOMETRY = new PlaneGeometry(0.15, 0.6, 16, 64);
export const COFFEE_POSITION = new Vector3(0.230979, 2.3, -3.64951);

//Confetti
export const CONFETTI_AMOUNT = 500;
export const CONFETTI_EXPLOSION_RADIUS = 300;
export const CONFETTI_COLORS = [
  0xf03559, 0xf272b3, 0x9be4f2, 0xffeb5e, 0xffb300, 0x7bff8b,
];

// Monitors
export const MONITOR_SCREEN_WIDTH = 1370.178;
export const MONITOR_SCREEN_HEIGHT = 764.798;
export const MONITOR_IFRAME_PADDING = "8px";

// Left Monitor (centrado sobre el mousepad/teclado en X = 1.5238 y ampliado 1.22x desde su base Y = 1.9196)
export const LEFT_MONITOR_CSS_OBJECT_POSITION = new Vector3(
  1.523816,
  2.636533,
  -4.23009
);
export const LEFT_MONITOR_CSS_OBJECT_SCALE = new Vector3(
  0.0012444,
  0.0012444,
  1
);
export const LEFT_MONITOR_IFRAME_SRC = "https://joan-os.vercel.app";
export const LEFT_MONITOR_CAMERA_POSITION = new Vector3(
  1.523816,
  2.74,
  -1.25
);
export const LEFT_MONITOR_CAMERA_QUATERNION = new Quaternion(
  0,
  -0.06458455890406237,
  0,
  0.9979122380005006
);
export const LEFT_MONITOR_CAMERA_TARGET = new Vector3(
  1.523816,
  2.636533,
  -4.23009
);

// Navigate
export const ELEMENTS_TO_RAYCAST = [
  "linkedin",
  "github",
  "x",
  "leftMonitor",
  "leftMonitorScreen",
  "whiteboard",
  "whiteboardCanvas",
];
export const ORBIT_CONTROLS_CONFIG = {
  enabled: false,
  screenSpacePanning: true,
  enableKeys: false,
  zoomSpeed: 1,
  enableDamping: true,
  dampingFactor: 0.05,
  rotateSpeed: 0.4,
  maxAzimuthAngle: Math.PI * 2,
  minAzimuthAngle: -Math.PI / 2,
  minPolarAngle: Math.PI / 6,
  maxPolarAngle: Math.PI / 2,
  minDistance: 2,
  maxDistance: 35,
  target: { y: 2.5 },
};

// Whiteboard
export const WHITEBOARD_CAMERA_POSITION = new Vector3(
  -3.3927,
  5.18774,
  4.61366
);
export const WHITEBOARD_CAMERA_QUATERNION = new Quaternion(
  -0.08802977047890838,
  0,
  0,
  0.9961178441878403,
  1
);
export const WHITEBOARD_CAMERA_TARGET = new Vector3(-3.3927, 3.18774, -4.61366);

// Rubik's cube
export const RUBIK_TARGET = new Vector3(0, 0, 0);
export const RUBIK_ROTATION_Y = (-152.484 * Math.PI) / 180;
export const RUBIK_POSITION = new Vector3(-0.67868, 1.499, -3.92849);
export const RUBIK_SCALE = 0.021432;

// Links
export const LINKEDIN_URL = "https://www.linkedin.com/in/joan-ramos-refusta/";
export const GITHUB_URL = "https://github.com/jrefusta";
export const X_URL = "https://x.com/jrefusta";

// Top Chair
export const TOP_CHAIR_POSITION = new Vector3(1.4027, 0.496728, -1.21048);
