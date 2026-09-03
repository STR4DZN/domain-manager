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
      name: new StringField({required:false, nullable:false, blank:true, initial:""}),
      description: new StringField({required:true, nullable:false, blank:true, initial:""}),
      image: new StringField({required:false, nullable:true, blank:true, initial:""}),
      imageFit: new StringField({required:false, nullable:false, initial:"cover"}),
      imageHeight: new NumberField({required:false, nullable:false, initial:180}),
      imagePosX: new NumberField({required:false, nullable:false, initial:50}),
      imagePosY: new NumberField({required:false, nullable:false, initial:50}),
      imageZoom: new NumberField({required:false, nullable:false, initial:100}),
      tier: new NumberField({required:false, nullable:false, initial:1}),
      maxTier: new NumberField({required:false, nullable:false, initial:3}),
      category: new StringField({required:false, nullable:false, initial:"infraestrutura"}),
      modifiers: new SchemaField({
        defenseBonus: new NumberField({required:false, nullable:false, initial:0}),
        incomeBonus: new NumberField({required:false, nullable:false, initial:0}),
        unrestReduction: new NumberField({required:false, nullable:false, initial:0}),
        populationBonus: new NumberField({required:false, nullable:false, initial:0})
      }, {required:false, nullable:false, initial:{defenseBonus:0, incomeBonus:0, unrestReduction:0, populationBonus:0}}),
      rate: new SchemaField({
        amount: new NumberField({required:false, nullable:false, initial:10})
      }, {required:false, nullable:true, initial:null}),
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
