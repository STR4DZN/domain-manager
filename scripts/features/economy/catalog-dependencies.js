import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";

const RECORD_TYPE_LABELS = Object.freeze({
  domain: "Domínio",
  project: "Projeto",
  mission: "Missão",
  squad: "Unidade",
  structure: "Estrutura",
  agreement: "Acordo",
  request: "Solicitação",
  person: "Pessoa"
});

function collectReferencePaths(value, resourceId, path = "data", paths = [], seen = new WeakSet()) {
  if (!value || typeof value !== "object") return paths;
  if (seen.has(value)) return paths;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectReferencePaths(entry, resourceId, `${path}[${index}]`, paths, seen));
    return paths;
  }

  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (key === "resourceId" && entry === resourceId) paths.push(nextPath);
    else collectReferencePaths(entry, resourceId, nextPath, paths, seen);
  }
  return paths;
}

export function buildResourceDependencyReport(resourceId) {
  const entries = [];
  for (const recordType of Object.values(RECORD_TYPES)) {
    for (const document of recordIndex.list(recordType)) {
      const record = decodeRecord(document);
      if (!record) continue;
      const paths = collectReferencePaths(record.data, resourceId);
      if (!paths.length) continue;
      entries.push({
        uuid: record.uuid,
        entityId: record.data.entityId,
        recordType,
        typeLabel: RECORD_TYPE_LABELS[recordType] ?? recordType,
        name: record.document?.name ?? record.data.entityId,
        paths
      });
    }
  }
  entries.sort((a, b) => a.typeLabel.localeCompare(b.typeLabel) || a.name.localeCompare(b.name));
  return { resourceId, total: entries.length, referenceCount: entries.reduce((sum, entry) => sum + entry.paths.length, 0), entries };
}
