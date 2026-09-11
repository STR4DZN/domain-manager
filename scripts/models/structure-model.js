import {
  ECONOMY_LIMITS,
  RECORD_TYPES,
  STRUCTURE_STATUSES
} from "../core/constants.js";
import {
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

function resourceAmountSchema() {
  return new SchemaField({
    resourceId: new StringField({ required: true, nullable: false, blank: false }),
    amount: new NumberField({
      required: true,
      nullable: false,
      integer: true,
      min: 0,
      max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT,
      initial: 0
    })
  });
}

export class StructureModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      entityId: new StringField({
        required: true, nullable: false, blank: false,
        initial: () => buildEntityId(RECORD_TYPES.STRUCTURE)
      }),
      domain: entityReferenceSchema({ allowedTypes: [RECORD_TYPES.DOMAIN] }),
      activeProject: entityReferenceSchema({ allowedTypes: [RECORD_TYPES.PROJECT], nullable: true }),
      description: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
      category: new StringField({ required: true, nullable: false, blank: false, initial: "general" }),
      tier: new NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 }),
      maxTier: new NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 }),
      status: new StringField({
        required: true,
        nullable: false,
        blank: false,
        choices: STRUCTURE_STATUSES,
        initial: "planned"
      }),
      condition: new NumberField({ required: true, nullable: false, integer: true, min: 0, max: 100, initial: 100 }),
      capacity: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      maintenancePriority: new NumberField({ required: true, nullable: false, integer: true, min: 0, max: 100, initial: 50 }),
      workforceRequired: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      maintenance: new ArrayField(resourceAmountSchema(), { required: true, nullable: false, initial: [] }),
      production: new ArrayField(resourceAmountSchema(), { required: true, nullable: false, initial: [] }),
      tags: new ArrayField(
        new StringField({ required: true, nullable: false, blank: false }),
        { required: true, nullable: false, initial: [] }
      )
    };
  }

  static validateJoint(data) {
    normalizeEntityReference(data?.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
    if (data?.activeProject != null) {
      normalizeEntityReference(data.activeProject, { allowedTypes: [RECORD_TYPES.PROJECT] });
    }

    if (Number(data?.tier ?? 1) > Number(data?.maxTier ?? 1)) {
      throw new Error("Structure.tier não pode exceder maxTier.");
    }

    for (const key of ["maintenance", "production"]) {
      const ids = (data?.[key] ?? []).map((entry) => entry.resourceId);
      if (new Set(ids).size !== ids.length) {
        throw new Error(`Structure.${key} contém resourceId duplicado.`);
      }
    }

    const tags = data?.tags ?? [];
    if (new Set(tags).size !== tags.length) {
      throw new Error("Structure.tags contém valores duplicados.");
    }
  }
}
