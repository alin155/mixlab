/** Shared typed errors for read-only library format parsing/validation. */
export type LibraryFormatErrorCode =
  | "FORMAT_INVALID"
  | "PATH_UNSAFE"
  | "VERSION_INVALID"
  | "HASH_INVALID"
  | "MANIFEST_INVALID"
  | "POINTER_INVALID";

export class LibraryFormatError extends Error {
  readonly name = "LibraryFormatError";

  constructor(
    readonly code: LibraryFormatErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>
  ) {
    super(message);
  }
}
