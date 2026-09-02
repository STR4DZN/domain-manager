import {
  ECONOMY_LIMITS,
  PROJECT_COST_MODES,
  PROJECT_EDITABLE_STATUSES,
  PROJECT_RESERVATION_STATUSES
} from "../../core/constants.js";
import { assertSafeMinorAmount } from "../../core/numbers.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";

function clean(value) { return String(value ?? "").trim(); }
function ceilDivBigInt(a, b) { return (a + b - 1n) / b; }

export function normalizeProjectDraft({
  domainUuid,
  originRequestUuid = null,
  description = "",
  status = "planned",
  blockedReason = "",
  workRequired,
  workCompleted = 0,
  rateAmount,
  periodTicks,
  carry = 0,
  costs = []
}) {
  if (!domainUuid) throw new ModuleError(ERROR_CODES.VALIDATION, "Domain do Project é obrigatório.");
  if (!PROJECT_EDITABLE_STATUSES.includes(status) && status !== "completed") {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Status de Project inválido: ${status}`);
  }
  for (const [label, value] of [["trabalho total", workRequired],["trabalho realizado", workCompleted],["taxa de trabalho", rateAmount]]) {
    if (!Number.isSafeInteger(value) || value < (label === "trabalho realizado" ? 0 : 1) || value > ECONOMY_LIMITS.MAX_MINOR_AMOUNT) {
      throw new ModuleError(ERROR_CODES.VALIDATION, `${label} inválido.`);
    }
  }
  if (!Number.isInteger(periodTicks) || periodTicks < 1 || periodTicks > ECONOMY_LIMITS.MAX_PERIOD_TICKS) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Período de trabalho inválido.");
  }
  if (!Number.isInteger(carry) || carry < 0 || carry >= periodTicks) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Carry de trabalho inválido.");
  }
  if (workCompleted > workRequired) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Trabalho realizado não pode exceder o total.");
  }
  if (status === "completed" && workCompleted !== workRequired) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Project concluído exige trabalho completo.");
  }
  return {
    domainUuid,
    originRequestUuid: clean(originRequestUuid) || null,
    description: clean(description),
    status,
    blockedReason: clean(blockedReason),
    work: {required:workRequired, completed:workCompleted, rateAmount, periodTicks, carry},
    costs: structuredClone(costs ?? [])
  };
}

export function normalizeProjectCost({localId, resourceId, mode, amount, consumedAmount=0}) {
  if (!clean(localId)) throw new ModuleError(ERROR_CODES.VALIDATION, "localId do custo é obrigatório.");
  if (!clean(resourceId)) throw new ModuleError(ERROR_CODES.VALIDATION, "Recurso do custo é obrigatório.");
  if (!PROJECT_COST_MODES.includes(mode)) throw new ModuleError(ERROR_CODES.VALIDATION, `Modo de custo inválido: ${mode}`);
  try { assertSafeMinorAmount(amount); assertSafeMinorAmount(consumedAmount); }
  catch (error) { throw new ModuleError(ERROR_CODES.VALIDATION, error.message, {cause:error}); }
  if (amount <= 0) throw new ModuleError(ERROR_CODES.VALIDATION, "Custo precisa ser maior que zero.");
  if (consumedAmount < 0 || consumedAmount > amount) throw new ModuleError(ERROR_CODES.VALIDATION, "Custo consumido inválido.");
  return {localId:clean(localId), resourceId:clean(resourceId), mode, amount, consumedAmount};
}

export function upsertProjectCost(costs, cost) {
  const result = structuredClone(costs ?? []);
  const index = result.findIndex((entry) => entry.localId === cost.localId);
  if (index >= 0) result[index] = cost; else result.push(cost);
  return result;
}

export function removeProjectCost(costs, localId) {
  return (costs ?? []).filter((entry) => entry.localId !== localId);
}

export function advanceProjectWorkByTicks(work, ticks) {
  if (!Number.isInteger(ticks) || ticks < 0) throw new RangeError("ticks precisa ser inteiro não-negativo.");
  const required = BigInt(work.required);
  const completed = BigInt(work.completed);
  const rate = BigInt(work.rateAmount);
  const period = BigInt(work.periodTicks);
  const carry = BigInt(work.carry);
  if (completed >= required || ticks === 0) {
    return {completed:work.completed, carry: completed >= required ? 0 : work.carry, ticksUsed:0, didComplete:completed >= required};
  }
  const remaining = required - completed;
  const numeratorNeeded = remaining * period - carry;
  const ticksToComplete = ceilDivBigInt(numeratorNeeded, rate);
  const ticksUsedBig = BigInt(ticks) < ticksToComplete ? BigInt(ticks) : ticksToComplete;
  const accumulated = carry + rate * ticksUsedBig;
  const gained = accumulated / period;
  const remainder = accumulated % period;
  const nextCompletedBig = completed + gained >= required ? required : completed + gained;
  const didComplete = nextCompletedBig === required;
  return {
    completed:Number(nextCompletedBig),
    carry:didComplete ? 0 : Number(remainder),
    ticksUsed:Number(ticksUsedBig),
    didComplete
  };
}

export function cumulativeProgressiveDue(costAmount, workCompleted, workRequired) {
  if (workRequired <= 0) throw new RangeError("workRequired precisa ser positivo.");
  const due = (BigInt(costAmount) * BigInt(workCompleted)) / BigInt(workRequired);
  return Number(due);
}

export function progressiveDueNow(cost, work) {
  const cumulative = cumulativeProgressiveDue(cost.amount, work.completed, work.required);
  return Math.max(0, cumulative - cost.consumedAmount);
}

export function deriveProjectReservations(projectData, {projectUuid=null, projectName="Project"}={}) {
  if (!PROJECT_RESERVATION_STATUSES.includes(projectData.status)) return [];
  return (projectData.costs ?? [])
    .filter((cost) => cost.mode === "reserved")
    .map((cost) => ({
      resourceId:cost.resourceId,
      amount:Math.max(0, cost.amount - cost.consumedAmount),
      source:`Project: ${projectName}`,
      sourceUuid:projectUuid,
      costLocalId:cost.localId
    }))
    .filter((entry) => entry.amount > 0);
}

export function assessReservationCapacity({catalog, stocks, existingReservations, candidateReservations}) {
  const stockMap = new Map((stocks ?? []).map((s) => [s.resourceId, s.amount]));
  const resourceMap = new Map((catalog?.resources ?? []).map((r) => [r.id, r]));
  const reserved = new Map();
  for (const entry of [...(existingReservations ?? []), ...(candidateReservations ?? [])]) {
    reserved.set(entry.resourceId, (reserved.get(entry.resourceId) ?? 0) + entry.amount);
  }
  const shortages = [];
  for (const [resourceId, amount] of reserved) {
    const resource = resourceMap.get(resourceId);
    if (!resource) {
      shortages.push({resourceId, reserved:amount, stock:stockMap.get(resourceId) ?? 0, reason:"unknown-resource"});
      continue;
    }
    if (resource.allowNegative) continue;
    const stock = stockMap.get(resourceId) ?? 0;
    if (amount > stock) shortages.push({resourceId, reserved:amount, stock, reason:"insufficient-stock"});
  }
  return shortages;
}
