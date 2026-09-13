import {
  REQUEST_HANDLINGS,
  REQUEST_REVIEW_STATUSES,
  REQUEST_TYPES
} from "../../core/constants.js";
import {
  ERROR_CODES,
  ModuleError
} from "../../core/errors.js";

export function normalizeRequestDraft({
  operationId,
  type,
  requesterUserUuid,
  primaryDomainUuid,
  intent,
  title,
  details = ""
}) {
  const cleanOperationId =
    String(operationId ?? "").trim();
  const cleanIntent =
    String(intent ?? "").trim();
  const cleanTitle =
    String(title ?? "").trim();
  const cleanDetails =
    String(details ?? "").trim();

  if (!cleanOperationId) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "operationId é obrigatório."
    );
  }

  if (!REQUEST_TYPES.includes(type)) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Tipo de Request inválido: ${type}`
    );
  }

  if (!requesterUserUuid) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O usuário solicitante é obrigatório."
    );
  }

  if (!primaryDomainUuid) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O Domain principal é obrigatório no Bloco 2."
    );
  }

  if (!cleanTitle) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O título da solicitação é obrigatório."
    );
  }

  if (!cleanIntent) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Explique o que deseja conseguir com a solicitação."
    );
  }

  if (cleanTitle.length > 160) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O título não pode exceder 160 caracteres."
    );
  }

  if (cleanIntent.length > 1200) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "A intenção não pode exceder 1200 caracteres."
    );
  }

  if (cleanDetails.length > 6000) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Os detalhes não podem exceder 6000 caracteres."
    );
  }

  return {
    operationId: cleanOperationId,
    type,
    status: "submitted",
    requesterUserUuid,
    primaryDomainUuid,
    relatedDomainUuids: [],
    intent: cleanIntent,

    proposal: {
      title: cleanTitle,
      details: cleanDetails
    },

    gmDecision: {
      summary: "",
      handling: "none",
      decidedByUserUuid: null
    },

    resultUuid: null,

    history: [
      {
        kind: "submitted",
        summary: "Solicitação enviada ao Mestre.",
        userUuid: requesterUserUuid,
        tick: null
      }
    ]
  };
}

export function planRequestDecision(
  requestData,
  {
    status,
    summary = "",
    handling = "none",
    decidedByUserUuid
  }
) {
  if (!REQUEST_REVIEW_STATUSES.includes(status)) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Status de revisão inválido: ${status}`
    );
  }

  if (!REQUEST_HANDLINGS.includes(handling)) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Handling inválido: ${handling}`
    );
  }

  if (
    handling !== "none"
    && status !== "approved"
  ) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Handling diferente de 'none' só pode ser preparado em Request aprovado."
    );
  }

  const cleanSummary =
    String(summary ?? "").trim();

  if (cleanSummary.length > 4000) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "A decisão do Mestre não pode exceder 4000 caracteres."
    );
  }

  const nextHistory = [
    ...(requestData.history ?? []),
    {
      kind: status,
      summary:
        cleanSummary
        || `Status alterado para ${status}.`,
      userUuid: decidedByUserUuid ?? null,
      tick: null
    }
  ];

  return {
    ...requestData,

    status,

    gmDecision: {
      summary: cleanSummary,
      handling,
      decidedByUserUuid:
        decidedByUserUuid ?? null
    },

    history: nextHistory
  };
}

export function planRequestResubmission(
  requestData,
  { type, title, intent, details = "", resubmittedByUserUuid }
) {
  if (requestData?.status !== "needs-changes") {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "A Request só pode ser corrigida depois que o Mestre solicitar ajustes."
    );
  }
  if (requestData?.resultUuid) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "Request com resultado materializado não pode ser corrigida."
    );
  }

  const revised = normalizeRequestDraft({
    operationId: requestData.operationId,
    type,
    requesterUserUuid: requestData.requesterUserUuid,
    primaryDomainUuid: requestData.primaryDomainUuid,
    title,
    intent,
    details
  });

  return {
    ...requestData,
    type: revised.type,
    status: "submitted",
    intent: revised.intent,
    proposal: revised.proposal,
    gmDecision: {
      summary: "",
      handling: "none",
      decidedByUserUuid: null
    },
    history: [
      ...(requestData.history ?? []),
      {
        kind: "resubmitted",
        summary: "Solicitação corrigida e reenviada ao Mestre.",
        userUuid: resubmittedByUserUuid ?? null,
        tick: null
      }
    ]
  };
}

const REQUEST_WITHDRAWABLE_STATUSES = Object.freeze([
  "submitted",
  "under-review",
  "needs-changes"
]);

export function planRequestWithdrawal(requestData, { withdrawnByUserUuid, summary = "" } = {}) {
  if (!REQUEST_WITHDRAWABLE_STATUSES.includes(requestData?.status)) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "A Request só pode ser retirada enquanto ainda está no fluxo de revisão."
    );
  }
  if (requestData?.resultUuid) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "Request com resultado materializado não pode ser retirada."
    );
  }
  const cleanSummary = String(summary ?? "").trim();
  const nextHistory = [
    ...(requestData.history ?? []),
    {
      kind: "withdrawn",
      summary: cleanSummary || "Solicitação retirada pelo solicitante.",
      userUuid: withdrawnByUserUuid ?? null,
      tick: null
    }
  ];
  return {
    ...requestData,
    status: "withdrawn",
    history: nextHistory
  };
}

export function planRequestFulfillment(requestData, { fulfilledByUserUuid, summary = "" } = {}) {
  if (requestData?.status !== "approved") {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "Somente Request aprovada pode ser marcada como cumprida."
    );
  }
  const cleanSummary = String(summary ?? "").trim();
  const nextHistory = [
    ...(requestData.history ?? []),
    {
      kind: "fulfilled",
      summary: cleanSummary || "Atendimento confirmado pelo GM.",
      userUuid: fulfilledByUserUuid ?? null,
      tick: null
    }
  ];
  return {
    ...requestData,
    status: "fulfilled",
    history: nextHistory
  };
}
