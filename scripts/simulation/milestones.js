/**
 * Detecção e cálculo de marcos temporais determinísticos (Milestones).
 */

export const MILESTONE_KINDS = {
  PROJECT_COMPLETION: "project_completion",
  RESOURCE_EXHAUSTION: "resource_exhaustion",
  PROJECT_BLOCKED: "project_blocked"
};

/**
 * Calcula em qual tick um projeto ativo concluiria seu trabalho.
 * Retorna o tick relativo (1..N) ou null se não concluir dentro do limite.
 */
export function calculateProjectCompletionTick(project, maxTicks) {
  if (project.status !== "active") return null;

  const workRequired = Number(project.work?.required ?? 0);
  const workCompleted = Number(project.work?.completed ?? 0);
  const rateAmount = Number(project.work?.rateAmount ?? 0);
  const periodTicks = Math.max(1, Number(project.work?.periodTicks ?? 1));
  const carry = Number(project.work?.carry ?? 0);

  const workRemaining = workRequired - workCompleted;
  if (workRemaining <= 0) return 0;
  if (rateAmount <= 0) return null;

  const neededNumerator = Math.max(0, (workRemaining * periodTicks) - carry);
  const tick = Math.ceil(neededNumerator / rateAmount);

  if (tick > 0 && tick <= maxTicks) {
    return tick;
  }

  return null;
}

/**
 * Coleta e ordena todos os marcos identificados no intervalo [1, deltaTicks].
 */
export function findMilestones({ snapshot, deltaTicks = 1 }) {
  const milestones = [];

  for (const project of snapshot.projects ?? []) {
    const compTick = calculateProjectCompletionTick(project, deltaTicks);
    if (compTick != null && compTick > 0) {
      milestones.push({
        tick: compTick,
        kind: MILESTONE_KINDS.PROJECT_COMPLETION,
        projectUuid: project.uuid,
        domainUuid: project.domainUuid,
        title: `Conclusão de Projeto: ${project.name}`,
        summary: `O projeto '${project.name}' atinge 100% do trabalho necessário no tick +${compTick}.`
      });
    }
  }

  // Ordena por tick crescente
  return milestones.sort((a, b) => a.tick - b.tick);
}
