import { RECORD_TYPES } from "../core/constants.js";

const { SchemaField, StringField } = foundry.data.fields;

export function entityReferenceSchema({
  allowedTypes = Object.values(RECORD_TYPES),
  nullable = false
} = {}) {
  return new SchemaField({
    recordType: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: allowedTypes
    }),
    uuid: new StringField({
      required: true,
      nullable: true,
      blank: false,
      initial: null
    }),
    entityId: new StringField({
      required: true,
      nullable: true,
      blank: false,
      initial: null
    })
  }, {
    required: true,
    nullable,
    initial: nullable ? null : undefined
  });
}
