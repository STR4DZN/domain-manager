// src/core/versioning/build-metadata.ts
var BUILD_METADATA = Object.freeze({
  moduleVersion: "0.3.0-dev.1",
  buildChannel: "dev",
  target: "foundry-vtt"
});

// src/diagnostics/build-diagnostics.ts
function getBuildDiagnostics() {
  return {
    ...BUILD_METADATA
  };
}

// src/main.ts
Hooks.once("init", () => {
  console.info("[Domain Manager] init");
});
Hooks.once("ready", () => {
  console.info("[Domain Manager] ready", BUILD_METADATA);
  console.info("[Domain Manager] build diagnostics", getBuildDiagnostics());
});
//# sourceMappingURL=main.js.map
