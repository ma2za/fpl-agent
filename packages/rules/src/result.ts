import type { ValidationResult } from "./types";

export function createResult(): ValidationResult {
  return {
    isValid: true,
    errors: [],
    warnings: []
  };
}

export function addError(result: ValidationResult, message: string) {
  result.errors.push(message);
  result.isValid = false;
}

export function addWarning(result: ValidationResult, message: string) {
  result.warnings.push(message);
}

export function mergeResults(...results: ValidationResult[]): ValidationResult {
  return {
    isValid: results.every((result) => result.isValid),
    errors: results.flatMap((result) => result.errors),
    warnings: results.flatMap((result) => result.warnings)
  };
}
