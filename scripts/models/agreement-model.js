import {
  AGREEMENT_STATUSES,
  ECONOMY_LIMITS,
  RECORD_TYPES
} from "../core/constants.js";
import {
  assertUniqueEntityReferences,
  buildEntityId,
  entityReferenceKeys,
  normalizeEntityReference
} from "../core/entity-contracts.js";
import { entityReferenceSchema } from "./reference-fields.js";

const {
  ArrayField,
  NumberField,
  SchemaField,
  StringField
} = foundry.data.fields;

function nullableTickField() {
  return new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null });
}

function transferSchema() {
  return new SchemaField({
    localId: new StringField({
      required: true, nullable: false, blank: false,
      initial: () => foundry.utils.randomID()
    }),
    resourceId: new StringField({ required: true, nullable: false, blank: false }),
    fromDomain: entityReferenceSchema({ allowedTypes: [RECORD_TYPES.DOMAIN] }),
    toDomain: entityReferenceSchema({ allowedTypes: [RECORD_TYPES.DOMAIN] }),
    amount: new NumberField({
      required: true,
      nullable: false,
      integer: true,
      min: 0,
      max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT,
      initial: 0
    }),
    periodTicks: new NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 }),
    carry: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
  });
}


export class AgreementModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      entityId: new StringField({
        required: true, nullable: false, blank: false,
        initial: () => buildEntityId(RECORD_TYPES.AGREEMENT)
      }),
      description: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
      parties: new ArrayField(
        entityReferenceSchema({ allowedTypes: [RECORD_TYPES.DOMAIN] }),
        { required: true, nullable: false, initial: [] }
      ),
      type: new StringField({ required: true, nullable: false, blank: false, initial: "custom" }),
      status: new StringField({
        required: true,
        nullable: false,
        blank: false,
        choices: AGREEMENT_STATUSES,
        initial: "draft"
      }),
      startTick: nullableTickField(),
      endTick: nullableTickField(),
      transfers: new ArrayField(transferSchema(), { required: true, nullable: false, initial: [] }),
      tags: new ArrayField(
        new StringField({ required: true, nullable: false, blank: false }),
        { required: true, nullable: false, initial: [] }
      )
    };
  }

  static validateJoint(data) {
    const parties = data?.parties ?? [];
    if (parties.length < 2) {
      throw new Error("Agreement exige pelo menos dois Domains participantes.");
    }
    assertUniqueEntityReferences(parties);
    const partyKeys = new Set(parties.flatMap((reference) => {
      normalizeEntityReference(reference, { allowedTypes: [RECORD_TYPES.DOMAIN] });
      return entityReferenceKeys(reference);
    }));

    if (data?.startTick != null && data?.endTick != null && data.endTick < data.startTick) {
      throw new Error("Agreement.endTick não pode ser anterior a startTick.");
    }

    const transferIds = (data?.transfers ?? []).map((entry) => entry.localId);
    if (new Set(transferIds).size !== transferIds.length) {
      throw new Error("Agreement.transfers contém localId duplicado.");
    }

    for (const transfer of data?.transfers ?? []) {
      normalizeEntityReference(transfer.fromDomain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
      normalizeEntityReference(transfer.toDomain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
      const fromKeys = entityReferenceKeys(transfer.fromDomain);
      const toKeys = entityReferenceKeys(transfer.toDomain);
      if (fromKeys.some((key) => toKeys.includes(key))) {
        throw new Error("Agreement transfer não pode enviar para o mesmo Domain de origem.");
      }
      if (!fromKeys.some((key) => partyKeys.has(key)) || !toKeys.some((key) => partyKeys.has(key))) {
        throw new Error("Agreement transfer precisa usar Domains participantes do acordo.");
      }
      if (transfer.carry >= transfer.periodTicks) {
        throw new Error("Agreement transfer carry precisa ser menor que periodTicks.");
      }
    }

    const tags = data?.tags ?? [];
    if (new Set(tags).size !== tags.length) {
      throw new Error("Agreement.tags contém valores duplicados.");
    }
  }
}
