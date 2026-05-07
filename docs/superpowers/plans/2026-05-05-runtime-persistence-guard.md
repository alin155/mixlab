# Runtime Persistence Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent MixLab admin/cutter production runtimes from using temporary directories that disappear after reboot.

**Architecture:** Add a small runtime-config guard for temporary paths. Server entrypoints call the guard before listening. Documentation defines dev and packaged-app persistent directory policy.

**Tech Stack:** Node.js, TypeScript, node:test, npm scripts.

---

### Task 1: Runtime Path Guard

**Files:**
- Create: `packages/runtime-config/src/persistence.ts`
- Modify: `packages/runtime-config/src/index.ts`
- Test: `packages/runtime-config/src/persistence.test.ts`

- [x] Write failing tests for `/tmp` rejection and explicit test-only override.
- [x] Implement temporary path detection and Chinese error messaging.
- [x] Run focused runtime-config tests.

### Task 2: Server Entrypoint Protection

**Files:**
- Modify: `scripts/servers/admin-api-server.ts`
- Modify: `scripts/servers/cutter-api-server.ts`
- Modify: `packages/cutter-api/src/server-script.test.ts`

- [x] Write failing script contract tests.
- [x] Add guard calls before API servers listen.
- [x] Run script contract tests.

### Task 3: App Packaging Persistence Policy

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [x] Document that formal public libraries and cutter workspaces must live in persistent user-selected or app-support directories.
- [x] Document that `/tmp` is allowed only for automated tests with explicit opt-in.

### Task 4: Verification

- [x] Run focused tests.
- [x] Run typecheck.
- [x] Restart local admin/cutter services and verify ports/API/frontend entries.
