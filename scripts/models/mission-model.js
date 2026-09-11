import {
  MISSION_OBJECTIVE_STATUSES,
  MISSION_ORIGIN_KINDS,
  MISSION_STATUSES,
  RECORD_TYPES
} from "../core/constants.js";
import {
  assertUniqueEntityReferences,
  buildEntityId,
  normalizeEntityReference
} from "../core/entity-contracts.js";
import { entityReferenceSchema } from "./reference-fields.js";

const {
  ArrayField,
  BooleanField,
  NumberField,
  SchemaField,
  StringField
} = foundry.data.fields;

function nullableString() {
  return new StringField({ required: true, nullable: true, blank: false, initial: null });
}

function nullableNumber() {
  return new NumberField({ required: true, nullable: true, initial: null });
}

function objectiveSchema() {
  return new SchemaField({
    localId: new StringField({ required: true, nullable: false, blank: false }),
    title: new StringField({ required: true, nullable: false, blank: false }),
    description: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
    status: new StringField({ required: true, nullable: false, blank: false, choices: MISSION_OBJECTIVE_STATUSES, initial: "pending" }),
    optional: new BooleanField({ required: true, nullable: false, initial: false })
  });
}

function committedResourceSchema() {
  return new SchemaField({
    resourceId: new StringField({ required: true, nullable: false, blank: false }),
    amount: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
  });
}

function assignmentResultSchema() {
  return new SchemaField({
    casualties: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
    moraleDelta: new NumberField({ required: true, nullable: false, integer: true, min: -100, max: 100, initial: 0 }),
    conditionDelta: new NumberField({ required: true, nullable: false, integer: true, min: -100, max: 100, initial: 0 }),
    notes: new StringField({ required: true, nullable: false, blank: true, initial: "" })
  });
}

function assignmentSchema() {
  return new SchemaField({
    localId: new StringField({ required: true, nullable: false, blank: false, initial: () => foundry.utils.randomID() }),
    squad: entityReferenceSchema({ allowedTypes: [RECORD_TYPES.SQUAD] }),
    committedStrength: new NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 }),
    resources: new ArrayField(committedResourceSchema(), { required: true, nullable: false, initial: [] }),
    state: new StringField({ required: true, nullable: false, blank: false, choices: ["prepared", "deployed", "returned"], initial: "prepared" }),
    result: assignmentResultSchema()
  });
}

export class MissionModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      entityId: new StringField({
        required: true, nullable: false, blank: false,
        initial: () => buildEntityId(RECORD_TYPES.MISSION)
      }),
      primaryDomainUuid: new StringField({ required: true, nullable: false, blank: false }),
      relatedDomainUuids: new ArrayField(
        new StringField({ required: true, nullable: false, blank: false }),
        { required: true, nullable: false, initial: [] }
      ),
      origin: new SchemaField({
        kind: new StringField({ required: true, nullable: false, blank: false, choices: MISSION_ORIGIN_KINDS, initial: "manual" }),
        uuid: nullableString()
      }),
      status: new StringField({ required: true, nullable: false, blank: false, choices: MISSION_STATUSES, initial: "planned" }),
      briefing: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
      audienceUserIds: new ArrayField(
        new StringField({ required: true, nullable: false, blank: false }),
        { required: true, nullable: false, initial: [] }
      ),
      objectives: new ArrayField(objectiveSchema(), { required: true, nullable: false, initial: [] }),
      assignments: new ArrayField(assignmentSchema(), { required: true, nullable: false, initial: [] }),
      startedAtWorldTime: nullableNumber(),
      resolvedAtWorldTime: nullableNumber(),
      outcomeSummary: new StringField({ required: true, nullable: false, blank: true, initial: "" })
    };
  }

  static validateJoint(data) {
    const related = data?.relatedDomainUuids ?? [];
    if (new Set(related).size !== related.length) throw new Error("Mission.relatedDomainUuids contém duplicatas.");
    if (related.includes(data?.primaryDomainUuid)) throw new Error("primaryDomainUuid não deve ser repetido em relatedDomainUuids.");

    const audience = data?.audienceUserIds ?? [];
    if (new Set(audience).size !== audience.length) throw new Error("Mission.audienceUserIds contém duplicatas.");

    const objectives = data?.objectives ?? [];
    const objectiveIds = objectives.map((objective) => objective.localId);
    if (new Set(objectiveIds).size !== objectiveIds.length) throw new Error("Mission.objectives contém localId duplicado.");

    const origin = data?.origin ?? {};
    if (origin.kind === "manual" && origin.uuid) throw new Error("Mission manual não deve possuir origin.uuid.");
    if (origin.kind !== "manual" && !origin.uuid) throw new Error("Mission originada exige origin.uuid.");

    const assignments = data?.assignments ?? [];
    const assignmentIds = assignments.map((assignment) => assignment.localId);
    if (new Set(assignmentIds).size !== assignmentIds.length) throw new Error("Mission.assignments contém localId duplicado.");
    assertUniqueEntityReferences(assignments.map((assignment) => assignment.squad));

    for (const assignment of assignments) {
      normalizeEntityReference(assignment.squad, { allowedTypes: [RECORD_TYPES.SQUAD] });
      const resourceIds = (assignment.resources ?? []).map((resource) => resource.resourceId);
      if (new Set(resourceIds).size !== resourceIds.length) {
        throw new Error("Mission.assignments.resources contém resourceId duplicado.");
      }
      if ((assignment.result?.casualties ?? 0) > assignment.committedStrength) {
        throw new Error("Mission assignment casualties não pode exceder committedStrength.");
      }
    }
  }
}
