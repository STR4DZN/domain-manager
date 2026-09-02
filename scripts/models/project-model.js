import {
  ECONOMY_LIMITS,
  PROJECT_COST_MODES,
  PROJECT_STATUSES
} from "../core/constants.js";

const {
  ArrayField,
  NumberField,
  SchemaField,
  StringField
} = foundry.data.fields;

function nullableUuidField() {
  return new StringField({
    required: true,
    nullable: true,
    blank: false,
    initial: null
  });
}

function costSchema() {
  return new SchemaField({
    localId: new StringField({required:true, nullable:false, blank:false}),
    resourceId: new StringField({required:true, nullable:false, blank:false}),
    mode: new StringField({required:true, nullable:false, blank:false, choices:PROJECT_COST_MODES}),
    amount: new NumberField({required:true, nullable:false, integer:true, min:1, max:ECONOMY_LIMITS.MAX_MINOR_AMOUNT}),
    consumedAmount: new NumberField({required:true, nullable:false, integer:true, min:0, max:ECONOMY_LIMITS.MAX_MINOR_AMOUNT, initial:0})
  });
}

export class ProjectModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      domainUuid: new StringField({required:true, nullable:false, blank:false}),
      originRequestUuid: nullableUuidField(),
      description: new StringField({required:true, nullable:false, blank:true, initial:""}),
      status: new StringField({required:true, nullable:false, blank:false, choices:PROJECT_STATUSES, initial:"planned"}),
      blockedReason: new StringField({required:true, nullable:false, blank:true, initial:""}),
      work: new SchemaField({
        required: new NumberField({required:true, nullable:false, integer:true, min:1, max:ECONOMY_LIMITS.MAX_MINOR_AMOUNT}),
        completed: new NumberField({required:true, nullable:false, integer:true, min:0, max:ECONOMY_LIMITS.MAX_MINOR_AMOUNT, initial:0}),
        rateAmount: new NumberField({required:true, nullable:false, integer:true, min:1, max:ECONOMY_LIMITS.MAX_MINOR_AMOUNT, initial:1}),
        periodTicks: new NumberField({required:true, nullable:false, integer:true, min:1, max:ECONOMY_LIMITS.MAX_PERIOD_TICKS, initial:1}),
        carry: new NumberField({required:true, nullable:false, integer:true, min:0, initial:0})
      }),
      costs: new ArrayField(costSchema(), {required:true, nullable:false, initial:[]})
    };
  }

  static validateJoint(data) {
    const work = data?.work ?? {};
    if (work.completed > work.required) {
      throw new Error("Project.work.completed não pode exceder required.");
    }
    if (work.carry >= work.periodTicks) {
      throw new Error("Project.work.carry precisa ser menor que periodTicks.");
    }
    if (data?.status === "completed" && work.completed !== work.required) {
      throw new Error("Project completed exige trabalho exatamente concluído.");
    }
    const costs = data?.costs ?? [];
    const ids = costs.map((cost) => cost.localId);
    if (new Set(ids).size !== ids.length) {
      throw new Error("Project.costs contém localId duplicado.");
    }
    for (const cost of costs) {
      if (cost.consumedAmount > cost.amount) {
        throw new Error("Project cost consumedAmount excede amount.");
      }
    }
  }
}
