import { initModule } from "./lifecycle/init.js";
import { setupModule } from "./lifecycle/setup.js";
import { readyModule } from "./lifecycle/ready.js";
import { registerAuthoritySocket } from "./authority/socket.js";
import { registerSceneControlHook } from "./ui/launcher.js";

registerSceneControlHook();

Hooks.once("socketlib.ready", registerAuthoritySocket);
Hooks.once("init", initModule);
Hooks.once("setup", setupModule);
Hooks.once("ready", readyModule);
