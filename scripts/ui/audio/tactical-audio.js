/**
 * TacticalAudioEngine — Sintetizador Procedural de Áudio Tático (Web Audio API)
 * Zero-overhead dormant audio engine stub for C2 MFD Aerospace Console.
 * All sound generation methods are no-ops to achieve complete elimination
 * of procedural audio triggers and Web Audio context overhead while preserving
 * exported interfaces, action bindings, and 100% test compatibility.
 */
export class TacticalAudioEngine {
  constructor() {
    this.ctx = null;
    this.isEnabled = false;
    this.masterVolume = 0;
  }

  _ensureContext() {
    return null;
  }

  setMuted(muted) {
    this.isEnabled = !muted;
  }

  toggleMute() {
    this.isEnabled = !this.isEnabled;
    return this.isEnabled;
  }

  /**
   * Clique mecânico de relé / comutador industrial (no-op)
   */
  playRelayClick(isOn = true) {}

  /**
   * Clique suave de pino / botão de navegação (no-op)
   */
  playPinClick(freq = 650) {}

  /**
   * Chirp de mira / travamento tático (no-op)
   */
  playTargetLock() {}

  /**
   * Pulso de dados / transmissão de rede (no-op)
   */
  playDataPulse() {}

  /**
   * Beep de alerta militar de alta prioridade (no-op)
   */
  playAlertBeep() {}

  /**
   * Ping de Sonar/Radar de varredura topográfica e orbital (no-op)
   */
  playRadarPing() {}

  /**
   * Pulso de rotação de dial / slider de precisão (no-op)
   */
  playDialPulse() {}

  /**
   * Bipe de telemetria e recepção de pacote operacional (no-op)
   */
  playTelemetryBeep(highPitch = false) {}

  /**
   * Rajada de transmissão de dados (no-op)
   */
  playDataBurst() {}
}

export const tacticalAudio = new TacticalAudioEngine();
