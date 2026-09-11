import {
  PERSON_STATUSES,
  RECORD_TYPES
} from "../core/constants.js";
import {
  buildEntityId,
  normalizeEntityReference
} from "../core/entity-contracts.js";
import { entityReferenceSchema } from "./reference-fields.js";

const { ArrayField, NumberField, StringField } = foundry.data.fields;

function nullableUuidField() {
  return new StringField({ required: true, nullable: true, blank: false, initial: null });
}

export class PersonModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      entityId: new StringField({
        required: true, nullable: false, blank: false,
        initial: () => buildEntityId(RECORD_TYPES.PERSON)
      }),
      description: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
      portrait: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
      actorUuid: nullableUuidField(),
      primaryDomain: entityReferenceSchema({ allowedTypes: [RECORD_TYPES.DOMAIN], nullable: true }),
      squad: entityReferenceSchema({ allowedTypes: [RECORD_TYPES.SQUAD], nullable: true }),
      currentLocation: entityReferenceSchema({ allowedTypes: [RECORD_TYPES.DOMAIN], nullable: true }),
      role: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
      specialization: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
      morale: new NumberField({ required: true, nullable: false, integer: true, min: 0, max: 100, initial: 60 }),
      condition: new NumberField({ required: true, nullable: false, integer: true, min: 0, max: 100, initial: 100 }),
      status: new StringField({
        required: true,
        nullable: false,
        blank: false,
        choices: PERSON_STATUSES,
        initial: "active"
      }),
      tags: new ArrayField(
        new StringField({ required: true, nullable: false, blank: false }),
        { required: true, nullable: false, initial: [] }
      ),
      notes: new StringField({ required: true, nullable: false, blank: true, initial: "" })
    };
  }

  static validateJoint(data) {
    if (data?.primaryDomain) {
      normalizeEntityReference(data.primaryDomain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
    }
    if (data?.squad) {
      normalizeEntityReference(data.squad, { allowedTypes: [RECORD_TYPES.SQUAD] });
    }
    if (data?.currentLocation) {
      normalizeEntityReference(data.currentLocation, { allowedTypes: [RECORD_TYPES.DOMAIN] });
    }

    const tags = data?.tags ?? [];
    if (new Set(tags).size !== tags.length) {
      throw new Error("Person.tags contém valores duplicados.");
    }
  }
}
