import type { ReadyPublicationCandidate, ValidationResult } from "./types.ts";
import { validateSourceVideoManifest } from "./status.ts";

export function validateReadyPublicationCandidate(
  candidate: ReadyPublicationCandidate
): ValidationResult {
  const errors: string[] = [];
  const manifestValidation = validateSourceVideoManifest(candidate.manifest);

  errors.push(...manifestValidation.errors);

  for (const [artifactName, exists] of Object.entries(candidate.artifacts)) {
    if (!exists) {
      errors.push(`${artifactName.replaceAll("_", " ")} artifact is required before ready publish`);
    }
  }

  if (!/^v\d{6}$/.test(candidate.index_version)) {
    errors.push("index_version must use v000001 format");
  }

  if (!candidate.index_searchable) {
    errors.push("video must be searchable in the target index before ready publish");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}
