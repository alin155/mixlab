# MixLab V1 Scope Guard

Updated: 2026-06-03

## Allowed V1 Capability Set

- Keyword search across public and reusable local materials.
- Full transcript reading from the selected source material.
- Continuous transcript selection for one cut span.
- Local video cutting into the cutter workspace.
- Reusable local exports.
- Admin governance of the public library.

## Explicitly Out Of Scope

- AI recommendations, semantic expansion, vector recommendation, or synonym management.
- Collaborative editing or shared multi-user cut lists.
- Complex role matrices, department permissions, or material-level permissions.
- Cloud material management, public-material sync, or public-material download workflows.

## Change Rule

Any implementation or product copy that introduces an out-of-scope capability must link to a written change request before it can be accepted. Non-scope statements are allowed when they are clearly phrased as "out of scope", "not implemented", "不做", or "变更请求".

The executable guard lives in `packages/ui-foundation/src/design-contract.ts` as `validateFirstVersionScopeClaims`.
