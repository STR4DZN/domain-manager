import test from "node:test";
import assert from "node:assert/strict";

import {
  BACKUP_SCHEMA_VERSION,
  createWorldExportPayload
} from "../scripts/features/backup/export.js";
import {
  prepareImportedRecordData,
  validateImportPayload
} from "../scripts/features/backup/import.js";

test("backup v2 inclui novos tipos de entidade e preserva entityId", () => {
  const payload = createWorldExportPayload({
    domains: [{ uuid: "D1", name: "Base", data: { entityId: "domain:D1", history: [{ x: 1 }], intel: [{ x: 2 }] } }],
    squads: [{ uuid: "S1", name: "Raven", data: { entityId: "squad:S1" } }],
    people: [{ uuid: "P1", name: "Ana", data: { entityId: "person:P1" } }],
    structures: [{ uuid: "B1", name: "Hangar", data: { entityId: "structure:B1" } }],
    agreements: [{ uuid: "A1", name: "Pacto", data: { entityId: "agreement:A1" } }],
    options: { includeHistory: false, includeIntel: false }
  });

  assert.equal(payload.schemaVersion, BACKUP_SCHEMA_VERSION);
  assert.equal(payload.data.squads[0].data.entityId, "squad:S1");
  assert.equal(payload.data.people[0].data.entityId, "person:P1");
  assert.deepEqual(payload.data.domains[0].data.history, []);
  assert.deepEqual(payload.data.domains[0].data.intel, []);

  const validation = validateImportPayload(payload);
  assert.equal(validation.valid, true);
  assert.equal(validation.summary.domainCount, 1);
  assert.equal(validation.summary.squadCount, 1);
  assert.equal(validation.summary.personCount, 1);
  assert.equal(validation.summary.structureCount, 1);
  assert.equal(validation.summary.agreementCount, 1);
});

test("importador continua aceitando backup v1 legado", () => {
  const validation = validateImportPayload({
    schemaVersion: 1,
    moduleVersion: "0.1.0-dev.128",
    data: {
      catalog: { version: 1, resources: [] },
      domains: [],
      projects: [],
      requests: [],
      missions: []
    }
  });
  assert.equal(validation.valid, true);
  assert.equal(validation.summary.squadCount, 0);
});

test("importador rejeita versão futura de backup", () => {
  const validation = validateImportPayload({ schemaVersion: BACKUP_SCHEMA_VERSION + 1, data: {} });
  assert.equal(validation.valid, false);
});


test("backup legado herda entityId existente sem sobrescrever identidade moderna", () => {
  assert.deepEqual(
    prepareImportedRecordData({ description: "legado" }, "domain:stable"),
    { description: "legado", entityId: "domain:stable" }
  );
  assert.deepEqual(
    prepareImportedRecordData({ entityId: "domain:incoming", description: "moderno" }, "domain:stable"),
    { entityId: "domain:incoming", description: "moderno" }
  );
});
