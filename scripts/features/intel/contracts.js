import { RECORD_TYPES } from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { INTEL_CATEGORIES, INTEL_CREDIBILITY, INTEL_VISIBILITY } from "./rules.js";

function clean(value){ return String(value ?? "").trim(); }
function domainRef(value){ return normalizeEntityReference(value,{allowedTypes:[RECORD_TYPES.DOMAIN]}); }
function optionalDomainRef(value){ return value==null||value===""?null:domainRef(value); }
function referenceKey(ref){ return ref?.entityId ?? ref?.uuid ?? ""; }
function tags(values){ const source=values==null?[]:(Array.isArray(values)?values:String(values).split(",")); const list=source.map(clean).filter(Boolean); if(new Set(list).size!==list.length) throw new ModuleError(ERROR_CODES.VALIDATION,"Tags de intel duplicadas."); return list; }

export function normalizeIntelUpsertPayload(payload={}){
  const title=clean(payload.title); if(!title) throw new ModuleError(ERROR_CODES.VALIDATION,"Título de intel é obrigatório.");
  const category=clean(payload.category||"fact"); if(!Object.values(INTEL_CATEGORIES).includes(category)) throw new ModuleError(ERROR_CODES.VALIDATION,`Categoria de intel inválida: ${category}`);
  const credibility=clean(payload.credibility||"confirmed"); if(!Object.values(INTEL_CREDIBILITY).includes(credibility)) throw new ModuleError(ERROR_CODES.VALIDATION,`Credibilidade inválida: ${credibility}`);
  const visibility=clean(payload.visibility||"all_controllers"); if(!Object.values(INTEL_VISIBILITY).includes(visibility)) throw new ModuleError(ERROR_CODES.VALIDATION,`Visibilidade inválida: ${visibility}`);
  return { domain:domainRef(payload.domain), localId:clean(payload.localId), title, category, visibility, targetDomain:optionalDomainRef(payload.targetDomain), content:clean(payload.content), credibility, source:clean(payload.source), revealed:visibility==="public"||payload.revealed===true, tags:tags(payload.tags) };
}
export function normalizeIntelRemovePayload(payload={}){ const localId=clean(payload.localId); if(!localId) throw new ModuleError(ERROR_CODES.VALIDATION,"localId de intel é obrigatório."); return {domain:domainRef(payload.domain),localId}; }
export function normalizeIntelRevealPayload(payload={}){ return normalizeIntelRemovePayload(payload); }
export function intelResourceKeys(payload={}){ const n=normalizeIntelUpsertPayload(payload); return [`domain:${referenceKey(n.domain)}`,n.targetDomain?`domain:${referenceKey(n.targetDomain)}`:null].filter(Boolean); }
export function intelReferenceResourceKeys(payload={}){ const n=normalizeIntelRemovePayload(payload); return [`domain:${referenceKey(n.domain)}`]; }
