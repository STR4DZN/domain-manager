import {
  ECONOMY_LIMITS,
  RECORD_TYPES,
  SQUAD_STATUSES
} from "../core/constants.js";
import {
  assertUniqueEntityReferences,
  buildEntityId,
  normalizeEntityReference
} from "../core/entity-contracts.js";
import { entityReferenceSchema } from "./reference-fields.js";

const {
  ArrayField,
  NumberField,
  SchemaField,
  StringField
} = foundry.data.fields;

function stockSchema() {
  return new SchemaField({
    resourceId: new StringField({ required: true, nullable: false, blank: false }),
    amount: new NumberField({
      required: true,
      nullable: false,
      integer: true,
      min: -ECONOMY_LIMITS.MAX_MINOR_AMOUNT,
      max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT,
      initial: 0
    })
  });
}

function compositionSchema() {
  return new SchemaField({
    localId: new StringField({
      required: true, nullable: false, blank: false,
      initial: () => foundry.utils.randomID()
    }),
    role: new StringField({ required: true, nullable: false, blank: false }),
    count: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
    notes: new StringField({ required: true, nullable: false, blank: true, initial: "" })
  });
}

function equipmentSchema() {
  return new SchemaField({
    localId: new StringField({
      required: true, nullable: false, blank: false,
      initial: () => foundry.utils.randomID()
    }),
    name: new StringField({ required: true, nullable: false, blank: false }),
    quantity: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 1 }),
    notes: new StringField({ required: true, nullable: false, blank: true, initial: "" })
  });
}

export class SquadModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      entityId: new StringField({
        required: true, nullable: false, blank: false,
        initial: () => buildEntityId(RECORD_TYPES.SQUAD)
      }),
      description: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
      parentDomain: entityReferenceSchema({ allowedTypes: [RECORD_TYPES.DOMAIN], nullable: true }),
      governance: new SchemaField({
        controllers: new ArrayField(
          new StringField({ required: true, nullable: false, blank: false }),
          { required: true, nullable: false, initial: [] }
        )
      }),
      status: new StringField({
        required: true,
        nullable: false,
        blank: false,
        choices: SQUAD_STATUSES,
        initial: "forming"
      }),
      capacity: new NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 }),
      strength: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      morale: new NumberField({ required: true, nullable: false, integer: true, min: 0, max: 100, initial: 50 }),
      condition: new NumberField({ required: true, nullable: false, integer: true, min: 0, max: 100, initial: 100 }),
      composition: new ArrayField(compositionSchema(), { required: true, nullable: false, initial: [] }),
      resources: new ArrayField(stockSchema(), { required: true, nullable: false, initial: [] }),
      equipment: new ArrayField(equipmentSchema(), { required: true, nullable: false, initial: [] }),
      notablePeople: new ArrayField(
        entityReferenceSchema({ allowedTypes: [RECORD_TYPES.PERSON] }),
        { required: true, nullable: false, initial: [] }
      ),
      currentMission: entityReferenceSchema({ allowedTypes: [RECORD_TYPES.MISSION], nullable: true }),
      tags: new ArrayField(
        new StringField({ required: true, nullable: false, blank: false }),
        { required: true, nullable: false, initial: [] }
      )
    };
  }

  static validateJoint(data) {
    if (data?.strength > data?.capacity) {
      throw new Error("Squad.strength não pode exceder capacity.");
    }

    if (data?.parentDomain) {
      normalizeEntityReference(data.parentDomain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
    }
    if (data?.currentMission) {
      normalizeEntityReference(data.currentMission, { allowedTypes: [RECORD_TYPES.MISSION] });
    }
    assertUniqueEntityReferences(data?.notablePeople ?? []);
    for (const ref of data?.notablePeople ?? []) {
      normalizeEntityReference(ref, { allowedTypes: [RECORD_TYPES.PERSON] });
    }

    const composition = data?.composition ?? [];
    const compositionIds = composition.map((entry) => entry.localId);
    if (new Set(compositionIds).size !== compositionIds.length) {
      throw new Error("Squad.composition contém localId duplicado.");
    }
    const compositionCount = composition.reduce((sum, entry) => sum + Number(entry.count ?? 0), 0);
    if (compositionCount > Number(data?.strength ?? 0)) {
      throw new Error("A composição do Squad não pode exceder o efetivo atual.");
    }

    const resourceIds = (data?.resources ?? []).map((entry) => entry.resourceId);
    if (new Set(resourceIds).size !== resourceIds.length) {
      throw new Error("Squad.resources contém resourceId duplicado.");
    }

    const equipmentIds = (data?.equipment ?? []).map((entry) => entry.localId);
    if (new Set(equipmentIds).size !== equipmentIds.length) {
      throw new Error("Squad.equipment contém localId duplicado.");
    }

    const controllers = data?.governance?.controllers ?? [];
    if (new Set(controllers).size !== controllers.length) {
      throw new Error("Squad.governance.controllers contém IDs duplicados.");
    }

    const tags = data?.tags ?? [];
    if (new Set(tags).size !== tags.length) {
      throw new Error("Squad.tags contém valores duplicados.");
    }
  }
}
