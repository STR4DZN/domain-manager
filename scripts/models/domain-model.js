import {
  DOMAIN_NATURES,
  DOMAIN_STATES
} from "../core/constants.js";

const {
  ArrayField,
  BooleanField,
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


function stockSchema() {
  return new SchemaField({
    resourceId: new StringField({
      required: true,
      nullable: false,
      blank: false
    }),

    amount: new NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0
    })
  });
}

function flowSchema() {
  return new SchemaField({
    localId: new StringField({
      required: true,
      nullable: false,
      blank: false
    }),

    name: new StringField({
      required: true,
      nullable: false,
      blank: false
    }),

    resourceId: new StringField({
      required: true,
      nullable: false,
      blank: false
    }),

    direction: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: ["inflow", "outflow"]
    }),

    amount: new NumberField({
      required: true,
      nullable: false,
      integer: true,
      min: 0,
      initial: 0
    }),

    periodTicks: new NumberField({
      required: true,
      nullable: false,
      integer: true,
      min: 1,
      initial: 1
    }),

    category: new StringField({
      required: true,
      nullable: false,
      blank: false,
      initial: "manual"
    }),

    source: new StringField({
      required: true,
      nullable: false,
      blank: true,
      initial: ""
    }),

    active: new BooleanField({
      required: true,
      nullable: false,
      initial: true
    })
  });
}

function groupSchema() {
  return new SchemaField({
    localId: new StringField({required:true, nullable:false, blank:false}),
    name: new StringField({required:true, nullable:false, blank:false}),
    count: new NumberField({required:true, nullable:false, integer:true, min:0, initial:0}),
    includedInTotal: new BooleanField({required:true, nullable:false, initial:true}),
    function: new StringField({required:true, nullable:false, blank:true, initial:""}),
    quality: new StringField({required:true, nullable:false, blank:true, initial:""}),
    status: new StringField({required:true, nullable:false, blank:false, choices:["active","inactive","unavailable","disbanded"], initial:"active"}),
    assignment: new StringField({required:true, nullable:false, blank:true, initial:""})
  });
}

function notableSchema() {
  return new SchemaField({
    localId: new StringField({required:true, nullable:false, blank:false}),
    name: new StringField({required:true, nullable:false, blank:false}),
    actorUuid: new StringField({required:true, nullable:true, blank:false, initial:null}),
    portrait: new StringField({required:true, nullable:false, blank:true, initial:""}),
    portraitFit: new StringField({required:false, nullable:false, initial:"cover"}),
    portraitShape: new StringField({required:false, nullable:false, initial:"square"}),
    portraitPosX: new NumberField({required:false, nullable:false, initial:50}),
    portraitPosY: new NumberField({required:false, nullable:false, initial:50}),
    portraitZoom: new NumberField({required:false, nullable:false, initial:100}),
    function: new StringField({required:true, nullable:false, blank:true, initial:""}),
    specialization: new StringField({required:true, nullable:false, blank:true, initial:""}),
    role: new StringField({required:true, nullable:false, blank:true, initial:""}),
    description: new StringField({required:true, nullable:false, blank:true, initial:""}),
    currentLocationUuid: new StringField({required:true, nullable:true, blank:false, initial:null}),
    status: new StringField({required:true, nullable:false, blank:false, choices:["active","away","unavailable","missing","dead","retired"], initial:"active"}),
    assignment: new StringField({required:true, nullable:false, blank:true, initial:""})
  });
}

function conditionSchema() {
  return new SchemaField({
    localId: new StringField({
      required: true,
      nullable: false,
      blank: false
    }),
    name: new StringField({
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
    durationTicks: new NumberField({
      required: true,
      nullable: true,
      integer: true,
      min: 1,
      initial: null
    }),
    severity: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: ["minor", "moderate", "severe"],
      initial: "minor"
    }),
    category: new StringField({
      required: true,
      nullable: false,
      blank: false,
      initial: "environmental"
    }),
    active: new BooleanField({
      required: true,
      nullable: false,
      initial: true
    })
  });
}

function securitySchema() {
  return new SchemaField({
    defenseRating: new NumberField({
      required: true,
      nullable: false,
      integer: true,
      min: 0,
      initial: 0
    }),
    guardCount: new NumberField({
      required: true,
      nullable: false,
      integer: true,
      min: 0,
      initial: 0
    }),
    fortifications: new ArrayField(
      new StringField({ required: true, nullable: false, blank: false }),
      { required: true, nullable: false, initial: [] }
    )
  });
}

function relationSchema() {
  return new SchemaField({
    localId: new StringField({ required: true, nullable: false, blank: false }),
    targetDomainUuid: new StringField({ required: true, nullable: false, blank: false }),
    posture: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: ["allied", "friendly", "trade_partner", "neutral", "rival", "hostile", "overlord", "vassal"],
      initial: "neutral"
    }),
    notes: new StringField({ required: true, nullable: false, blank: true, initial: "" })
  });
}

function agreementTransferSchema() {
  return new SchemaField({
    resourceId: new StringField({ required: true, nullable: false, blank: false }),
    direction: new StringField({ required: true, nullable: false, blank: false, choices: ["send", "receive"], initial: "send" }),
    amountPerTick: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
  });
}

function agreementSchema() {
  return new SchemaField({
    localId: new StringField({ required: true, nullable: false, blank: false }),
    name: new StringField({ required: true, nullable: false, blank: false }),
    targetDomainUuid: new StringField({ required: true, nullable: false, blank: false }),
    type: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: ["tribute", "trade_pact", "defense_pact", "non_aggression", "custom"],
      initial: "trade_pact"
    }),
    transfers: new ArrayField(agreementTransferSchema(), { required: true, nullable: false, initial: [] }),
    durationTicks: new NumberField({ required: true, nullable: true, integer: true, min: 1, initial: null }),
    remainingTicks: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
    status: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: ["active", "suspended", "breached", "terminated"],
      initial: "active"
    }),
    notes: new StringField({ required: true, nullable: false, blank: true, initial: "" })
  });
}

function intelSchema() {
  return new SchemaField({
    localId: new StringField({ required: true, nullable: false, blank: false }),
    title: new StringField({ required: true, nullable: false, blank: false }),
    category: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: ["fact", "rumor", "secret", "clue", "lore"],
      initial: "fact"
    }),
    visibility: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: ["gm_only", "all_controllers", "public"],
      initial: "all_controllers"
    }),
    content: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
    credibility: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: ["confirmed", "likely", "doubtful", "false"],
      initial: "confirmed"
    }),
    source: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
    revealed: new BooleanField({ required: true, nullable: false, initial: false }),
    tags: new ArrayField(
      new StringField({ required: true, nullable: false, blank: false }),
      { required: true, nullable: false, initial: [] }
    )
  });
}

function historySchema() {
  return new SchemaField({
    localId: new StringField({ required: true, nullable: false, blank: false }),
    timestamp: new NumberField({ required: true, nullable: false, integer: true, initial: Date.now }),
    tick: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
    title: new StringField({ required: true, nullable: false, blank: false }),
    category: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: ["advance", "project", "mission", "relation", "condition", "crisis", "story", "custom"],
      initial: "story"
    }),
    summary: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
    details: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
    significance: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: ["minor", "major", "critical"],
      initial: "minor"
    }),
    visibility: new StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: ["all", "gm_only"],
      initial: "all"
    })
  });
}

function visualsSchema() {
  return new SchemaField({
    bannerImg: new StringField({
      required: false,
      nullable: true,
      initial: "icons/svg/village.svg"
    }),
    crestImg: new StringField({
      required: false,
      nullable: true,
      initial: "icons/svg/shield.svg"
    }),
    image: new StringField({
      required: false,
      nullable: true,
      initial: ""
    }),
    imageFit: new StringField({
      required: false,
      nullable: false,
      initial: "cover"
    }),
    imageHeight: new NumberField({
      required: false,
      nullable: false,
      initial: 200
    }),
    imagePosX: new NumberField({
      required: false,
      nullable: false,
      initial: 50
    }),
    imagePosY: new NumberField({
      required: false,
      nullable: false,
      initial: 50
    }),
    imageZoom: new NumberField({
      required: false,
      nullable: false,
      initial: 100
    }),
    imagePosition: new StringField({
      required: false,
      nullable: true,
      initial: "center"
    }),
    gallery: new ArrayField(
      new StringField({ required: false, nullable: false, blank: true }),
      { required: false, nullable: false, initial: [] }
    ),
    themeColorHex: new StringField({
      required: false,
      nullable: false,
      initial: "#f59e0b"
    })
  });
}
export class DomainModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      visuals: visualsSchema(),

      description: new StringField({
        required: true,
        nullable: false,
        blank: true,
        initial: ""
      }),

      identity: new SchemaField({
        category: new StringField({
          required: true,
          nullable: false,
          blank: false,
          initial: "Base"
        }),

        nature: new StringField({
          required: true,
          nullable: false,
          blank: false,
          choices: DOMAIN_NATURES,
          initial: "physical"
        }),

        state: new StringField({
          required: true,
          nullable: false,
          blank: false,
          choices: DOMAIN_STATES,
          initial: "active"
        }),

        tags: new ArrayField(
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
        crestMedia: new SchemaField({
          path: new StringField({ required: false, nullable: true, blank: true, initial: "" })
        }, { required: false, nullable: true, initial: null }),
      }),

      hierarchy: new SchemaField({
        locatedInUuid: nullableUuidField(),
        administrativeParentUuid: nullableUuidField()
      }),

      population: new SchemaField({
        total: new NumberField({required:true, nullable:false, integer:true, min:0, initial:0}),
        countMode: new StringField({required:true, nullable:false, blank:false, choices:["direct","inclusive"], initial:"direct"}),
        groups: new ArrayField(groupSchema(), {required:true, nullable:false, initial:[]}),
        notables: new ArrayField(notableSchema(), {required:true, nullable:false, initial:[]})
      }),

      economy: new SchemaField({
        sustenanceSettings: new SchemaField({
          enabled: new BooleanField({ required: false, nullable: false, initial: true }),
          foodPer100: new NumberField({ required: false, nullable: false, initial: 1.0 }),
          waterPer100: new NumberField({ required: false, nullable: false, initial: 1.0 }),
          guardUpkeep: new NumberField({ required: false, nullable: false, initial: 1.0 })
        }, { required: false, nullable: true, initial: null }),
        stocks: new ArrayField(
          stockSchema(),
          {
            required: true,
            nullable: false,
            initial: []
          }
        ),

        flows: new ArrayField(
          flowSchema(),
          {
            required: true,
            nullable: false,
            initial: []
          }
        )
      }),

      conditions: new ArrayField(
        conditionSchema(),
        {
          required: true,
          nullable: false,
          initial: []
        }
      ),

      security: securitySchema(),

      relations: new ArrayField(
        relationSchema(),
        {
          required: true,
          nullable: false,
          initial: []
        }
      ),

      agreements: new ArrayField(
        agreementSchema(),
        {
          required: true,
          nullable: false,
          initial: []
        }
      ),

      intel: new ArrayField(
        intelSchema(),
        {
          required: true,
          nullable: false,
          initial: []
        }
      ),

      history: new ArrayField(
        historySchema(),
        {
          required: true,
          nullable: false,
          initial: []
        }
      ),

      governance: new SchemaField({
        controllers: new ArrayField(
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
        )
      })
    };
  }

  static validateJoint(data) {
    const controllers = data?.governance?.controllers ?? [];

    if (new Set(controllers).size !== controllers.length) {
      throw new Error("Domain.governance.controllers contém IDs duplicados.");
    }

    const tags = data?.identity?.tags ?? [];
    if (new Set(tags).size !== tags.length) {
      throw new Error("Domain.identity.tags contém valores duplicados.");
    }

    const stocks = data?.economy?.stocks ?? [];
    const stockResourceIds =
      stocks.map((stock) => stock.resourceId);

    if (
      new Set(stockResourceIds).size
      !== stockResourceIds.length
    ) {
      throw new Error(
        "Domain.economy.stocks contém resourceId duplicado."
      );
    }

    const flows = data?.economy?.flows ?? [];
    const flowIds =
      flows.map((flow) => flow.localId);

    if (
      new Set(flowIds).size
      !== flowIds.length
    ) {
      throw new Error(
        "Domain.economy.flows contém localId duplicado."
      );
    }

    const groups = data?.population?.groups ?? [];
    const groupIds = groups.map((group) => group.localId);
    if (new Set(groupIds).size !== groupIds.length) {
      throw new Error("Domain.population.groups contém localId duplicado.");
    }

    const notables = data?.population?.notables ?? [];
    const notableIds = notables.map((notable) => notable.localId);
    if (new Set(notableIds).size !== notableIds.length) {
      throw new Error("Domain.population.notables contém localId duplicado.");
    }

    const conditions = data?.conditions ?? [];
    const conditionIds = conditions.map((c) => c.localId);
    if (new Set(conditionIds).size !== conditionIds.length) {
      throw new Error("Domain.conditions contém localId duplicado.");
    }

    const relations = data?.relations ?? [];
    const relationIds = relations.map((r) => r.localId);
    if (new Set(relationIds).size !== relationIds.length) {
      throw new Error("Domain.relations contém localId duplicado.");
    }

    const agreements = data?.agreements ?? [];
    const agreementIds = agreements.map((a) => a.localId);
    if (new Set(agreementIds).size !== agreementIds.length) {
      throw new Error("Domain.agreements contém localId duplicado.");
    }

    const intelList = data?.intel ?? [];
    const intelIds = intelList.map((i) => i.localId);
    if (new Set(intelIds).size !== intelIds.length) {
      throw new Error("Domain.intel contém localId duplicado.");
    }

    const historyList = data?.history ?? [];
    const historyIds = historyList.map((h) => h.localId);
    if (new Set(historyIds).size !== historyIds.length) {
      throw new Error("Domain.history contém localId duplicado.");
    }
  }
}
