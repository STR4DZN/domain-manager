import {
  MISSION_OBJECTIVE_STATUSES,
  MISSION_ORIGIN_KINDS,
  MISSION_STATUSES
} from "../core/constants.js";

const {
  ArrayField,
  BooleanField,
  SchemaField,
  StringField
} = foundry.data.fields;

function nullableString() {
  return new StringField({
    required: true,
    nullable: true,
    blank: false,
    initial: null
  });
}

function objectiveSchema() {
  return new SchemaField({
    localId: new StringField({
      required: true,
      nullable: false,
      blank: false
    }),

    title: new StringField({
      required: true,
      nullable: false,
      blank: false
    }),

    description: new StringField({
      required: true,
      nullable: false,
      blank: true,
      initial: ""
    }),

    status: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: MISSION_OBJECTIVE_STATUSES,
      initial: "pending"
    }),

    optional: new BooleanField({
      required: true,
      nullable: false,
      initial: false
    })
  });
}

export class MissionModel
  extends foundry.abstract.DataModel {

  static defineSchema() {
    return {
      primaryDomainUuid: new StringField({
        required: true,
        nullable: false,
        blank: false
      }),

      relatedDomainUuids: new ArrayField(
        new StringField({
          required: true,
          nullable: false,
          blank: false
        }),
        {
          required: true,
          nullable: false,
          initial: []
        }
      ),

      origin: new SchemaField({
        kind: new StringField({
          required: true,
          nullable: false,
          blank: false,
          choices: MISSION_ORIGIN_KINDS,
          initial: "manual"
        }),
        uuid: nullableString()
      }),

      status: new StringField({
        required: true,
        nullable: false,
        blank: false,
        choices: MISSION_STATUSES,
        initial: "planned"
      }),

      briefing: new StringField({
        required: true,
        nullable: false,
        blank: true,
        initial: ""
      }),

      audienceUserIds: new ArrayField(
        new StringField({
          required: true,
          nullable: false,
          blank: false
        }),
        {
          required: true,
          nullable: false,
          initial: []
        }
      ),

      objectives: new ArrayField(
        objectiveSchema(),
        {
          required: true,
          nullable: false,
          initial: []
        }
      ),

      outcomeSummary: new StringField({
        required: true,
        nullable: false,
        blank: true,
        initial: ""
      })
    };
  }

  static validateJoint(data) {
    const related = data?.relatedDomainUuids ?? [];
    if (new Set(related).size !== related.length) {
      throw new Error(
        "Mission.relatedDomainUuids contém duplicatas."
      );
    }
    if (related.includes(data?.primaryDomainUuid)) {
      throw new Error(
        "primaryDomainUuid não deve ser repetido em relatedDomainUuids."
      );
    }

    const audience = data?.audienceUserIds ?? [];
    if (new Set(audience).size !== audience.length) {
      throw new Error(
        "Mission.audienceUserIds contém duplicatas."
      );
    }

    const objectives = data?.objectives ?? [];
    const ids = objectives.map(
      (objective) => objective.localId
    );
    if (new Set(ids).size !== ids.length) {
      throw new Error(
        "Mission.objectives contém localId duplicado."
      );
    }

    const origin = data?.origin ?? {};
    if (origin.kind === "manual" && origin.uuid) {
      throw new Error(
        "Mission manual não deve possuir origin.uuid."
      );
    }
    if (origin.kind !== "manual" && !origin.uuid) {
      throw new Error(
        "Mission originada exige origin.uuid."
      );
    }
  }
}
