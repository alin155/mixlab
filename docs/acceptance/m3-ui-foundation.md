# M3 UI Foundation Acceptance Record

Date: 2026-05-02
Updated: 2026-06-03

## Scope

This milestone implements the shared formal UI foundation for later cutter and admin product rebuilds.

Spec sources:

- `21_视觉与交互设计规范.md`
- `docs/spec-traceability.md` `CUTTER-001`
- `docs/spec-traceability.md` `CUTTER-002`
- `docs/spec-traceability.md` `ADMIN-001`

Hi-fi references:

- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/cutter-workbench-apple-hig.png`
- `/Users/allen/Desktop/MixLab_V3_开发交付规格书/assets/ui/admin-console-apple-hig.png`

## Implemented

- `@mixlab/ui-foundation` with Apple-HIG inspired tokens, layout classes, React primitives, and design-contract validation helpers.
- Required cutter/admin page lists and forbidden UI pattern guards.
- First-version product scope guard for allowed capabilities, explicit non-scope capabilities, and written-change-request phrasing.
- `@mixlab/ui-fixtures` with two visual fixture boards:
  - cutter: public source library, source detail, search/document, cut list, local library, cut queue/settings.
  - admin: dashboard, public library settings, source video management, preprocessing tasks, index publication, Doctor.
- Playwright screenshot verification using local Chrome at `1536x1024`.

## Screenshot Artifacts

- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m3-ui-foundation/cutter-fixture.png`
- `/Users/allen/Documents/mixlab/docs/acceptance/artifacts/m3-ui-foundation/admin-fixture.png`

## Explicitly Not Implemented In M3

- Formal cutter app rebuild.
- Formal admin console implementation.
- Backend API changes.
- Tauri shell.
- Go management service.
- Real data binding for fixture pages.

## Verification Commands

```bash
node --test --import tsx packages/ui-foundation/src/design-contract.test.ts
node --test --import tsx packages/ui-foundation/src/components.test.ts
npm run typecheck
npm test
npm run build:cutter-web
npm run build:ui-fixtures
npm run visual:ui-foundation
```

Result:

- `npm run typecheck`: passed.
- `npm test`: passed, 598/598 tests.
- `npm run build:cutter-web`: passed.
- `npm run build:ui-fixtures`: passed.
- `npm run visual:ui-foundation`: passed and regenerated both screenshot artifacts.

## Acceptance Criteria

- UI foundation rejects forbidden patterns from the visual spec.
- Cutter fixture includes six independent pages and uses gallery-first source browsing.
- Admin fixture includes governance/status surfaces without marketing or heavy SaaS styling.
- Screenshot artifacts are generated from a browser at `1536x1024`.
- Existing cutter preview still builds.

## Known Remaining Work

- M5 must build the formal admin console on top of these primitives.
- M4 must rebuild the formal cutter workbench on top of these primitives.
- M8/Tauri must provide native local file/folder actions.
