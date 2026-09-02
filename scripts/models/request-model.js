import {
  REQUEST_HANDLINGS,
  REQUEST_STATUSES,
  REQUEST_TYPES
} from "../core/constants.js";

const {
  ArrayField,
  NumberField,
  SchemaField,
  StringField
} = foundry.data.fields;

function nullableStringField() {
  return new StringField({
    required: true,
    nullable: true,
    blank: false,
    initial: null
  });
}

function historyEntrySchema() {
  return new SchemaField({
    kind: new StringField({
      required: true,
      nullable: false,
      blank: false
    }),

    summary: new StringField({
      required: true,
      nullable: false,
      blank: false
    }),

    userUuid: nullableStringField(),

    tick: new NumberField({
      required: true,
      nullable: true,
      integer: true,
      initial: null
    })
  });
}

export class RequestModel
  extends foundry.abstract.DataModel {

  static defineSchema() {
    return {
      operationId: new StringField({
        required: true,
        nullable: false,
        blank: false
      }),

      type: new StringField({
        required: true,
        nullable: false,
        blank: false,
        choices: REQUEST_TYPES
      }),

      status: new StringField({
        required: true,
        nullable: false,
        blank: false,
        choices: REQUEST_STATUSES,
        initial: "submitted"
      }),

      requesterUserUuid: new StringField({
        required: true,
        nullable: false,
        blank: false
      }),

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

      intent: new StringField({
        required: true,
        nullable: false,
        blank: false
      }),

      proposal: new SchemaField({
        title: new StringField({
          required: true,
          nullable: false,
          blank: false
        }),

        details: new StringField({
          required: true,
          nullable: false,
          blank: true,
          initial: ""
        })
      }),

      gmDecision: new SchemaField({
        summary: new StringField({
          required: true,
          nullable: false,
          blank: true,
          initial: ""
        }),

        handling: new StringField({
          required: true,
          nullable: false,
          blank: false,
          choices: REQUEST_HANDLINGS,
          initial: "none"
        }),

        decidedByUserUuid: nullableStringField()
      }),

      resultUuid: nullableStringField(),

      history: new ArrayField(
        historyEntrySchema(),
        {
          required: true,
          nullable: false,
          initial: []
        }
      )
    };
  }

  static validateJoint(data) {
    const related =
      data?.relatedDomainUuids ?? [];

    if (new Set(related).size !== related.length) {
      throw new Error(
        "Request.relatedDomainUuids contém UUIDs duplicados."
      );
    }

    if (
      related.includes(data?.primaryDomainUuid)
    ) {
      throw new Error(
        "primaryDomainUuid não deve ser duplicado em relatedDomainUuids."
      );
    }
  }
}
