/**
 * TelemetryCanvasController — Renderizador de Telemetria e Radar Orbital em Canvas 2D
 * Inspirado nos consoles de teste-hud (mars-satview e data-topology) e referências de FUI (Jayse Hansen).
 * Executa a 60 FPS com ciclo de vida seguro, sem vazamento de memória e suporte a DPR.
 */
export class TelemetryCanvasController {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement?.getContext?.("2d") || null;
    this.options = options;
    this._animId = null;
    this.time = 0;
    this.isRunning = false;

    // Pontos de contorno topográfico procedural da base
    this.contourPoints = [
      [0.10, 0.45], [0.18, 0.40], [0.26, 0.43], [0.35, 0.38],
      [0.44, 0.42], [0.52, 0.39], [0.60, 0.45], [0.70, 0.41],
      [0.82, 0.46], [0.90, 0.42]
    ];

    // Pulsos de pacotes de dados viajando no vetor de telemetria
    this.vectorPulses = [0.12, 0.42, 0.72];
  }

  start() {
    if (!this.canvas || !this.ctx || this.isRunning) return;
    this.isRunning = true;
    this._renderLoop();
  }

  stop() {
    this.isRunning = false;
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
  }

  destroy() {
    this.stop();
    this.ctx = null;
    this.canvas = null;
  }

  _renderLoop() {
    if (!this.isRunning || !this.canvas || !this.ctx) return;

    this.time += 0.016;
    const t = this.time;

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);

      if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
        this.canvas.width = targetW;
        this.canvas.height = targetH;
      }
      if (typeof this.ctx.setTransform === "function") {
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const w = rect.width;
      const h = rect.height;

      this.ctx.clearRect(0, 0, w, h);

      // 1. Grade de Coordenadas Táticas e Pontos Cardinais
      this._drawTacticalGrid(w, h);

      // 2. Curvas de Relevo e Nível em Ciano Neon
      this._drawTopography(w, h, t);

      // 3. Radar Polar com Varredura em 360°
      this._drawRadarSweep(w, h, t);

      // 4. Retículo Central de Fixação da Base
      this._drawCenterReticle(w, h, t);
    }

    if (typeof requestAnimationFrame === "function") {
      this._animId = requestAnimationFrame(() => this._renderLoop());
    }
  }

  _drawTacticalGrid(w, h) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "rgba(13, 74, 92, 0.35)";
    ctx.lineWidth = 1;

    for (let x = 20; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 15; y < h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Marcadores em cruz '+' nos nós
    ctx.strokeStyle = "rgba(63, 244, 213, 0.35)";
    for (let x = 60; x < w - 20; x += 80) {
      for (let y = 45; y < h - 20; y += 60) {
        ctx.beginPath();
        ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y);
        ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawTopography(w, h, t) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "#3ff4d5";
    ctx.lineWidth = 1.8;
    ctx.shadowColor = "rgba(63, 244, 213, 0.6)";
    ctx.shadowBlur = 6;

    ctx.beginPath();
    for (let i = 0; i < this.contourPoints.length; i++) {
      const px = w * this.contourPoints[i][0];
      const py = h * this.contourPoints[i][1] + Math.sin(t * 1.5 + i) * 3;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Linha de cume secundária translúcida
    ctx.strokeStyle = "rgba(0, 240, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < this.contourPoints.length; i++) {
      const px = w * this.contourPoints[i][0];
      const py = h * this.contourPoints[i][1] + 16 + Math.cos(t * 1.2 + i) * 2;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawRadarSweep(w, h, t) {
    const ctx = this.ctx;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r = Math.min(w, h) * 0.42;

    ctx.save();
    // Círculos concêntricos de calibração
    ctx.strokeStyle = "rgba(13, 74, 92, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
    ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Feixe rotativo de varredura
    const angle = (t * 1.2) % (Math.PI * 2);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, "rgba(63, 244, 213, 0.2)");
    grad.addColorStop(1, "rgba(63, 244, 213, 0.0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle - 0.4, angle);
    ctx.closePath();
    ctx.fill();

    // Linha frontal de varredura
    ctx.strokeStyle = "#3ff4d5";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx.stroke();
    ctx.restore();
  }

  _drawCenterReticle(w, h, t) {
    const ctx = this.ctx;
    const cx = w * 0.5;
    const cy = h * 0.5;

    ctx.save();
    // Cantoneiras chanfradas ao redor do núcleo
    const boxSize = 24 + Math.sin(t * 3) * 1.5;
    ctx.strokeStyle = "#ffd15c";
    ctx.lineWidth = 1.6;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(cx - boxSize, cy - boxSize + 6);
    ctx.lineTo(cx - boxSize, cy - boxSize);
    ctx.lineTo(cx - boxSize + 6, cy - boxSize);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(cx + boxSize - 6, cy - boxSize);
    ctx.lineTo(cx + boxSize, cy - boxSize);
    ctx.lineTo(cx + boxSize, cy - boxSize + 6);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(cx - boxSize, cy + boxSize - 6);
    ctx.lineTo(cx - boxSize, cy + boxSize);
    ctx.lineTo(cx - boxSize + 6, cy + boxSize);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(cx + boxSize - 6, cy + boxSize);
    ctx.lineTo(cx + boxSize, cy + boxSize);
    ctx.lineTo(cx + boxSize, cy + boxSize - 6);
    ctx.stroke();

    // Ponto central pulsante
    ctx.fillStyle = "#3ff4d5";
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
