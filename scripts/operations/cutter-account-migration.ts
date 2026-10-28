import {
  applyCutterAccountMigration,
  inspectCutterAccountMigration,
  rollbackCutterAccountMigration
} from "../../packages/library-fs/src/cutter-account-migration.ts";

const [operation, legacyRoot, stateRoot, ...flags] = process.argv.slice(2);
const legacyWritersStopped = flags.includes("--legacy-writers-stopped");

if (!operation || !legacyRoot || !stateRoot) {
  throw new Error(
    "用法：dry-run <legacy-root> <state-root> | apply <legacy-root> <state-root> --legacy-writers-stopped | rollback <legacy-root> <state-root> --legacy-writers-stopped"
  );
}

if (operation === "dry-run") {
  console.log(JSON.stringify(await inspectCutterAccountMigration({ legacy_root: legacyRoot, state_root: stateRoot }), null, 2));
} else if (operation === "apply") {
  console.log(
    JSON.stringify(
      await applyCutterAccountMigration({
        legacy_root: legacyRoot,
        state_root: stateRoot,
        legacy_writers_stopped: legacyWritersStopped
      }),
      null,
      2
    )
  );
} else if (operation === "rollback") {
  console.log(
    JSON.stringify(
      await rollbackCutterAccountMigration({
        legacy_root: legacyRoot,
        state_root: stateRoot,
        legacy_writers_stopped: legacyWritersStopped
      }),
      null,
      2
    )
  );
} else {
  throw new Error("账号迁移操作无效");
}
