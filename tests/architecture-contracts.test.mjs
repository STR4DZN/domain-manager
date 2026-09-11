import test from "node:test";
import assert from "node:assert/strict";

class DummyField {
  constructor(options = {}, extra = {}) {
    this.options = options;
    this.extra = extra;
  }
}
class DummyDataModel {}

globalThis.foundry = {
  abstract: { DataModel: DummyDataModel },
  data: {
    fields: {
      ArrayField: DummyField,
      BooleanField: DummyField,
      NumberField: DummyField,
      SchemaField: DummyField,
      StringField: DummyField
    }
  },
  utils: { randomID: () => "RANDOM" }
};

const { SquadModel } = await import("../scripts/models/squad-model.js");
const { PersonModel } = await import("../scripts/models/person-model.js");
const { StructureModel } = await import("../scripts/models/structure-model.js");
const { AgreementModel } = await import("../scripts/models/agreement-model.js");
const { ResourceModel } = await import("../scripts/models/resource-model.js");

test("Squad contract impede efetivo/composição acima dos limites", () => {
  assert.throws(() => SquadModel.validateJoint({
    capacity: 10,
    strength: 11,
    composition: [],
    resources: [],
    equipment: [],
    notablePeople: [],
    governance: { controllers: [] },
    tags: []
  }), /strength/i);

  assert.throws(() => SquadModel.validateJoint({
    capacity: 10,
    strength: 5,
    composition: [{ localId: "c1", role: "Infantry", count: 6 }],
    resources: [],
    equipment: [],
    notablePeople: [],
    governance: { controllers: [] },
    tags: []
  }), /composição/i);
});

test("Structure contract impede tier acima de maxTier e recursos duplicados", () => {
  assert.throws(() => StructureModel.validateJoint({
    domain: { recordType: "domain", entityId: "domain:D1", uuid: null },
    tier: 3,
    maxTier: 2,
    maintenance: [],
    production: [],
    tags: []
  }), /tier/i);

  assert.throws(() => StructureModel.validateJoint({
    domain: { recordType: "domain", entityId: "domain:D1", uuid: null },
    tier: 1,
    maxTier: 2,
    maintenance: [
      { resourceId: "credits", amount: 10 },
      { resourceId: "credits", amount: 20 }
    ],
    production: [],
    tags: []
  }), /duplicado/i);
});

test("Agreement contract exige partes válidas e transferências internas ao acordo", () => {
  assert.throws(() => AgreementModel.validateJoint({
    parties: [{ recordType: "domain", entityId: "domain:D1", uuid: null }],
    transfers: [],
    tags: []
  }), /pelo menos dois/i);

  assert.throws(() => AgreementModel.validateJoint({
    parties: [
      { recordType: "domain", entityId: "domain:D1", uuid: null },
      { recordType: "domain", entityId: "domain:D2", uuid: null }
    ],
    transfers: [{
      localId: "t1",
      fromDomain: { recordType: "domain", entityId: "domain:D1", uuid: null },
      toDomain: { recordType: "domain", entityId: "domain:D3", uuid: null },
      periodTicks: 1,
      carry: 0
    }],
    tags: []
  }), /participantes/i);
});

test("Person contract impede tags duplicadas", () => {
  assert.throws(() => PersonModel.validateJoint({ tags: ["pilot", "pilot"] }), /duplicados/i);
});


test("Resource contract usa id imutável/slug como identidade e impede tags duplicadas", () => {
  assert.throws(() => ResourceModel.validateJoint({ id: "Heavy Ammo", tags: [] }), /Resource.id/i);
  assert.throws(() => ResourceModel.validateJoint({ id: "heavy-ammo", tags: ["ammo", "ammo"] }), /duplicados/i);
  assert.doesNotThrow(() => ResourceModel.validateJoint({ id: "heavy-ammo", tags: ["ammo"] }));
});
