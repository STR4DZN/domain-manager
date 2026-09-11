import { ECONOMY_LIMITS } from "../core/constants.js";

const {
  ArrayField,
  BooleanField,
  NumberField,
  StringField
} = foundry.data.fields;

export class ResourceModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      id: new StringField({ required: true, nullable: false, blank: false }),
      name: new StringField({ required: true, nullable: false, blank: false }),
      unit: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
      precision: new NumberField({
        required: true,
        nullable: false,
        integer: true,
        min: 0,
        max: ECONOMY_LIMITS.MAX_PRECISION,
        initial: 0
      }),
      allowNegative: new BooleanField({ required: true, nullable: false, initial: false }),
      category: new StringField({ required: true, nullable: false, blank: false, initial: "general" }),
      tags: new ArrayField(
        new StringField({ required: true, nullable: false, blank: false }),
        { required: true, nullable: false, initial: [] }
      )
    };
  }

  static validateJoint(data) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(data?.id ?? ""))) {
      throw new Error("Resource.id deve usar apenas letras minúsculas, números e hífens.");
    }
    const tags = data?.tags ?? [];
    if (new Set(tags).size !== tags.length) {
      throw new Error("Resource.tags contém valores duplicados.");
    }
  }
}
