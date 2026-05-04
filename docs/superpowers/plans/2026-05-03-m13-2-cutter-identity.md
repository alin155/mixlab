# M13.2 Cutter Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cutter login identity explicit, stable, and testable by using username plus local device token plus backend session token, while treating IP only as audit data.

**Architecture:** Keep the existing Cutter API login flow and localStorage session model. Extend device metadata with optional audit fields, improve client device naming, and make the admin cutter-user page explain and display identity clearly.

**Tech Stack:** TypeScript, React, Node HTTP server, node:test, local JSON storage in `.mixlab-library/cutter-users/users.json`.

---

### Task 1: Document And Lock Device Identity Copy

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/cutter-app.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/app/CutterApp.tsx`
- Modify: `/Users/allen/Documents/mixlab/apps/cutter-web/src/features/login/CutterLoginGate.tsx`

- [x] **Step 1: Write failing tests** for friendly device name generation and login gate identity copy.
- [x] **Step 2: Run focused cutter app tests** and confirm they fail.
- [x] **Step 3: Implement device name helper and login gate copy**.
- [x] **Step 4: Re-run focused cutter app tests** and confirm pass.

### Task 2: Store Device Audit Metadata Without Using IP As Identity

**Files:**
- Modify: `/Users/allen/Documents/mixlab/packages/library-fs/src/cutter-users.test.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/library-fs/src/cutter-users.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.test.ts`
- Modify: `/Users/allen/Documents/mixlab/packages/cutter-api/src/index.ts`

- [x] **Step 1: Write failing storage tests** for `last_ip_address` and `user_agent` on login applications.
- [x] **Step 2: Run storage tests** and confirm they fail.
- [x] **Step 3: Implement optional device audit fields** in validation and mutation.
- [x] **Step 4: Write failing API test** proving request IP/User-Agent are captured but auth still uses device/session headers.
- [x] **Step 5: Run API test** and confirm it fails.
- [x] **Step 6: Implement API audit extraction** from request headers/socket.
- [x] **Step 7: Re-run storage and API tests**.

### Task 3: Make Admin User Page Explain Identity Clearly

**Files:**
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/admin-app.test.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/api.ts`
- Modify: `/Users/allen/Documents/mixlab/apps/admin-web/src/features/cutter-users/CutterUsersPage.tsx`

- [x] **Step 1: Write failing admin render test** for identity model copy, device short ID, audit IP, and no raw long browser string in the main table.
- [x] **Step 2: Run admin app tests** and confirm failure.
- [x] **Step 3: Implement admin page presentation**.
- [x] **Step 4: Re-run admin app tests**.

### Task 4: Verify M13.2

**Files:**
- Read only unless failures require fixes.

- [x] **Step 1: Run focused test files** for cutter app, cutter API, library-fs cutter users, and admin app.
- [x] **Step 2: Run `npm run typecheck`**.
- [x] **Step 3: Run `npm test`**.
- [x] **Step 4: Run `npm run build:cutter-web` and `npm run build:admin-web`**.
- [x] **Step 5: Run `git diff --check`**.
