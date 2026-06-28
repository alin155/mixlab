import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminDockerNasAccessPreflightReport,
  toMarkdown
} from "./admin-docker-nas-access-preflight.ts";

function report(input: {
  sshOpen?: boolean;
  stagingOpen?: boolean;
  desktopOpen?: boolean;
  legacyOpen?: boolean;
  smbMounted?: boolean;
  compose?: string[];
  returned?: string[];
  handoffReady?: boolean;
} = {}) {
  const handoffReady = input.handoffReady !== false;
  return buildAdminDockerNasAccessPreflightReport({
    generated_at: "2026-06-28T00:00:00.000Z",
    command: "test",
    nas_host: "192.168.1.27",
    smb_root: "/Volumes/MixLab",
    handoff_bundle_dir: "docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest",
    ports: [
      { port: 22, status: input.sshOpen ? "open" : "closed", error: input.sshOpen ? "" : "refused" },
      { port: 8080, status: input.stagingOpen ? "open" : "closed", error: input.stagingOpen ? "" : "refused" },
      { port: 18080, status: input.legacyOpen === false ? "closed" : "open", error: input.legacyOpen === false ? "refused" : "" },
      { port: 9999, status: input.desktopOpen === false ? "closed" : "open", error: input.desktopOpen === false ? "refused" : "" }
    ],
    http: [
      { url: "http://192.168.1.27:18080/", status: "ok", http_status: 200, content_type: "text/html", error: "" }
    ],
    smb_root_observation: {
      path: "/Volumes/MixLab",
      present: input.smbMounted !== false,
      is_directory: input.smbMounted !== false,
      top_level_dirs: input.smbMounted === false ? [] : ["PublicLibrary", "installers"]
    },
    handoff_bundle_observation: {
      path: "docs/acceptance/artifacts/admin-docker-nas-release-inputs-handoff-latest",
      present: handoffReady,
      is_directory: handoffReady,
      required_files: [
        "README.md",
        "OPERATOR-CHECKLIST.md",
        "MANIFEST.json",
        "nas/RUN_ON_NAS.sh",
        "nas/admin-docker-nas-release-inputs-collector.sh",
        "local/install-nas-runner.sh",
        "local/validate-returned-evidence.sh"
      ],
      missing_files: handoffReady ? [] : ["MANIFEST.json"],
      candidate_sha: handoffReady ? "abc123" : "",
      candidate_release_ref: handoffReady ? "admin-docker-candidate-abc123" : ""
    },
    compose_candidates: input.compose ?? [],
    returned_evidence_candidates: input.returned ?? [],
    max_depth: 5,
    max_entries: 2000
  });
}

test("NAS access preflight records blocked direct collection without approving deploy", () => {
  const built = report();

  assert.equal(built.result.status, "blocked");
  assert.equal(built.nas_collection_directly_available, false);
  assert.equal(built.push_execution_allowed, false);
  assert.equal(built.docker_deploy_allowed, false);
  assert.equal(built.observations.handoff_bundle.candidate_sha, "abc123");
  assert.ok(!built.summary.nas_collection_blockers.includes("handoff-bundle-ready"));
  assert.ok(built.summary.nas_collection_blockers.includes("ssh-access-available"));
  assert.ok(built.summary.nas_collection_blockers.includes("compose-project-visible-on-smb"));
  assert.ok(built.summary.nas_collection_blockers.includes("returned-evidence-visible"));
});

test("NAS access preflight becomes ready for collection when compose project is visible", () => {
  const built = report({
    compose: ["/Volumes/MixLab/admin/docker-compose.yml"]
  });

  assert.equal(built.result.status, "ready-for-nas-collection");
  assert.equal(built.nas_collection_directly_available, true);
  assert.equal(built.docker_deploy_allowed, false);
  assert.ok(!built.summary.nas_collection_blockers.includes("compose-project-visible-on-smb"));
});

test("NAS access preflight blocks collection when the local handoff bundle is incomplete", () => {
  const built = report({
    sshOpen: true,
    handoffReady: false
  });

  assert.equal(built.result.status, "blocked");
  assert.equal(built.nas_collection_directly_available, false);
  assert.ok(built.summary.nas_collection_blockers.includes("handoff-bundle-ready"));
});

test("NAS access preflight treats returned evidence as a collection path", () => {
  const built = report({
    returned: ["/Volumes/MixLab/admin-docker-release-inputs"]
  });

  assert.equal(built.result.status, "ready-for-nas-collection");
  assert.equal(built.nas_collection_directly_available, true);
  assert.ok(!built.summary.nas_collection_blockers.includes("returned-evidence-visible"));
});

test("NAS access preflight markdown records read-only boundary", () => {
  const markdown = toMarkdown(report());

  assert.match(markdown, /read-only/i);
  assert.match(markdown, /Push execution allowed: no/);
  assert.match(markdown, /Docker deploy allowed: no/);
  assert.match(markdown, /Handoff Bundle/);
  assert.match(markdown, /Candidate SHA: abc123/);
  assert.doesNotMatch(markdown, /push_images=true/);
});
