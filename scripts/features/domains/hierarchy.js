export function assertNoSelfReference(domainUuid, parentUuid, label) {
  if (!domainUuid || !parentUuid) return;
  if (domainUuid === parentUuid) {
    throw new Error(`${label} não pode apontar para o próprio Domain.`);
  }
}

export function wouldCreateCycle({
  domainUuid,
  candidateParentUuid,
  getParentUuid
}) {
  if (!domainUuid || !candidateParentUuid) return false;
  if (domainUuid === candidateParentUuid) return true;

  const visited = new Set();
  let cursor = candidateParentUuid;

  while (cursor) {
    if (cursor === domainUuid) return true;
    if (visited.has(cursor)) return true;

    visited.add(cursor);
    cursor = getParentUuid(cursor) ?? null;
  }

  return false;
}

export function buildAncestorChain({
  startUuid,
  getParentUuid,
  maxDepth = 100
}) {
  const result = [];
  const visited = new Set();
  let cursor = startUuid;

  while (cursor && result.length < maxDepth) {
    if (visited.has(cursor)) break;
    visited.add(cursor);
    result.push(cursor);
    cursor = getParentUuid(cursor) ?? null;
  }

  return result;
}
