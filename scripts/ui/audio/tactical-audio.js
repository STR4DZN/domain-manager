/**
 * TacticalAudioEngine — Sintetizador Procedural de Áudio Tático (Web Audio API)
 * Gera efeitos sonoros mecânicos, beeps de alerta, pulsos de telemetria e chirps de mira
 * sem depender de nenhum arquivo de áudio externo gravado previamente.
 */
export class TacticalAudioEngine {
  constructor() {
    this.ctx = null;
    this.isEnabled = true;
    this.masterVolume = 0.15;
  }

  _ensureContext() {
    if (!this.isEnabled) return null;
    if (!this.ctx && typeof window !== "undefined") {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setMuted(muted) {
    this.isEnabled = !muted;
  }

  toggleMute() {
    this.isEnabled = !this.isEnabled;
    return this.isEnabled;
  }

  /**
   * Clique mecânico de relé / comutador industrial (ação principal de botões e switches)
   */
  playRelayClick(isOn = true) {
    const ctx = this._ensureContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(isOn ? 380 : 260, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.035);

      gain.gain.setValueAtTime(this.masterVolume * 0.8, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.035);
    } catch {
      // Silencioso em navegadores que exigem interação prévia
    }
  }

  /**
   * Clique suave de pino / botão de navegação
   */
  playPinClick(freq = 650) {
    const ctx = this._ensureContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.025);

      gain.gain.setValueAtTime(this.masterVolume * 0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.025);
    } catch {}
  }

  /**
   * Chirp de mira / travamento tático (foco de base ou entidade na árvore)
   */
  playTargetLock() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1760, now + 0.03);
      osc.frequency.setValueAtTime(2640, now + 0.06);

      gain.gain.setValueAtTime(this.masterVolume * 0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(now + 0.09);
    } catch {}
  }

  /**
   * Pulso de dados / transmissão de rede (ao abrir modal ou salvar registro)
   */
  playDataPulse() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);

      gain.gain.setValueAtTime(this.masterVolume * 0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(now + 0.05);
    } catch {}
  }

  /**
   * Beep de alerta militar de alta prioridade (condição crítica ou crise)
   */
  playAlertBeep() {
    const ctx = this._ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.setValueAtTime(1250, now + 0.06);

      gain.gain.setValueAtTime(this.masterVolume * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(now + 0.12);
    } catch {}
  }
}

export const tacticalAudio = new TacticalAudioEngine();
