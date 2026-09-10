/**
 * ImageStudioController — Controlador do Estúdio de Imagem Universal
 * Gerencia a calibração de enquadramento (cover, contain, fill), ponto focal X/Y (0-100%),
 * zoom de precisão (50-250%) e presets de proporção para Domínios, Obras e Notáveis.
 */

export function bindLiveImagePreview(element, prefix, previewImgId, previewContainerId, urlInputSelector) {
  const img = element?.querySelector(previewImgId);
  const container = element?.querySelector(previewContainerId);
  if (!img || !container) return;

  const urlInput = urlInputSelector ? element.querySelector(urlInputSelector) : null;

  const update = () => {
    // Atualizar URL na prévia
    if (urlInput) {
      const url = urlInput.value?.trim() || "";
      if (url) {
        img.src = url;
        img.style.display = "block";
      } else {
        img.style.display = "none";
      }
    } else if (img.getAttribute("src")) {
      img.style.display = "block";
    }

    img.onerror = () => {
      img.style.display = "none";
    };
    img.onload = () => {
      img.style.display = "block";
    };

    const fit = element.querySelector(`${prefix}-fit`)?.value || "cover";
    const height = element.querySelector(`${prefix}-height`)?.value || "180";
    const posX = element.querySelector(`${prefix}-pos-x`)?.value ?? "50";
    const posY = element.querySelector(`${prefix}-pos-y`)?.value ?? "50";
    const zoom = element.querySelector(`${prefix}-zoom`)?.value ?? "100";
    const scale = Number(zoom) / 100;

    const valX = element.querySelector(`${prefix}-val-x`);
    const valY = element.querySelector(`${prefix}-val-y`);
    const valZoom = element.querySelector(`${prefix}-val-zoom`);
    if (valX) valX.textContent = `${posX}%`;
    if (valY) valY.textContent = `${posY}%`;
    if (valZoom) valZoom.textContent = `${zoom}%`;

    if (container.classList.contains("dm-image-preview-portrait")) {
      const shape = element.querySelector(`${prefix}-shape`)?.value || "square";
      if (shape === "portrait") {
        container.style.width = "72px";
        container.style.height = "96px";
      } else if (shape === "wide") {
        container.style.width = "96px";
        container.style.height = "96px";
      } else {
        container.style.width = "72px";
        container.style.height = "72px";
      }
    } else {
      container.style.height = `${Math.min(160, Math.round(Number(height) * 0.75))}px`;
    }

    img.style.objectFit = fit;
    img.style.objectPosition = `${posX}% ${posY}%`;
    img.style.transform = `scale(${scale})`;
    img.style.transformOrigin = `${posX}% ${posY}%`;
  };

  const selectors = [`${prefix}-fit`, `${prefix}-height`, `${prefix}-shape`, `${prefix}-pos-x`, `${prefix}-pos-y`, `${prefix}-zoom`];
  for (const sel of selectors) {
    const el = element.querySelector(sel);
    if (el) {
      el.addEventListener("input", update);
      el.addEventListener("change", update);
    }
  }

  if (urlInput) {
    urlInput.addEventListener("input", update);
    urlInput.addEventListener("change", update);
    urlInput.addEventListener("paste", () => setTimeout(update, 10));
  }

  update();
}

/**
 * Extrai os dados do formulário do Image Studio para persistência segura
 */
export function extractImageStudioFormData(htmlElement, prefix) {
  const fit = htmlElement?.querySelector(`${prefix}-fit`)?.value || "cover";
  const posX = Number(htmlElement?.querySelector(`${prefix}-pos-x`)?.value ?? 50);
  const posY = Number(htmlElement?.querySelector(`${prefix}-pos-y`)?.value ?? 50);
  const zoom = Number(htmlElement?.querySelector(`${prefix}-zoom`)?.value ?? 100);
  const shape = htmlElement?.querySelector(`${prefix}-shape`)?.value || "square";

  return {
    fit,
    posX,
    posY,
    zoom,
    shape
  };
}

export class ImageStudioController {
  static bindLiveImagePreview = bindLiveImagePreview;
  static extractImageStudioFormData = extractImageStudioFormData;
  static extractImageStudioParams = extractImageStudioFormData;
  static buildImageStudioStyle({ fit = "cover", height = 180, posX = 50, posY = 50, zoom = 100 } = {}) {
    const scale = Number(zoom) / 100;
    return `height: ${height}px; object-fit: ${fit}; object-position: ${posX}% ${posY}%; transform: scale(${scale}); transform-origin: ${posX}% ${posY}%;`;
  }
}

