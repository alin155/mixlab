import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUTPUT_DIR = "docs/acceptance/artifacts";
const LEGACY_ROLLBACK_EXCEPTION_APPROVAL_VALUE = "release-manager:legacy-latest-rollback-exception=accepted";

type GateStatus = "pass" | "blocked" | "fail";
type GateCategory =
  | "safety"
  | "handoff"
  | "candidate-ref"
  | "image-proof"
  | "legacy-rollback"
  | "release-input"
  | "release-decision";

interface ReleaseInputGate {
  id: string;
  title: string;
  category: GateCategory;
  status: GateStatus;
  evidence: string;
  blocks_release_inputs: boolean;
  blocks_push_execution: boolean;
  blocks_docker_deploy: boolean;
  required_evidence?: string;
}

interface ReleaseInputSummary {
  total: number;
  passed: number;
  blocked: number;
  failed: number;
  release_input_blockers: string[];
  push_execution_blockers: string[];
  docker_deploy_blockers: string[];
}

interface ReleaseInputSources {
  prestaging_handoff_report: string;
  candidate_ref_proof_report: string;
  nas_image_proof_report: string;
  legacy_rollback_plan_report: string;
  legacy_rollback_exception_review_report: string;
}

export interface AdminDockerReleaseInputsReport {
  schema_version: "1.0";
  generated_at: string;
  command: string;
  mode: "admin-docker-release-inputs";
  sources: ReleaseInputSources;
  release_inputs_ready: boolean;
  push_execution_allowed: false;
  docker_deploy_allowed: false;
  release_decision_required: true;
  inputs: {
    target_image_tag: string;
    current_image_tag: string;
    rollback_image_tag: string;
    branch: string;
    workflow_ref: string;
    release_ref_setup_command: string;
    workflow_dispatch_command: string;
  };
  observations: {
    handoff_ready_to_request_release_inputs: boolean | null;
    handoff_staging_execution_ready: boolean | null;
    handoff_docker_deploy_allowed: boolean | null;
    handoff_staging_execution_blockers: string[];
    handoff_docker_deploy_blockers: string[];
    candidate_ref_proof_accepted: boolean | null;
    candidate_ref_proof_docker_deploy_allowed: boolean | null;
    candidate_ref_expected_sha: string;
    candidate_ref_expected_tag: string;
    candidate_ref_github_run_url: string;
    candidate_ref_blockers: string[];
    nas_image_proof_accepted: boolean | null;
    nas_image_proof_docker_deploy_allowed: boolean | null;
    nas_image_proof_blockers: string[];
    legacy_rollback_plan_ready: boolean | null;
    legacy_rollback_release_execution_allowed: boolean | null;
    legacy_rollback_docker_deploy_allowed: boolean | null;
    legacy_rollback_current_image_tag: string;
    legacy_rollback_target_image_tag: string;
    legacy_rollback_exception_approval: string;
    legacy_rollback_exception_review_accepted: boolean | null;
    legacy_rollback_exception_review_role: string;
    legacy_rollback_exception_review_blockers: string[];
    legacy_rollback_exception_ready: boolean;
    legacy_rollback_exception_accepted: boolean;
    legacy_rollback_exception_blockers: string[];
    target_differs_from_current: boolean;
    rollback_matches_current: boolean;
  };
  gates: ReleaseInputGate[];
  summary: ReleaseInputSummary;
  next_actions: string[];
  result: {
    status: "ready-for-release-decision" | "blocked" | "failed";
    summary: string;
  };
  artifacts: {
    json_path: string;
    markdown_path: string;
  } | null;
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function gate(input: ReleaseInputGate): ReleaseInputGate {
  return input;
}

function summarize(gates: ReleaseInputGate[]): ReleaseInputSummary {
  return {
    total: gates.length,
    passed: gates.filter((item) => item.status === "pass").length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    failed: gates.filter((item) => item.status === "fail").length,
    release_input_blockers: gates
      .filter((item) => item.blocks_release_inputs && item.status !== "pass")
      .map((item) => item.id),
    push_execution_blockers: gates
      .filter((item) => item.blocks_push_execution && item.status !== "pass")
      .map((item) => item.id),
    docker_deploy_blockers: gates
      .filter((item) => item.blocks_docker_deploy && item.status !== "pass")
      .map((item) => item.id)
  };
}

function workflowCommand(input: {
  workflowRef: string;
  current: string;
  rollback: string;
}): string {
  const workflowRef = input.workflowRef || "<candidate-release-tag>";
  const current = input.current || "<current-admin-docker-image-tag>";
  const rollback = input.rollback || "<rollback-admin-docker-image-tag>";

  return [
    "gh workflow run docker-admin.yml",
    "--repo alin155/mixlab",
    `--ref ${workflowRef}`,
    "-f push_images=true",
    `-f current_image_tag=${current}`,
    `-f rollback_image_tag=${rollback}`
  ].join(" ");
}

function refFromWorkflowCommand(command: string): string {
  const match = command.match(/(?:^|\s)--ref\s+([^\s]+)/);

  return match?.[1] ?? "";
}

function candidateReleaseRef(target: string): string {
  return target ? `admin-docker-candidate-${target}` : "<candidate-release-tag>";
}

function nextActions(input: {
  release_inputs_ready: boolean;
  workflow_dispatch_command: string;
  release_ref_setup_command: string;
  release_input_blockers: string[];
  staging_execution_blockers: string[];
  legacy_rollback_exception_ready: boolean;
  legacy_rollback_exception_accepted: boolean;
}): string[] {
  const preservedStagingBlockers = input.staging_execution_blockers.length > 0
    ? [
        `Preserved pre-staging execution blockers: ${input.staging_execution_blockers.join(", ")}.`
      ]
    : [];

  if (!input.release_inputs_ready) {
    const needsCandidateRefProof = input.release_input_blockers.some((id) => id.startsWith("candidate-ref"));
    const needsNasImageProof = input.release_input_blockers.some((id) => id.startsWith("nas-"));

    return [
      "Keep push_images=false until release inputs are ready.",
      ...(needsCandidateRefProof
        ? ["Run validate:admin-docker-candidate-ref-proof against the candidate tag push_images=false GitHub dry-run artifact."]
        : []),
      ...(needsNasImageProof
        ? ["Run validate:admin-docker-nas-image-proof with a sanitized NAS MIXLAB_IMAGE_TAG evidence file and docker inspect evidence."]
        : []),
      ...(input.legacy_rollback_exception_ready && !input.legacy_rollback_exception_accepted
        ? ["Run review:admin-docker-legacy-rollback-exception and pass MIXLAB_ADMIN_DOCKER_LEGACY_ROLLBACK_EXCEPTION_REVIEW_REPORT to release inputs if the release-manager review accepts the one-time legacy latest rollback exception."]
        : []),
      `Resolve release input blockers: ${input.release_input_blockers.join(", ") || "unknown"}.`,
      ...preservedStagingBlockers
    ];
  }

  return [
    "Review this report and the NAS image proof report before any release decision.",
    `Before staging execution, clear handoff staging blockers: ${input.staging_execution_blockers.join(", ") || "none"}.`,
    `Before running push_images=true, create or verify the candidate release ref: ${input.release_ref_setup_command}`,
    `After explicit release approval only, run: ${input.workflow_dispatch_command}`,
    "Do not edit NAS .env, restart NAS containers, or enable workers until the pushed-image workflow succeeds and staging proof is collected.",
    "After the push workflow succeeds, regenerate GitHub run artifact, staging runbook, live-readonly, admin-worker env proof, and Cutter compatibility proof."
  ];
}

export function buildAdminDockerReleaseInputsReport(input: {
  generated_at: string;
  command: string;
  prestaging_handoff_report_path?: string;
  prestaging_handoff_report?: unknown;
  candidate_ref_proof_report_path?: string;
  candidate_ref_proof_report?: unknown;
  nas_image_proof_report_path?: string;
  nas_image_proof_report?: unknown;
  legacy_rollback_plan_report_path?: string;
  legacy_rollback_plan_report?: unknown;
  legacy_rollback_exception_review_report_path?: string;
  legacy_rollback_exception_review_report?: unknown;
  legacy_rollback_exception_approval?: string;
}): AdminDockerReleaseInputsReport {
  const handoff = asRecord(input.prestaging_handoff_report);
  const candidateRefProof = asRecord(input.candidate_ref_proof_report);
  const proof = asRecord(input.nas_image_proof_report);
  const legacyRollbackPlan = asRecord(input.legacy_rollback_plan_report);
  const legacyRollbackReview = asRecord(input.legacy_rollback_exception_review_report);
  const releaseInputRequest = asRecord(handoff.release_input_request);
  const candidate = asRecord(handoff.candidate);
  const candidateRefCandidate = asRecord(candidateRefProof.candidate);
  const candidateRefGithubRun = asRecord(candidateRefProof.github_run);
  const candidateRefSummary = asRecord(candidateRefProof.summary);
  const proofInputs = asRecord(proof.release_inputs);
  const handoffSummary = asRecord(handoff.summary);
  const proofSummary = asRecord(proof.summary);
  const legacyRollbackObservations = asRecord(legacyRollbackPlan.observations);
  const legacyRollbackSummary = asRecord(legacyRollbackPlan.summary);
  const legacyRollbackReviewReviewer = asRecord(legacyRollbackReview.reviewer);
  const legacyRollbackReviewObservations = asRecord(legacyRollbackReview.observations);
  const legacyRollbackReviewSummary = asRecord(legacyRollbackReview.summary);
  const target = asString(releaseInputRequest.target_image_tag);
  const branch = asString(candidate.head_branch)
    || refFromWorkflowCommand(asString(releaseInputRequest.workflow_dispatch_command))
    || "codex/windows-first-run-autostart-20260615104835";
  const workflowRef = asString(releaseInputRequest.workflow_ref)
    || refFromWorkflowCommand(asString(releaseInputRequest.workflow_dispatch_command))
    || branch;
  const expectedWorkflowRef = candidateReleaseRef(target);
  const releaseRefSetupCommand = asString(releaseInputRequest.release_ref_setup_command);
  const currentFromProof = asString(proofInputs.current_image_tag);
  const rollbackFromProof = asString(proofInputs.rollback_image_tag);
  const handoffProvided = Boolean(input.prestaging_handoff_report_path && input.prestaging_handoff_report);
  const proofProvided = Boolean(input.nas_image_proof_report_path && input.nas_image_proof_report);
  const legacyRollbackProvided = Boolean(input.legacy_rollback_plan_report_path && input.legacy_rollback_plan_report);
  const handoffReady = asBoolean(handoff.ready_to_request_release_inputs);
  const handoffStagingReady = asBoolean(handoff.staging_execution_ready);
  const handoffDeployAllowed = asBoolean(handoff.docker_deploy_allowed);
  const candidateRefProofAccepted = asBoolean(candidateRefProof.candidate_ref_proof_accepted);
  const candidateRefDeployAllowed = asBoolean(candidateRefProof.docker_deploy_allowed);
  const candidateRefExpectedSha = asString(candidateRefCandidate.expected_sha);
  const candidateRefExpectedTag = asString(candidateRefCandidate.expected_tag);
  const candidateRefGithubRunUrl = asString(candidateRefGithubRun.url);
  const candidateRefBlockers = stringArray(candidateRefSummary.candidate_ref_blockers);
  const proofAccepted = asBoolean(proof.proof_accepted);
  const proofDeployAllowed = asBoolean(proof.docker_deploy_allowed);
  const handoffStagingExecutionBlockers = stringArray(handoffSummary.staging_execution_blockers);
  const handoffDockerDeployBlockers = stringArray(handoffSummary.docker_deploy_blockers);
  const proofBlockers = stringArray(proofSummary.release_input_blockers);
  const legacyRollbackPlanReady = asBoolean(legacyRollbackPlan.exception_plan_ready);
  const legacyRollbackReleaseAllowed = asBoolean(legacyRollbackPlan.release_execution_allowed);
  const legacyRollbackDeployAllowed = asBoolean(legacyRollbackPlan.docker_deploy_allowed);
  const legacyRollbackCurrentTag = asString(legacyRollbackObservations.current_image_tag);
  const legacyRollbackTargetTag = asString(legacyRollbackObservations.target_image_tag);
  const legacyRollbackDecisionBlockers = stringArray(legacyRollbackSummary.release_decision_blockers);
  const legacyRollbackReviewAccepted = asBoolean(legacyRollbackReview.exception_review_accepted);
  const legacyRollbackReviewReleaseAllowed = asBoolean(legacyRollbackReview.release_execution_allowed);
  const legacyRollbackReviewDeployAllowed = asBoolean(legacyRollbackReview.docker_deploy_allowed);
  const legacyRollbackReviewRole = asString(legacyRollbackReviewReviewer.role);
  const legacyRollbackReviewTargetTag = asString(legacyRollbackReviewObservations.target_image_tag);
  const legacyRollbackReviewCurrentTag = asString(legacyRollbackReviewObservations.current_image_tag);
  const legacyRollbackReviewBlockers = stringArray(legacyRollbackReviewSummary.exception_review_blockers);
  const legacyRollbackReviewProvided = Boolean(
    input.legacy_rollback_exception_review_report_path && input.legacy_rollback_exception_review_report
  );
  const legacyRollbackReviewMatches = Boolean(
    legacyRollbackReviewAccepted === true &&
    legacyRollbackReviewRole === "release-manager" &&
    legacyRollbackReviewCurrentTag === "latest" &&
    target &&
    legacyRollbackReviewTargetTag === target &&
    legacyRollbackReviewReleaseAllowed === false &&
    legacyRollbackReviewDeployAllowed === false &&
    legacyRollbackReviewBlockers.length === 0
  );
  const legacyRollbackExceptionApproval = input.legacy_rollback_exception_approval?.trim() ?? "";
  const legacyRollbackExceptionAccepted =
    legacyRollbackExceptionApproval === LEGACY_ROLLBACK_EXCEPTION_APPROVAL_VALUE ||
    legacyRollbackReviewMatches;
  const proofOnlyLegacyLatestBlocker = proofAccepted === false &&
    proofBlockers.length === 1 &&
    proofBlockers[0] === "current-tag-stable-for-rollback";
  const legacyRollbackPlanNondestructive = legacyRollbackReleaseAllowed === false && legacyRollbackDeployAllowed === false;
  const legacyRollbackPlanMatchesTarget = Boolean(
    legacyRollbackCurrentTag === "latest" &&
    target &&
    legacyRollbackTargetTag === target
  );
  const legacyRollbackExceptionReady = Boolean(
    proofOnlyLegacyLatestBlocker &&
    legacyRollbackProvided &&
    legacyRollbackPlanReady &&
    legacyRollbackPlanNondestructive &&
    legacyRollbackPlanMatchesTarget
  );
  const legacyRollbackExceptionBlockers = [
    ...(proofOnlyLegacyLatestBlocker && !legacyRollbackProvided ? ["legacy-rollback-plan-provided"] : []),
    ...(proofOnlyLegacyLatestBlocker && legacyRollbackProvided && !legacyRollbackPlanReady ? ["legacy-rollback-exception-ready"] : []),
    ...(legacyRollbackProvided && !legacyRollbackPlanNondestructive ? ["legacy-rollback-plan-does-not-approve-release-or-deploy"] : []),
    ...(legacyRollbackReviewProvided && !legacyRollbackReviewMatches ? ["legacy-rollback-exception-review-accepted"] : []),
    ...(proofOnlyLegacyLatestBlocker && legacyRollbackProvided && !legacyRollbackPlanMatchesTarget ? ["legacy-rollback-plan-matches-target"] : []),
    ...(legacyRollbackExceptionReady && !legacyRollbackExceptionAccepted ? ["legacy-rollback-exception-approved"] : [])
  ];
  const current = legacyRollbackExceptionReady && legacyRollbackExceptionAccepted ? legacyRollbackCurrentTag : currentFromProof;
  const rollback = legacyRollbackExceptionReady && legacyRollbackExceptionAccepted ? legacyRollbackCurrentTag : rollbackFromProof;
  const command = workflowCommand({ workflowRef, current, rollback });
  const nasImageProofAcceptedForInputs = proofAccepted === true ||
    (legacyRollbackExceptionReady && legacyRollbackExceptionAccepted);
  const targetDiffers = Boolean(target && current && target !== current);
  const rollbackMatchesCurrent = Boolean(current && rollback && current === rollback);
  const workflowRefPinsTarget = Boolean(target && workflowRef === expectedWorkflowRef);
  const releaseRefSetupReady = Boolean(
    target &&
    releaseRefSetupCommand &&
    !releaseRefSetupCommand.includes("<") &&
    !releaseRefSetupCommand.includes(">") &&
    releaseRefSetupCommand.includes(workflowRef) &&
    releaseRefSetupCommand.includes(target)
  );
  const candidateRefProvided = Boolean(input.candidate_ref_proof_report_path && input.candidate_ref_proof_report);
  const candidateRefMatchesTarget = Boolean(
    target &&
    candidateRefExpectedSha &&
    candidateRefExpectedSha === target
  );
  const candidateRefMatchesWorkflowRef = Boolean(
    workflowRef &&
    candidateRefExpectedTag &&
    candidateRefExpectedTag === workflowRef
  );
  const commandHasNoPlaceholders = Boolean(command && !command.includes("<") && !command.includes(">"));
  const gates = [
    gate({
      id: "release-inputs-no-side-effects",
      title: "Release input packaging is read-only",
      category: "safety",
      status: "pass",
      evidence: "This report reads prestaging handoff, candidate-ref proof, and NAS image proof JSON only; it does not contact NAS, Docker, GitHub, Admin API, or Cutter.",
      blocks_release_inputs: false,
      blocks_push_execution: false,
      blocks_docker_deploy: false
    }),
    gate({
      id: "prestaging-handoff-provided",
      title: "Pre-staging handoff report is provided",
      category: "handoff",
      status: handoffProvided ? "pass" : "blocked",
      evidence: input.prestaging_handoff_report_path || "No MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT path provided.",
      blocks_release_inputs: !handoffProvided,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-prestaging-handoff and provide the JSON report path."
    }),
    gate({
      id: "candidate-ref-proof-provided",
      title: "Candidate ref proof report is provided",
      category: "candidate-ref",
      status: candidateRefProvided ? "pass" : "blocked",
      evidence: input.candidate_ref_proof_report_path || "No MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_PROOF_REPORT path provided.",
      blocks_release_inputs: !candidateRefProvided,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-candidate-ref-proof with the candidate tag push_images=false GitHub dry-run artifacts."
    }),
    gate({
      id: "nas-image-proof-provided",
      title: "NAS image proof report is provided",
      category: "image-proof",
      status: proofProvided ? "pass" : "blocked",
      evidence: input.nas_image_proof_report_path || "No MIXLAB_ADMIN_DOCKER_NAS_IMAGE_PROOF_REPORT path provided.",
      blocks_release_inputs: !proofProvided,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Run validate:admin-docker-nas-image-proof with exported NAS .env and docker inspect evidence."
    }),
    gate({
      id: "handoff-ready-to-request-release-inputs",
      title: "Handoff is ready to request release inputs",
      category: "handoff",
      status: handoffReady ? "pass" : "blocked",
      evidence: `ready_to_request_release_inputs=${String(handoffReady)}`,
      blocks_release_inputs: !handoffReady,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Pre-staging handoff must have ready_to_request_release_inputs=true."
    }),
    gate({
      id: "handoff-does-not-approve-staging-or-deploy",
      title: "Handoff still does not approve staging or deploy",
      category: "safety",
      status: handoffStagingReady === true || handoffDeployAllowed === true ? "fail" : "pass",
      evidence: `staging_execution_ready=${String(handoffStagingReady)}, docker_deploy_allowed=${String(handoffDeployAllowed)}`,
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Release input packaging must be based on a non-deploy pre-staging handoff."
    }),
    gate({
      id: "candidate-ref-proof-accepted",
      title: "Candidate ref proof is accepted",
      category: "candidate-ref",
      status: candidateRefProofAccepted ? "pass" : "blocked",
      evidence: candidateRefProofAccepted ? "candidate_ref_proof_accepted=true" : `candidate ref blockers=${candidateRefBlockers.join(", ") || "unknown"}`,
      blocks_release_inputs: !candidateRefProofAccepted,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Candidate ref proof must verify that the release tag points to the smoked candidate SHA and has a successful push_images=false dry-run."
    }),
    gate({
      id: "candidate-ref-proof-does-not-approve-deploy",
      title: "Candidate ref proof does not approve deploy",
      category: "safety",
      status: candidateRefDeployAllowed === true ? "fail" : candidateRefDeployAllowed === false ? "pass" : "blocked",
      evidence: `candidate_ref_proof.docker_deploy_allowed=${String(candidateRefDeployAllowed)}`,
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Candidate ref proof must remain evidence-only with docker_deploy_allowed=false."
    }),
    gate({
      id: "candidate-ref-target-matches-handoff",
      title: "Candidate ref target matches handoff target",
      category: "candidate-ref",
      status: candidateRefMatchesTarget ? "pass" : "blocked",
      evidence: `candidate_ref.expected_sha=${candidateRefExpectedSha || "missing"}, handoff.target=${target || "missing"}`,
      blocks_release_inputs: !candidateRefMatchesTarget,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "The candidate-ref proof expected SHA must match the pre-staging handoff target image tag."
    }),
    gate({
      id: "candidate-ref-tag-matches-workflow-ref",
      title: "Candidate ref tag matches workflow ref",
      category: "candidate-ref",
      status: candidateRefMatchesWorkflowRef ? "pass" : "blocked",
      evidence: `candidate_ref.expected_tag=${candidateRefExpectedTag || "missing"}, workflow_ref=${workflowRef || "missing"}`,
      blocks_release_inputs: !candidateRefMatchesWorkflowRef,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "The candidate-ref proof expected tag must match the generated workflow ref."
    }),
    gate({
      id: "handoff-staging-blockers-carried-forward",
      title: "Pre-staging execution blockers are carried forward",
      category: "handoff",
      status: handoffStagingExecutionBlockers.length > 0 ? "blocked" : "pass",
      evidence: handoffStagingExecutionBlockers.length > 0
        ? `staging blockers=${handoffStagingExecutionBlockers.join(", ")}`
        : "No pre-staging execution blockers were reported.",
      blocks_release_inputs: false,
      blocks_push_execution: false,
      blocks_docker_deploy: true,
      required_evidence: "The release-input package must preserve pre-staging blockers so a generated push_images=true command is not mistaken for staging approval."
    }),
    gate({
      id: "legacy-rollback-plan-provided",
      title: "Legacy latest rollback exception plan is provided when needed",
      category: "legacy-rollback",
      status: !proofOnlyLegacyLatestBlocker || legacyRollbackProvided ? "pass" : "blocked",
      evidence: proofOnlyLegacyLatestBlocker
        ? input.legacy_rollback_plan_report_path || "No MIXLAB_ADMIN_DOCKER_LEGACY_ROLLBACK_PLAN_REPORT path provided."
        : "not required",
      blocks_release_inputs: proofOnlyLegacyLatestBlocker && !legacyRollbackProvided,
      blocks_push_execution: proofOnlyLegacyLatestBlocker && !legacyRollbackProvided,
      blocks_docker_deploy: true,
      required_evidence: "When the current NAS stack is legacy latest, provide an accepted admin-docker-legacy-rollback-plan report."
    }),
    gate({
      id: "legacy-rollback-exception-ready",
      title: "Legacy latest rollback exception evidence is ready",
      category: "legacy-rollback",
      status: !proofOnlyLegacyLatestBlocker || legacyRollbackExceptionReady ? "pass" : "blocked",
      evidence: proofOnlyLegacyLatestBlocker
        ? `exception_plan_ready=${String(legacyRollbackPlanReady)}, current=${legacyRollbackCurrentTag || "missing"}, target=${legacyRollbackTargetTag || "missing"}, blockers=${legacyRollbackDecisionBlockers.join(", ") || "none"}`
        : "not required",
      blocks_release_inputs: proofOnlyLegacyLatestBlocker && !legacyRollbackExceptionReady,
      blocks_push_execution: proofOnlyLegacyLatestBlocker && !legacyRollbackExceptionReady,
      blocks_docker_deploy: true,
      required_evidence: "Legacy rollback plan must be ready, current must be latest, target must match the handoff target, and only release-decision blockers may remain."
    }),
    gate({
      id: "legacy-rollback-plan-does-not-approve-release-or-deploy",
      title: "Legacy rollback plan does not approve release or deploy",
      category: "safety",
      status: legacyRollbackProvided && !legacyRollbackPlanNondestructive ? "fail" : "pass",
      evidence: legacyRollbackProvided
        ? `release_execution_allowed=${String(legacyRollbackReleaseAllowed)}, docker_deploy_allowed=${String(legacyRollbackDeployAllowed)}`
        : "not provided",
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "The legacy rollback plan must remain review-only with release_execution_allowed=false and docker_deploy_allowed=false."
    }),
    gate({
      id: "legacy-rollback-exception-review-accepted",
      title: "Release-manager exception review is accepted when provided",
      category: "legacy-rollback",
      status: !legacyRollbackReviewProvided || legacyRollbackReviewMatches ? "pass" : "blocked",
      evidence: legacyRollbackReviewProvided
        ? `accepted=${String(legacyRollbackReviewAccepted)}, role=${legacyRollbackReviewRole || "missing"}, current=${legacyRollbackReviewCurrentTag || "missing"}, target=${legacyRollbackReviewTargetTag || "missing"}, blockers=${legacyRollbackReviewBlockers.join(", ") || "none"}`
        : "not provided",
      blocks_release_inputs: legacyRollbackReviewProvided && !legacyRollbackReviewMatches,
      blocks_push_execution: legacyRollbackReviewProvided && !legacyRollbackReviewMatches,
      blocks_docker_deploy: true,
      required_evidence: "Provide an accepted admin-docker-legacy-rollback-exception-review report with reviewer.role=release-manager, current=latest, matching target, and no review blockers."
    }),
    gate({
      id: "legacy-rollback-exception-review-does-not-approve-release-or-deploy",
      title: "Release-manager exception review does not approve release or deploy",
      category: "safety",
      status: legacyRollbackReviewProvided && (legacyRollbackReviewReleaseAllowed === true || legacyRollbackReviewDeployAllowed === true) ? "fail" : "pass",
      evidence: legacyRollbackReviewProvided
        ? `release_execution_allowed=${String(legacyRollbackReviewReleaseAllowed)}, docker_deploy_allowed=${String(legacyRollbackReviewDeployAllowed)}`
        : "not provided",
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "The exception review must be limited to release-input generation and keep release_execution_allowed=false plus docker_deploy_allowed=false."
    }),
    gate({
      id: "legacy-rollback-exception-approved",
      title: "Release-manager accepted the one-time legacy latest rollback exception",
      category: "release-decision",
      status: !legacyRollbackExceptionReady || legacyRollbackExceptionAccepted ? "pass" : "blocked",
      evidence: legacyRollbackExceptionReady
        ? `approval=${legacyRollbackExceptionAccepted ? "accepted" : "missing-or-invalid"}, review=${legacyRollbackReviewMatches ? "accepted" : "not-accepted"}`
        : "not required",
      blocks_release_inputs: legacyRollbackExceptionReady && !legacyRollbackExceptionAccepted,
      blocks_push_execution: legacyRollbackExceptionReady && !legacyRollbackExceptionAccepted,
      blocks_docker_deploy: true,
      required_evidence: "Provide an accepted release-manager exception review report, or set MIXLAB_DOCKER_LEGACY_ROLLBACK_EXCEPTION_APPROVAL only as an explicit fallback."
    }),
    gate({
      id: "nas-image-proof-accepted",
      title: "NAS current image proof is accepted",
      category: "image-proof",
      status: nasImageProofAcceptedForInputs ? "pass" : "blocked",
      evidence: proofAccepted
        ? "proof_accepted=true"
        : legacyRollbackExceptionReady
          ? `proof blocked by legacy latest; exception_accepted=${String(legacyRollbackExceptionAccepted)}`
          : `proof blockers=${proofBlockers.join(", ") || "unknown"}`,
      blocks_release_inputs: !nasImageProofAcceptedForInputs,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "NAS image proof must accept a stable current image tag for current and rollback inputs."
    }),
    gate({
      id: "nas-proof-does-not-approve-deploy",
      title: "NAS image proof does not approve deploy",
      category: "safety",
      status: proofDeployAllowed === true ? "fail" : proofDeployAllowed === false ? "pass" : "blocked",
      evidence: `nas_image_proof.docker_deploy_allowed=${String(proofDeployAllowed)}`,
      blocks_release_inputs: true,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "NAS image proof must remain evidence-only with docker_deploy_allowed=false."
    }),
    gate({
      id: "target-image-tag-present",
      title: "Target image tag is present",
      category: "release-input",
      status: target ? "pass" : "blocked",
      evidence: `target_image_tag=${target || "missing"}`,
      blocks_release_inputs: !target,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Pre-staging handoff must include release_input_request.target_image_tag."
    }),
    gate({
      id: "workflow-ref-pins-target-image",
      title: "Workflow ref pins the target candidate image",
      category: "release-input",
      status: workflowRefPinsTarget ? "pass" : "blocked",
      evidence: workflowRefPinsTarget
        ? `workflow_ref=${workflowRef}, target=${target}`
        : `workflow_ref=${workflowRef || "missing"}, expected=${expectedWorkflowRef}`,
      blocks_release_inputs: !workflowRefPinsTarget,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Use a release tag named admin-docker-candidate-<target SHA> so workflow_dispatch --ref cannot drift with the branch."
    }),
    gate({
      id: "release-ref-setup-command-ready",
      title: "Release ref setup command pins candidate SHA",
      category: "release-input",
      status: releaseRefSetupReady ? "pass" : "blocked",
      evidence: releaseRefSetupReady ? releaseRefSetupCommand : "Release ref setup command is missing or still contains placeholders.",
      blocks_release_inputs: !releaseRefSetupReady,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Pre-staging handoff must provide a reproducible git tag + push command for the candidate release ref."
    }),
    gate({
      id: "current-and-rollback-tags-present",
      title: "Current and rollback tags are present",
      category: "release-input",
      status: current && rollback ? "pass" : "blocked",
      evidence: `current=${current || "missing"}, rollback=${rollback || "missing"}`,
      blocks_release_inputs: !(current && rollback),
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "NAS image proof must provide current_image_tag and rollback_image_tag."
    }),
    gate({
      id: "rollback-tag-matches-current",
      title: "Rollback tag matches current deployed tag",
      category: "release-input",
      status: rollbackMatchesCurrent ? "pass" : "blocked",
      evidence: `current=${current || "missing"}, rollback=${rollback || "missing"}`,
      blocks_release_inputs: !rollbackMatchesCurrent,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Rollback tag must match current image tag for the first Admin Docker update."
    }),
    gate({
      id: "target-tag-differs-from-current",
      title: "Target tag differs from current deployed tag",
      category: "release-input",
      status: targetDiffers ? "pass" : "blocked",
      evidence: `target=${target || "missing"}, current=${current || "missing"}`,
      blocks_release_inputs: !targetDiffers,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Target image tag must differ from the currently deployed Admin Docker tag."
    }),
    gate({
      id: "workflow-command-has-no-placeholders",
      title: "Workflow command has concrete image tags",
      category: "release-input",
      status: commandHasNoPlaceholders ? "pass" : "blocked",
      evidence: commandHasNoPlaceholders ? command : "Workflow command still contains placeholders.",
      blocks_release_inputs: !commandHasNoPlaceholders,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "Provide accepted NAS image proof before generating the workflow command."
    }),
    gate({
      id: "explicit-release-approval-required",
      title: "Explicit release approval is still required",
      category: "release-decision",
      status: "blocked",
      evidence: "This report prepares release inputs only; it is not approval to run push_images=true.",
      blocks_release_inputs: false,
      blocks_push_execution: true,
      blocks_docker_deploy: true,
      required_evidence: "A separate human release decision must explicitly authorize running the generated push_images=true command."
    })
  ];
  const summary = summarize(gates);
  const releaseInputsReady = summary.failed === 0 && summary.release_input_blockers.length === 0;

  return {
    schema_version: "1.0",
    generated_at: input.generated_at,
    command: input.command,
    mode: "admin-docker-release-inputs",
    sources: {
      prestaging_handoff_report: input.prestaging_handoff_report_path ?? "",
      candidate_ref_proof_report: input.candidate_ref_proof_report_path ?? "",
      nas_image_proof_report: input.nas_image_proof_report_path ?? "",
      legacy_rollback_plan_report: input.legacy_rollback_plan_report_path ?? "",
      legacy_rollback_exception_review_report: input.legacy_rollback_exception_review_report_path ?? ""
    },
    release_inputs_ready: releaseInputsReady,
    push_execution_allowed: false,
    docker_deploy_allowed: false,
    release_decision_required: true,
    inputs: {
      target_image_tag: releaseInputsReady ? target : "",
      current_image_tag: releaseInputsReady ? current : "",
      rollback_image_tag: releaseInputsReady ? rollback : "",
      branch,
      workflow_ref: releaseInputsReady ? workflowRef : "",
      release_ref_setup_command: releaseInputsReady ? releaseRefSetupCommand : "",
      workflow_dispatch_command: releaseInputsReady ? command : ""
    },
    observations: {
      handoff_ready_to_request_release_inputs: handoffReady,
      handoff_staging_execution_ready: handoffStagingReady,
      handoff_docker_deploy_allowed: handoffDeployAllowed,
      handoff_staging_execution_blockers: handoffStagingExecutionBlockers,
      handoff_docker_deploy_blockers: handoffDockerDeployBlockers,
      candidate_ref_proof_accepted: candidateRefProofAccepted,
      candidate_ref_proof_docker_deploy_allowed: candidateRefDeployAllowed,
      candidate_ref_expected_sha: candidateRefExpectedSha,
      candidate_ref_expected_tag: candidateRefExpectedTag,
      candidate_ref_github_run_url: candidateRefGithubRunUrl,
      candidate_ref_blockers: candidateRefBlockers,
      nas_image_proof_accepted: proofAccepted,
      nas_image_proof_docker_deploy_allowed: proofDeployAllowed,
      nas_image_proof_blockers: proofBlockers,
      legacy_rollback_plan_ready: legacyRollbackPlanReady,
      legacy_rollback_release_execution_allowed: legacyRollbackReleaseAllowed,
      legacy_rollback_docker_deploy_allowed: legacyRollbackDeployAllowed,
      legacy_rollback_current_image_tag: legacyRollbackCurrentTag,
      legacy_rollback_target_image_tag: legacyRollbackTargetTag,
      legacy_rollback_exception_approval: legacyRollbackExceptionApproval ? "provided" : "",
      legacy_rollback_exception_review_accepted: legacyRollbackReviewAccepted,
      legacy_rollback_exception_review_role: legacyRollbackReviewRole,
      legacy_rollback_exception_review_blockers: legacyRollbackReviewBlockers,
      legacy_rollback_exception_ready: legacyRollbackExceptionReady,
      legacy_rollback_exception_accepted: legacyRollbackExceptionAccepted,
      legacy_rollback_exception_blockers: legacyRollbackExceptionBlockers,
      target_differs_from_current: targetDiffers,
      rollback_matches_current: rollbackMatchesCurrent
    },
    gates,
    summary,
    next_actions: nextActions({
      release_inputs_ready: releaseInputsReady,
      workflow_dispatch_command: command,
      release_ref_setup_command: releaseRefSetupCommand,
      release_input_blockers: summary.release_input_blockers,
      staging_execution_blockers: handoffStagingExecutionBlockers,
      legacy_rollback_exception_ready: legacyRollbackExceptionReady,
      legacy_rollback_exception_accepted: legacyRollbackExceptionAccepted
    }),
    result: {
      status: summary.failed > 0
        ? "failed"
        : releaseInputsReady
          ? "ready-for-release-decision"
          : "blocked",
      summary: releaseInputsReady
        ? "Release inputs are complete and ready for a separate explicit push_images=true release decision."
        : "Release inputs are blocked until pre-staging handoff, candidate-ref proof, NAS image proof, and any required legacy rollback exception review are accepted."
    },
    artifacts: null
  };
}

export function toMarkdown(report: AdminDockerReleaseInputsReport): string {
  const lines = [
    "# Admin Docker Release Inputs",
    "",
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Result: ${report.result.status}`,
    `Release inputs ready: ${report.release_inputs_ready ? "yes" : "no"}`,
    "Push execution allowed: no",
    "Docker deploy allowed: no",
    "Release decision required: yes",
    "",
    "## Sources",
    "",
    `- Pre-staging handoff: ${report.sources.prestaging_handoff_report || "<missing>"}`,
    `- Candidate ref proof: ${report.sources.candidate_ref_proof_report || "<missing>"}`,
    `- NAS image proof: ${report.sources.nas_image_proof_report || "<missing>"}`,
    `- Legacy rollback plan: ${report.sources.legacy_rollback_plan_report || "<not provided>"}`,
    `- Legacy rollback exception review: ${report.sources.legacy_rollback_exception_review_report || "<not provided>"}`,
    "",
    "## Workflow Inputs",
    "",
    `- target_image_tag: ${report.inputs.target_image_tag || "<blocked>"}`,
    `- current_image_tag: ${report.inputs.current_image_tag || "<blocked>"}`,
    `- rollback_image_tag: ${report.inputs.rollback_image_tag || "<blocked>"}`,
    `- branch: ${report.inputs.branch || "<blocked>"}`,
    `- workflow_ref: ${report.inputs.workflow_ref || "<blocked>"}`,
    `- release_ref_setup_command: ${report.inputs.release_ref_setup_command || "<blocked>"}`,
    `- command: ${report.inputs.workflow_dispatch_command || "<blocked>"}`,
    "",
    "## Gates",
    "",
    "| Gate | Category | Status | Blocks Inputs | Blocks Push | Blocks Deploy | Evidence |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.gates.map((item) => [
      item.id,
      item.category,
      item.status,
      item.blocks_release_inputs ? "yes" : "no",
      item.blocks_push_execution ? "yes" : "no",
      item.blocks_docker_deploy ? "yes" : "no",
      item.evidence.replace(/\|/g, "/")
    ].join(" | ")),
    "",
    "## Summary",
    "",
    `- Release input blockers: ${report.summary.release_input_blockers.join(", ") || "none"}`,
    `- Push execution blockers: ${report.summary.push_execution_blockers.join(", ") || "none"}`,
    `- Docker deploy blockers: ${report.summary.docker_deploy_blockers.join(", ") || "none"}`,
    `- Handoff staging execution blockers: ${report.observations.handoff_staging_execution_blockers.join(", ") || "none"}`,
    `- Candidate ref blockers: ${report.observations.candidate_ref_blockers.join(", ") || "none"}`,
    `- Legacy rollback exception: ready=${String(report.observations.legacy_rollback_exception_ready)}, accepted=${String(report.observations.legacy_rollback_exception_accepted)}, review_accepted=${String(report.observations.legacy_rollback_exception_review_accepted)}, review_role=${report.observations.legacy_rollback_exception_review_role || "none"}, blockers=${report.observations.legacy_rollback_exception_blockers.join(", ") || "none"}`,
    "",
    "## Next Actions",
    "",
    ...report.next_actions.map((item) => `- ${item}`),
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.json_path ?? "<not written>"}`,
    `- Markdown: ${report.artifacts?.markdown_path ?? "<not written>"}`,
    ""
  ];

  return lines.join("\n");
}

async function optionalLoadJson(filePath: string | undefined): Promise<unknown> {
  if (!filePath) {
    return undefined;
  }

  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

export async function runAdminDockerReleaseInputs(input: {
  prestaging_handoff_report_path?: string;
  candidate_ref_proof_report_path?: string;
  nas_image_proof_report_path?: string;
  legacy_rollback_plan_report_path?: string;
  legacy_rollback_exception_review_report_path?: string;
  legacy_rollback_exception_approval?: string;
  output_dir?: string;
  generated_at?: string;
  command?: string;
}): Promise<AdminDockerReleaseInputsReport> {
  const generatedAt = input.generated_at ?? new Date().toISOString();
  const outputDir = input.output_dir ?? DEFAULT_OUTPUT_DIR;
  const report = buildAdminDockerReleaseInputsReport({
    generated_at: generatedAt,
    command: input.command ?? process.argv.join(" "),
    prestaging_handoff_report_path: input.prestaging_handoff_report_path,
    prestaging_handoff_report: await optionalLoadJson(input.prestaging_handoff_report_path),
    candidate_ref_proof_report_path: input.candidate_ref_proof_report_path,
    candidate_ref_proof_report: await optionalLoadJson(input.candidate_ref_proof_report_path),
    nas_image_proof_report_path: input.nas_image_proof_report_path,
    nas_image_proof_report: await optionalLoadJson(input.nas_image_proof_report_path),
    legacy_rollback_plan_report_path: input.legacy_rollback_plan_report_path,
    legacy_rollback_plan_report: await optionalLoadJson(input.legacy_rollback_plan_report_path),
    legacy_rollback_exception_review_report_path: input.legacy_rollback_exception_review_report_path,
    legacy_rollback_exception_review_report: await optionalLoadJson(input.legacy_rollback_exception_review_report_path),
    legacy_rollback_exception_approval: input.legacy_rollback_exception_approval
  });
  const timestamp = timestampForFile(new Date(generatedAt));
  const jsonPath = path.join(outputDir, `admin-docker-release-inputs-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `admin-docker-release-inputs-${timestamp}.md`);
  const reportWithArtifacts: AdminDockerReleaseInputsReport = {
    ...report,
    artifacts: {
      json_path: jsonPath,
      markdown_path: markdownPath
    }
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifacts, null, 2)}\n`);
  await writeFile(markdownPath, toMarkdown(reportWithArtifacts));

  return reportWithArtifacts;
}

async function main(): Promise<void> {
  const report = await runAdminDockerReleaseInputs({
    prestaging_handoff_report_path: process.env.MIXLAB_ADMIN_DOCKER_PRESTAGING_HANDOFF_REPORT ?? process.argv[2],
    candidate_ref_proof_report_path: process.env.MIXLAB_ADMIN_DOCKER_CANDIDATE_REF_PROOF_REPORT ?? process.argv[3],
    nas_image_proof_report_path: process.env.MIXLAB_ADMIN_DOCKER_NAS_IMAGE_PROOF_REPORT ?? process.argv[4],
    legacy_rollback_plan_report_path: process.env.MIXLAB_ADMIN_DOCKER_LEGACY_ROLLBACK_PLAN_REPORT ?? process.argv[5],
    legacy_rollback_exception_review_report_path: process.env.MIXLAB_ADMIN_DOCKER_LEGACY_ROLLBACK_EXCEPTION_REVIEW_REPORT ?? process.argv[6],
    legacy_rollback_exception_approval: process.env.MIXLAB_DOCKER_LEGACY_ROLLBACK_EXCEPTION_APPROVAL,
    output_dir: process.env.MIXLAB_ACCEPTANCE_OUTPUT_DIR,
    command: process.argv.join(" ")
  });

  console.log(JSON.stringify({
    mode: report.mode,
    status: report.result.status,
    release_inputs_ready: report.release_inputs_ready,
    push_execution_allowed: report.push_execution_allowed,
    docker_deploy_allowed: report.docker_deploy_allowed,
    target_image_tag: report.inputs.target_image_tag,
    current_image_tag: report.inputs.current_image_tag,
    rollback_image_tag: report.inputs.rollback_image_tag,
    workflow_dispatch_command: report.inputs.workflow_dispatch_command,
    legacy_rollback_exception_ready: report.observations.legacy_rollback_exception_ready,
    legacy_rollback_exception_accepted: report.observations.legacy_rollback_exception_accepted,
    legacy_rollback_exception_review_accepted: report.observations.legacy_rollback_exception_review_accepted,
    release_input_blockers: report.summary.release_input_blockers,
    push_execution_blockers: report.summary.push_execution_blockers,
    json_path: report.artifacts?.json_path,
    markdown_path: report.artifacts?.markdown_path
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
