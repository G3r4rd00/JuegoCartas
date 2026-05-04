import { GameEngine } from "./game-engine.js";
import { UIRenderer } from "./ui-renderer.js";
import { MachineController } from "./machine-controller.js";

const engine = new GameEngine();
const uiRenderer = new UIRenderer(engine);
const machineController = new MachineController(engine, uiRenderer);

void uiRenderer;
void machineController;

engine.startNewGame();
