import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlayerIntroProfile,
  introSessionKey,
  resolveMotionMode,
  shouldPresentPlayerIntro,
} from "../scripts/ui/motion.js";

test("motion respeita preferência explícita e redução de movimento do sistema", () => {
  assert.equal(resolveMotionMode({ preference: "full", prefersReducedMotion: false }), "full");
  assert.equal(resolveMotionMode({ preference: "reduced", prefersReducedMotion: false }), "reduced");
  assert.equal(resolveMotionMode({ preference: "none", prefersReducedMotion: true }), "none");
  assert.equal(resolveMotionMode({ preference: "full", prefersReducedMotion: true }), "reduced");
  assert.equal(resolveMotionMode({ preference: "unknown", prefersReducedMotion: false }), "full");
});

test("abertura usa o contexto real do jogador, mundo e domínio", () => {
  assert.deepEqual(
    buildPlayerIntroProfile({
      user: { id: "player-7", name: "Lia", isGM: false },
      world: { id: "world-omega", title: "Operação Aurora" },
      domain: { name: "Aurelia" },
    }),
    {
      operator: "Lia",
      role: "Operador",
      world: "Operação Aurora",
      domain: "Aurelia",
    },
  );
  assert.equal(introSessionKey({ id: "world-omega" }, { id: "player-7" }), "domain-manager:intro:world-omega:player-7");
  assert.equal(shouldPresentPlayerIntro({ user: { id: "player-7" } }), true);
  assert.equal(shouldPresentPlayerIntro({ alreadySeen: true, user: { id: "player-7" } }), true);
});
