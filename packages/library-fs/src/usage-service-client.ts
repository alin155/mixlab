/**
 * Round6: legacy library-fs location kept as a compatibility re-export.
 *
 * The canonical shared client implementation lives in `packages/service-clients` (three-repo
 * shared source). Library-fs consumers (usage outbox, acceptance scripts, tests) can keep their
 * historical import path; new code should import `@mixlab/service-clients` directly.
 */
export * from "../../service-clients/src/usage-service-client.ts";
