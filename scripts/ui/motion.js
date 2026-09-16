const MOTION_MODES = new Set(["full", "reduced", "none"]);
// A abertura é uma confirmação de contexto, não uma mensagem de sessão: ela
// dura quatro segundos quando o usuário abre o módulo pelo ponto de entrada.
const INTRO_DURATION_MS = 4_000;

export function resolveMotionMode({ preference = "full", prefersReducedMotion = false } = {}) {
  const selected = MOTION_MODES.has(preference) ? preference : "full";
  if (selected === "none") return "none";
  return prefersReducedMotion ? "reduced" : selected;
}

export function introSessionKey(world, user) {
  return `domain-manager:intro:${world?.id ?? "world"}:${user?.id ?? "user"}`;
}

export function shouldPresentPlayerIntro({ user } = {}) {
  return Boolean(user?.id);
}

export function buildPlayerIntroProfile({ user, world, domain } = {}) {
  return {
    operator: user?.name || "Operador não identificado",
    role: user?.isGM ? "Autoridade do mundo" : "Operador",
    world: world?.title || "Mundo sem nome",
    domain: domain?.name || "Sem domínio selecionado",
  };
}

export function applyShellMotion(root, { previousView = null, nextView = null } = {}) {
  if (!root) return;
  const mode = currentMotionMode();
  root.dataset.dmMotion = mode;
  if (!previousView || previousView === nextView || mode === "none") return;

  const stage = root.querySelector(".dm-app__workspace-scroll");
  if (!stage?.animate) return;
  const direction = viewDirection(previousView, nextView);
  stage.getAnimations?.().forEach((animation) => animation.cancel());
  stage.animate([
    { opacity: 0.42, transform: `translateX(${direction * 10}px)` },
    { opacity: 1, transform: "translateX(0)" },
  ], motionOptions(mode, { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" }));
}

export function presentPlayerIntro({ root, user, world, domain } = {}) {
  if (!root || !user?.id || !globalThis.document) return false;
  const mode = currentMotionMode();
  if (mode === "none") return false;

  if (!shouldPresentPlayerIntro({ user })) return false;

  const profile = buildPlayerIntroProfile({ user, world, domain });
  const overlay = createIntroOverlay(profile);
  root.append(overlay);
  root.dataset.dmIntro = "active";

  const dismiss = () => {
    if (!overlay.isConnected) return;
    overlay.getAnimations?.().forEach((animation) => animation.cancel());
    if (mode === "full" && overlay.animate) {
      const animation = overlay.animate([
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: "translateY(-6px)" },
      ], motionOptions(mode, { duration: 170 }));
      animation.finished.catch(() => undefined).finally(() => removeIntro(root, overlay));
    } else {
      removeIntro(root, overlay);
    }
  };

  overlay.querySelector("[data-dm-intro-dismiss]")?.addEventListener("click", dismiss, { once: true });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) dismiss();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") dismiss();
  });
  if (mode === "full" && overlay.animate) {
    overlay.animate([
      { opacity: 0, transform: "translateY(8px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], motionOptions(mode, { duration: 280 }));
  }
  globalThis.setTimeout?.(dismiss, INTRO_DURATION_MS);
  return true;
}

function currentMotionMode() {
  const prefersReducedMotion = Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  return resolveMotionMode({ preference: readMotionPreference(), prefersReducedMotion });
}

function readMotionPreference() {
  try {
    return globalThis.localStorage?.getItem("domain-manager:motion") ?? "full";
  } catch {
    return "full";
  }
}

function motionOptions(mode, options) {
  return { fill: "both", ...options, duration: mode === "reduced" ? Math.min(90, options.duration * 0.22) : options.duration };
}

function viewDirection(previousView, nextView) {
  const order = ["command", "domains", "operations", "economy", "projects", "system"];
  return (order.indexOf(nextView) - order.indexOf(previousView)) >= 0 ? 1 : -1;
}

function createIntroOverlay(profile) {
  const overlay = document.createElement("section");
  overlay.className = "dm-player-intro";
  overlay.tabIndex = -1;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Admissão ao Domain Manager");
  const panel = document.createElement("div");
  panel.className = "dm-player-intro__panel";
  const status = document.createElement("p");
  status.className = "dm-player-intro__status";
  status.textContent = "CANAL DE OPERAÇÃO ESTABELECIDO";
  const title = document.createElement("h2");
  title.textContent = profile.operator;
  const detail = document.createElement("p");
  detail.className = "dm-player-intro__detail";
  detail.textContent = `${profile.role} · ${profile.world}`;
  const domain = document.createElement("p");
  domain.className = "dm-player-intro__domain";
  domain.textContent = profile.domain;
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.dataset.dmIntroDismiss = "";
  dismiss.textContent = "Entrar no comando";
  panel.append(status, title, detail, domain, dismiss);
  overlay.append(panel);
  return overlay;
}

function removeIntro(root, overlay) {
  overlay.remove();
  if (root.dataset.dmIntro === "active") delete root.dataset.dmIntro;
}
