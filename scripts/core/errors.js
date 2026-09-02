export class ModuleError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "ModuleError";
    this.code = code;
  }
}

export const ERROR_CODES = Object.freeze({
  PERMISSION: "PERMISSION",
  VALIDATION: "VALIDATION",
  CONFLICT: "CONFLICT",
  NOT_FOUND: "NOT_FOUND",
  AUTHORITY_UNAVAILABLE: "AUTHORITY_UNAVAILABLE",
  SYSTEM: "SYSTEM"
});
