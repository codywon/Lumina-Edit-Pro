# Tauri Native Shell Core Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tauri v2 native desktop shell and Rust backend skeleton while keeping the existing React/Vite app functional.

**Architecture:** The current React app remains the UI. Tauri is introduced as a native backend under `src-tauri`, and all frontend-native communication is isolated behind `src/services/native` so UI components do not call Tauri APIs directly.

**Tech Stack:** React 19, Vite 6, TypeScript, Tauri v2, Rust, Cargo.

---

## Scope

This plan implements Phase 1 from `docs/superpowers/specs/2026-05-13-tauri-native-first-productization-design.md`.

Included:

- Add Tauri project structure.
- Add Tauri npm scripts.
- Add minimal Rust command modules.
- Add typed frontend native service wrapper.
- Add capability configuration.
- Add app identity and build configuration.
- Verify existing web lint/tests remain usable.

Excluded from Phase 1:

- Native workspace filesystem migration.
- SQLite storage implementation.
- OS keyring integration.
- Backend AI requests.
- Task runtime.
- Diff review.
- Updater and release packaging.

Those are separate implementation plans because each subsystem can be built and tested independently.

## File Structure

Create:

- `src-tauri/Cargo.toml`: Rust package and Tauri dependencies.
- `src-tauri/build.rs`: Tauri build hook.
- `src-tauri/tauri.conf.json`: desktop app configuration.
- `src-tauri/capabilities/main.json`: initial minimal window capability.
- `src-tauri/src/main.rs`: Tauri entrypoint.
- `src-tauri/src/app_state.rs`: shared backend application state.
- `src-tauri/src/commands/mod.rs`: command module registry.
- `src-tauri/src/commands/app.rs`: app metadata and health commands.
- `src/services/native/types.ts`: native service types.
- `src/services/native/environment.ts`: Tauri runtime detection.
- `src/services/native/client.ts`: safe wrapper around Tauri `invoke`.
- `src/services/native/index.ts`: public exports.

Modify:

- `package.json`: add Tauri scripts and npm packages.
- `vite.config.ts`: keep port 3000 and make it compatible with Tauri dev.
- `src/App.tsx`: no required Phase 1 change.
- `src/main.tsx`: no required Phase 1 change.

## Task 1: Add Tauri npm scripts and dependencies

**Files:**

- Modify: `D:\Lumina-Edit-Pro\package.json`

- [ ] **Step 1: Install JavaScript dependencies**

Run:

```powershell
npm install @tauri-apps/api
npm install -D @tauri-apps/cli
```

Expected:

```txt
added ... packages
found 0 vulnerabilities
```

If network access is blocked by the sandbox, rerun the same install commands with escalated permissions.

- [ ] **Step 2: Update scripts in `package.json`**

Change the `scripts` block to include desktop commands:

```json
{
  "dev": "vite --port=3000 --host=0.0.0.0",
  "build": "vite build",
  "preview": "vite preview",
  "clean": "rm -rf dist",
  "lint": "tsc --noEmit",
  "test": "vitest run --environment jsdom",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build"
}
```

- [ ] **Step 3: Verify package scripts**

Run:

```powershell
npm run lint
```

Expected:

```txt
> react-example@0.0.0 lint
> tsc --noEmit
```

The command should exit with code `0`.

- [ ] **Step 4: Commit**

Run:

```powershell
git add package.json package-lock.json
git commit -m "chore: add tauri npm scripts"
```

Expected:

```txt
[branch ...] chore: add tauri npm scripts
```

## Task 2: Add Tauri Rust project skeleton

**Files:**

- Create: `D:\Lumina-Edit-Pro\src-tauri\Cargo.toml`
- Create: `D:\Lumina-Edit-Pro\src-tauri\build.rs`
- Create: `D:\Lumina-Edit-Pro\src-tauri\tauri.conf.json`
- Create: `D:\Lumina-Edit-Pro\src-tauri\capabilities\main.json`
- Create: `D:\Lumina-Edit-Pro\src-tauri\src\main.rs`

- [ ] **Step 1: Create `src-tauri/Cargo.toml`**

Write:

```toml
[package]
name = "lumina-edit-pro"
version = "0.1.0"
description = "Local-first AI Markdown workspace"
authors = ["Lumina Edit Pro"]
edition = "2021"

[lib]
name = "lumina_edit_pro_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri = { version = "2", features = [] }
thiserror = "2"
```

- [ ] **Step 2: Create `src-tauri/build.rs`**

Write:

```rust
fn main() {
    tauri_build::build();
}
```

- [ ] **Step 3: Create `src-tauri/tauri.conf.json`**

Write:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Lumina Edit Pro",
  "version": "0.1.0",
  "identifier": "com.luminaedit.pro",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:3000",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Lumina Edit Pro",
        "width": 1440,
        "height": 960,
        "minWidth": 1024,
        "minHeight": 720,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": []
  }
}
```

- [ ] **Step 4: Create `src-tauri/capabilities/main.json`**

Write:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-capability",
  "description": "Initial capability for the main Lumina Edit Pro window",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

- [ ] **Step 5: Create minimal `src-tauri/src/main.rs`**

Write:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("failed to run Lumina Edit Pro");
}
```

- [ ] **Step 6: Verify Rust metadata**

Run:

```powershell
cd src-tauri
cargo metadata --format-version 1
```

Expected:

```txt
{"packages":[...
```

The command should exit with code `0`.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src-tauri
git commit -m "chore: add tauri rust skeleton"
```

Expected:

```txt
[branch ...] chore: add tauri rust skeleton
```

## Task 3: Add backend app state and command module

**Files:**

- Create: `D:\Lumina-Edit-Pro\src-tauri\src\app_state.rs`
- Create: `D:\Lumina-Edit-Pro\src-tauri\src\commands\mod.rs`
- Create: `D:\Lumina-Edit-Pro\src-tauri\src\commands\app.rs`
- Modify: `D:\Lumina-Edit-Pro\src-tauri\src\main.rs`

- [ ] **Step 1: Create `src-tauri/src/app_state.rs`**

Write:

```rust
use std::sync::Mutex;

#[derive(Debug, Default)]
pub struct AppState {
    startup_status: Mutex<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            startup_status: Mutex::new("ready".to_string()),
        }
    }

    pub fn startup_status(&self) -> String {
        self.startup_status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| "state-lock-error".to_string())
    }
}
```

- [ ] **Step 2: Create `src-tauri/src/commands/app.rs`**

Write:

```rust
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::app_state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppHealth {
    pub app_name: String,
    pub version: String,
    pub status: String,
}

#[tauri::command]
pub fn app_health(app: AppHandle, state: State<'_, AppState>) -> AppHealth {
    let package_info = app.package_info();

    AppHealth {
        app_name: package_info.name.clone(),
        version: package_info.version.to_string(),
        status: state.startup_status(),
    }
}
```

- [ ] **Step 3: Create `src-tauri/src/commands/mod.rs`**

Write:

```rust
pub mod app;
```

- [ ] **Step 4: Update `src-tauri/src/main.rs`**

Replace the file with:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_state;
mod commands;

use app_state::AppState;
use commands::app::app_health;

fn main() {
    tauri::Builder::default()
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![app_health])
        .run(tauri::generate_context!())
        .expect("failed to run Lumina Edit Pro");
}
```

- [ ] **Step 5: Run Rust check**

Run:

```powershell
cd src-tauri
cargo check
```

Expected:

```txt
Finished `dev` profile ...
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src-tauri/src
git commit -m "feat: add native app health command"
```

Expected:

```txt
[branch ...] feat: add native app health command
```

## Task 4: Add typed frontend native service

**Files:**

- Create: `D:\Lumina-Edit-Pro\src\services\native\types.ts`
- Create: `D:\Lumina-Edit-Pro\src\services\native\environment.ts`
- Create: `D:\Lumina-Edit-Pro\src\services\native\client.ts`
- Create: `D:\Lumina-Edit-Pro\src\services\native\index.ts`
- Test: `D:\Lumina-Edit-Pro\src\services\native\environment.test.ts`

- [ ] **Step 1: Create `src/services/native/types.ts`**

Write:

```ts
export interface NativeAppHealth {
  appName: string;
  version: string;
  status: string;
}

export interface NativeInvokeClient {
  appHealth(): Promise<NativeAppHealth>;
}
```

- [ ] **Step 2: Create `src/services/native/environment.ts`**

Write:

```ts
export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
```

- [ ] **Step 3: Create `src/services/native/client.ts`**

Write:

```ts
import type { NativeAppHealth, NativeInvokeClient } from './types';
import { isTauriRuntime } from './environment';

async function loadInvoke() {
  const api = await import('@tauri-apps/api/core');
  return api.invoke;
}

export function createNativeClient(): NativeInvokeClient {
  return {
    async appHealth(): Promise<NativeAppHealth> {
      if (!isTauriRuntime()) {
        return {
          appName: 'Lumina Edit Pro',
          version: 'web',
          status: 'browser-runtime',
        };
      }

      const invoke = await loadInvoke();
      return await invoke<NativeAppHealth>('app_health');
    },
  };
}

export const nativeClient = createNativeClient();
```

- [ ] **Step 4: Create `src/services/native/index.ts`**

Write:

```ts
export { createNativeClient, nativeClient } from './client';
export { isTauriRuntime } from './environment';
export type { NativeAppHealth, NativeInvokeClient } from './types';
```

- [ ] **Step 5: Create `src/services/native/environment.test.ts`**

Write:

```ts
import { describe, expect, it } from 'vitest';
import { isTauriRuntime } from './environment';

describe('isTauriRuntime', () => {
  it('returns false in the jsdom test environment', () => {
    expect(isTauriRuntime()).toBe(false);
  });
});
```

- [ ] **Step 6: Run the focused frontend test**

Run:

```powershell
npm test -- src/services/native/environment.test.ts
```

Expected:

```txt
PASS src/services/native/environment.test.ts
```

- [ ] **Step 7: Run TypeScript lint**

Run:

```powershell
npm run lint
```

Expected:

```txt
tsc --noEmit
```

The command should exit with code `0`.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/services/native
git commit -m "feat: add native frontend service client"
```

Expected:

```txt
[branch ...] feat: add native frontend service client
```

## Task 5: Verify desktop development boot

**Files:**

- No source file changes expected.

- [ ] **Step 1: Run Tauri development app**

Run:

```powershell
npm run tauri:dev
```

Expected:

```txt
> react-example@0.0.0 tauri:dev
> tauri dev
```

The Vite dev server should start on `http://localhost:3000`, and the Tauri desktop window should open with the existing Lumina Edit Pro UI.

- [ ] **Step 2: Stop the development app**

Press:

```txt
Ctrl+C
```

Expected:

```txt
Terminate batch job
```

Confirm termination.

- [ ] **Step 3: Run production frontend build**

Run:

```powershell
npm run build
```

Expected:

```txt
vite build
✓ built
```

- [ ] **Step 4: Run Tauri build check**

Run:

```powershell
npm run tauri:build
```

Expected:

```txt
> react-example@0.0.0 tauri:build
> tauri build
```

The command should compile the Rust backend and produce a desktop bundle or fail only for missing platform-specific signing/installer prerequisites.

- [ ] **Step 5: Commit if build configuration changes were required**

If no source changes were required, do not create a commit.

If a small configuration fix was required, run:

```powershell
git add src-tauri package.json package-lock.json vite.config.ts
git commit -m "fix: align tauri desktop build configuration"
```

Expected:

```txt
[branch ...] fix: align tauri desktop build configuration
```

## Task 6: Document Phase 1 completion and next phase boundary

**Files:**

- Create: `D:\Lumina-Edit-Pro\docs\tauri-productization.md`

- [ ] **Step 1: Create `docs/tauri-productization.md`**

Write:

```markdown
# Tauri Productization

Lumina Edit Pro is being productized as a native-first desktop application using Tauri v2.

## Current Phase

Phase 1 establishes the native shell and backend skeleton:

- Tauri v2 desktop window.
- Rust application entrypoint.
- Minimal native command module.
- Frontend service wrapper for native calls.
- Initial capability configuration.

## Architecture Rule

React components must not call Tauri APIs directly. Frontend-native communication goes through `src/services`.

## Next Phase

Phase 2 migrates workspace and file operations from browser APIs to Rust-backed services:

- Open workspace directory.
- List Markdown files.
- Read and write files.
- Create files and directories.
- Insert image assets.
- Autosave through backend file writes.
```

- [ ] **Step 2: Commit**

Run:

```powershell
git add docs/tauri-productization.md
git commit -m "docs: describe tauri productization phase one"
```

Expected:

```txt
[branch ...] docs: describe tauri productization phase one
```

## Verification

Run these commands after all tasks:

```powershell
npm run lint
npm test
npm run build
```

Expected:

```txt
tsc --noEmit
vitest run --environment jsdom
vite build
```

All commands should exit with code `0`.

Then run:

```powershell
npm run tauri:dev
```

Expected:

```txt
Tauri desktop window opens and renders the existing app.
```

## Self-Review

Spec coverage:

- Phase 1 native shell is covered by Tasks 1, 2, and 5.
- Rust command skeleton is covered by Task 3.
- Frontend service SDK boundary is covered by Task 4.
- Documentation of architecture rules and next phase is covered by Task 6.

Placeholder scan:

- The plan contains no placeholder tasks. Deferred subsystems are explicitly excluded and named as future plans.

Type consistency:

- Rust command name is `app_health`.
- Frontend method name is `appHealth`.
- Returned JSON fields are camelCase through Serde and match `NativeAppHealth`.
