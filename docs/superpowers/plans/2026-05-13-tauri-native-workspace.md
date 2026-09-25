# Tauri Native Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move workspace open, file tree, Markdown file read/write, image asset writes, and autosave from browser-only APIs to Rust-backed Tauri workspace services while preserving the browser fallback.

**Architecture:** The frontend keeps the current workspace UI and routes workspace actions through `src/lib/fileSystem.ts` plus new service modules. In Tauri runtime, `fileSystem.ts` delegates to `src/services/workspace`, which calls Rust commands that own workspace roots, path validation, recursive scanning, text decoding, and atomic writes. Browser mode keeps the existing File System Access API and input fallback behavior.

**Tech Stack:** React 19, TypeScript, Vite, Vitest/jsdom, Tauri v2, Rust std filesystem APIs, Serde.

---

## Phase Boundary

Do not start Phase 2 implementation until Phase 1 is committed or explicitly accepted as the current base. Phase 1 files currently expected as base:

- `src-tauri/**`
- `src/services/native/**`
- Tauri npm dependencies and scripts in `package.json` / `package-lock.json`
- `docs/tauri-productization.md`

If Phase 1 is not committed, Task 1 may still be performed, but all commits must include only the files named in each task.

## Scope

Included:

- Native workspace root registration in Rust.
- Safe relative path resolution inside the active workspace.
- Recursive Markdown file tree scanning.
- Native read/write/create/rename/delete commands.
- Atomic text writes.
- Native image asset writes from selected `File` objects.
- Frontend workspace service SDK.
- `fileSystem.ts` Tauri adapter while preserving browser fallback.
- Minimal `App.tsx` integration for direct operations that currently use browser directory handles.

Excluded:

- SQLite workspace persistence. Phase 2 may keep the latest workspace in process memory only; durable recent workspace storage belongs to Phase 3.
- File watching.
- Full-text indexing beyond current frontend search.
- Native shell open-in-file-manager behavior.
- AI task/diff review.
- Replacing all `App.tsx` workspace helper code with smaller feature modules.

## File Structure

Create:

- `src-tauri/src/core/mod.rs`: core module registry.
- `src-tauri/src/core/workspace/mod.rs`: Rust workspace engine public module.
- `src-tauri/src/core/workspace/types.rs`: serializable workspace types.
- `src-tauri/src/core/workspace/security.rs`: root-relative path validation helpers.
- `src-tauri/src/core/workspace/fs_ops.rs`: scan/read/write/create/rename/delete helpers.
- `src-tauri/src/commands/workspace.rs`: Tauri command layer for workspace operations.
- `src/services/workspace/types.ts`: frontend workspace service types.
- `src/services/workspace/client.ts`: Tauri workspace client.
- `src/services/workspace/index.ts`: public service exports.
- `src/services/workspace/nativeHandle.ts`: native handle helpers used by `fileSystem.ts` and `App.tsx`.
- `src/services/workspace/nativeHandle.test.ts`: unit tests for native handle detection.

Modify:

- `src-tauri/src/app_state.rs`: store active workspace state.
- `src-tauri/src/commands/mod.rs`: register workspace commands module.
- `src-tauri/src/lib.rs`: register workspace command handlers.
- `src-tauri/capabilities/main.json`: keep only needed core permissions for command invocation.
- `src/lib/fileSystem.ts`: route workspace operations to native service in Tauri runtime.
- `src/lib/fileSystem.test.ts`: cover native handle branches without breaking browser tests.
- `src/lib/workspacePersistence.ts`: return `null` in Tauri runtime until Phase 3 persistence exists.
- `src/App.tsx`: replace direct browser handle-only workspace write operations with helper functions that support native handles.
- `docs/tauri-productization.md`: update Phase 2 status after implementation.

## Task 1: Ensure Phase 1 baseline is committed or isolated

**Files:**

- No code changes expected.

- [ ] **Step 1: Check worktree status**

Run:

```powershell
git -c safe.directory=D:/Lumina-Edit-Pro/.worktrees/tauri-native-shell status --short
```

Expected if Phase 1 is already committed:

```txt
```

Expected if Phase 1 is still uncommitted:

```txt
 M .gitignore
 M package-lock.json
 M package.json
 M src/components/Editor.tsx
?? docs/tauri-productization.md
?? src-tauri/
?? src/services/
```

- [ ] **Step 2: If Phase 1 is uncommitted, ask the controller to stop**

Report:

```txt
BLOCKED: Phase 1 is not committed. Ask the user to run:

cd D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell
git add .gitignore package.json package-lock.json src/components/Editor.tsx src/services/native docs/tauri-productization.md src-tauri
git commit -m "feat: add tauri native shell skeleton"
```

Do not implement Phase 2 code on top of an uncommitted Phase 1 diff unless the controller explicitly instructs you to proceed.

## Task 2: Add Rust workspace engine types and path security

**Files:**

- Create: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\src\core\mod.rs`
- Create: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\src\core\workspace\mod.rs`
- Create: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\src\core\workspace\types.rs`
- Create: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\src\core\workspace\security.rs`
- Modify: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\src\lib.rs`

- [ ] **Step 1: Create module registry**

Write `src-tauri/src/core/mod.rs`:

```rust
pub mod workspace;
```

- [ ] **Step 2: Create workspace module registry**

Write `src-tauri/src/core/workspace/mod.rs`:

```rust
pub mod fs_ops;
pub mod security;
pub mod types;
```

- [ ] **Step 3: Create serializable workspace types**

Write `src-tauri/src/core/workspace/types.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct WorkspaceState {
    pub id: String,
    pub name: String,
    pub root_path: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileEntry {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDirectoryEntry {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub path: String,
    pub children: Vec<WorkspaceEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum WorkspaceEntry {
    File(WorkspaceFileEntry),
    Directory(WorkspaceDirectoryEntry),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWorkspaceResponse {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub entries: Vec<WorkspaceEntry>,
    pub writable: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePathRequest {
    pub workspace_id: String,
    pub path: String,
}
```

- [ ] **Step 4: Create path security helpers**

Write `src-tauri/src/core/workspace/security.rs`:

```rust
use std::path::{Component, Path, PathBuf};

pub fn normalize_relative_path(path: &str) -> Result<PathBuf, String> {
    let normalized = path.replace('\\', "/");
    let mut result = PathBuf::new();

    for component in Path::new(&normalized).components() {
        match component {
            Component::Normal(value) => result.push(value),
            Component::CurDir => {}
            Component::ParentDir => return Err("Path cannot contain parent segments".to_string()),
            Component::RootDir | Component::Prefix(_) => {
                return Err("Path must be relative to the workspace".to_string());
            }
        }
    }

    Ok(result)
}

pub fn resolve_inside_workspace(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_relative_path(relative_path)?;
    let joined = root.join(normalized);
    let parent = joined.parent().unwrap_or(root);
    let canonical_parent = parent
        .canonicalize()
        .map_err(|error| format!("Failed to resolve parent directory: {error}"))?;
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Failed to resolve workspace root: {error}"))?;

    if !canonical_parent.starts_with(&canonical_root) {
        return Err("Path escapes the workspace root".to_string());
    }

    Ok(joined)
}
```

- [ ] **Step 5: Register `core` in `src-tauri/src/lib.rs`**

Add the module line near the top:

```rust
mod core;
```

- [ ] **Step 6: Run Rust metadata check**

Run:

```powershell
$env:CARGO_NET_OFFLINE='false'
$env:HTTP_PROXY=''
$env:HTTPS_PROXY=''
$env:ALL_PROXY=''
cargo metadata --format-version 1
```

Expected:

```txt
{"packages":[...
```

If crates.io access fails with schannel or offline errors, report it as an environment blocker and continue only if the controller approves.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src-tauri/src/core src-tauri/src/lib.rs
git commit -m "feat: add native workspace path model"
```

## Task 3: Add Rust filesystem operations

**Files:**

- Create: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\src\core\workspace\fs_ops.rs`

- [ ] **Step 1: Implement scan and sorting**

Write `src-tauri/src/core/workspace/fs_ops.rs`:

```rust
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use super::security::resolve_inside_workspace;
use super::types::{WorkspaceDirectoryEntry, WorkspaceEntry, WorkspaceFileEntry, WorkspaceState};

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

fn normalize_slashes(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn sort_entries(entries: &mut [WorkspaceEntry]) {
    entries.sort_by(|left, right| {
        let left_is_dir = matches!(left, WorkspaceEntry::Directory(_));
        let right_is_dir = matches!(right, WorkspaceEntry::Directory(_));
        if left_is_dir != right_is_dir {
            return right_is_dir.cmp(&left_is_dir);
        }

        let left_name = match left {
            WorkspaceEntry::File(entry) => &entry.name,
            WorkspaceEntry::Directory(entry) => &entry.name,
        };
        let right_name = match right {
            WorkspaceEntry::File(entry) => &entry.name,
            WorkspaceEntry::Directory(entry) => &entry.name,
        };

        left_name.to_lowercase().cmp(&right_name.to_lowercase())
    });
}

fn scan_directory(root: &Path, directory: &Path, relative: &Path) -> Result<Vec<WorkspaceEntry>, String> {
    let mut entries = Vec::new();

    for item in fs::read_dir(directory).map_err(|error| format!("Failed to read directory: {error}"))? {
        let item = item.map_err(|error| format!("Failed to read directory entry: {error}"))?;
        let file_type = item
            .file_type()
            .map_err(|error| format!("Failed to read file type: {error}"))?;
        let name = item.file_name().to_string_lossy().to_string();
        let entry_relative = relative.join(&name);
        let entry_path = item.path();

        if file_type.is_dir() {
            let children = scan_directory(root, &entry_path, &entry_relative)?;
            if !children.is_empty() {
                let id = normalize_slashes(&entry_relative);
                entries.push(WorkspaceEntry::Directory(WorkspaceDirectoryEntry {
                    id: id.clone(),
                    kind: "directory".to_string(),
                    name,
                    path: id,
                    children,
                }));
            }
            continue;
        }

        if file_type.is_file() && is_markdown_file(&entry_path) {
            let id = normalize_slashes(&entry_relative);
            entries.push(WorkspaceEntry::File(WorkspaceFileEntry {
                id: id.clone(),
                kind: "file".to_string(),
                name,
                path: id,
            }));
        }
    }

    sort_entries(&mut entries);
    let _ = root;
    Ok(entries)
}

pub fn scan_workspace(root: &Path) -> Result<Vec<WorkspaceEntry>, String> {
    scan_directory(root, root, Path::new(""))
}

pub fn read_workspace_file(workspace: &WorkspaceState, relative_path: &str) -> Result<String, String> {
    let path = resolve_inside_workspace(&workspace.root_path, relative_path)?;
    fs::read_to_string(path).map_err(|error| format!("Failed to read file: {error}"))
}

pub fn write_workspace_file(
    workspace: &WorkspaceState,
    relative_path: &str,
    content: &str,
) -> Result<(), String> {
    let path = resolve_inside_workspace(&workspace.root_path, relative_path)?;
    let parent = path.parent().ok_or_else(|| "File path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("Failed to create parent directory: {error}"))?;
    let temp_path = path.with_extension("tmp-lumina-write");

    {
        let mut file = fs::File::create(&temp_path)
            .map_err(|error| format!("Failed to create temporary file: {error}"))?;
        file.write_all(content.as_bytes())
            .map_err(|error| format!("Failed to write temporary file: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Failed to flush temporary file: {error}"))?;
    }

    fs::rename(&temp_path, &path).map_err(|error| format!("Failed to replace file: {error}"))?;
    Ok(())
}

pub fn create_workspace_directory(workspace: &WorkspaceState, relative_path: &str) -> Result<(), String> {
    let path = resolve_inside_workspace(&workspace.root_path, relative_path)?;
    fs::create_dir_all(path).map_err(|error| format!("Failed to create directory: {error}"))
}

pub fn rename_workspace_entry(
    workspace: &WorkspaceState,
    from_path: &str,
    to_path: &str,
) -> Result<(), String> {
    let from = resolve_inside_workspace(&workspace.root_path, from_path)?;
    let to = resolve_inside_workspace(&workspace.root_path, to_path)?;
    fs::rename(from, to).map_err(|error| format!("Failed to rename entry: {error}"))
}

pub fn delete_workspace_entry(workspace: &WorkspaceState, relative_path: &str) -> Result<(), String> {
    let path = resolve_inside_workspace(&workspace.root_path, relative_path)?;
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|error| format!("Failed to delete directory: {error}"))
    } else {
        fs::remove_file(path).map_err(|error| format!("Failed to delete file: {error}"))
    }
}

pub fn write_workspace_binary(
    workspace: &WorkspaceState,
    relative_path: &str,
    bytes: &[u8],
) -> Result<(), String> {
    let path = resolve_inside_workspace(&workspace.root_path, relative_path)?;
    let parent = path.parent().ok_or_else(|| "Asset path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("Failed to create asset directory: {error}"))?;
    fs::write(path, bytes).map_err(|error| format!("Failed to write asset: {error}"))
}
```

- [ ] **Step 2: Run Rust formatter**

Run:

```powershell
cargo fmt
```

Expected: no output and exit code `0`.

- [ ] **Step 3: Run Rust check**

Run:

```powershell
$env:CARGO_NET_OFFLINE='false'
$env:HTTP_PROXY=''
$env:HTTPS_PROXY=''
$env:ALL_PROXY=''
cargo check
```

Expected:

```txt
Finished `dev` profile ...
```

If Cargo network still fails, report the environment error.

- [ ] **Step 4: Commit**

Run:

```powershell
git add src-tauri/src/core/workspace/fs_ops.rs
git commit -m "feat: add native workspace filesystem operations"
```

## Task 4: Add Rust workspace commands

**Files:**

- Modify: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\src\app_state.rs`
- Create: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\src\commands\workspace.rs`
- Modify: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\src\commands\mod.rs`
- Modify: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\src\lib.rs`

- [ ] **Step 1: Extend AppState**

Update `src-tauri/src/app_state.rs` to:

```rust
use std::sync::Mutex;

use crate::core::workspace::types::WorkspaceState;

#[derive(Debug, Default)]
pub struct AppState {
    startup_status: Mutex<String>,
    workspace: Mutex<Option<WorkspaceState>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            startup_status: Mutex::new("ready".to_string()),
            workspace: Mutex::new(None),
        }
    }

    pub fn startup_status(&self) -> String {
        self.startup_status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| "state-lock-error".to_string())
    }

    pub fn set_workspace(&self, workspace: WorkspaceState) -> Result<(), String> {
        let mut guard = self
            .workspace
            .lock()
            .map_err(|_| "Workspace state lock failed".to_string())?;
        *guard = Some(workspace);
        Ok(())
    }

    pub fn workspace(&self, workspace_id: &str) -> Result<WorkspaceState, String> {
        let guard = self
            .workspace
            .lock()
            .map_err(|_| "Workspace state lock failed".to_string())?;
        let workspace = guard
            .as_ref()
            .ok_or_else(|| "No workspace is open".to_string())?;
        if workspace.id != workspace_id {
            return Err("Workspace id does not match the active workspace".to_string());
        }
        Ok(workspace.clone())
    }
}
```

- [ ] **Step 2: Add workspace commands**

Write `src-tauri/src/commands/workspace.rs`:

```rust
use std::path::PathBuf;

use serde::Deserialize;
use tauri::State;

use crate::app_state::AppState;
use crate::core::workspace::fs_ops::{
    create_workspace_directory, delete_workspace_entry, read_workspace_file, rename_workspace_entry,
    scan_workspace, write_workspace_binary, write_workspace_file,
};
use crate::core::workspace::types::{OpenWorkspaceResponse, WorkspaceEntry, WorkspaceState};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWorkspaceRequest {
    pub root_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceReadRequest {
    pub workspace_id: String,
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceWriteRequest {
    pub workspace_id: String,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCreateDirectoryRequest {
    pub workspace_id: String,
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRenameRequest {
    pub workspace_id: String,
    pub from_path: String,
    pub to_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDeleteRequest {
    pub workspace_id: String,
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceWriteBinaryRequest {
    pub workspace_id: String,
    pub path: String,
    pub bytes: Vec<u8>,
}

fn workspace_name_from_path(path: &PathBuf) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("本地工作区")
        .to_string()
}

#[tauri::command]
pub fn workspace_open(
    state: State<'_, AppState>,
    payload: OpenWorkspaceRequest,
) -> Result<OpenWorkspaceResponse, String> {
    let root_path = PathBuf::from(payload.root_path)
        .canonicalize()
        .map_err(|error| format!("Failed to open workspace path: {error}"))?;
    if !root_path.is_dir() {
        return Err("Workspace path must be a directory".to_string());
    }

    let id = root_path.to_string_lossy().to_string();
    let name = workspace_name_from_path(&root_path);
    let entries = scan_workspace(&root_path)?;
    let workspace = WorkspaceState {
        id: id.clone(),
        name: name.clone(),
        root_path: root_path.clone(),
    };
    state.set_workspace(workspace)?;

    Ok(OpenWorkspaceResponse {
        id,
        name,
        root_path: root_path.to_string_lossy().to_string(),
        entries,
        writable: true,
    })
}

#[tauri::command]
pub fn workspace_list_entries(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<Vec<WorkspaceEntry>, String> {
    let workspace = state.workspace(&workspace_id)?;
    scan_workspace(&workspace.root_path)
}

#[tauri::command]
pub fn workspace_read_file(
    state: State<'_, AppState>,
    payload: WorkspaceReadRequest,
) -> Result<String, String> {
    let workspace = state.workspace(&payload.workspace_id)?;
    read_workspace_file(&workspace, &payload.path)
}

#[tauri::command]
pub fn workspace_write_file(
    state: State<'_, AppState>,
    payload: WorkspaceWriteRequest,
) -> Result<(), String> {
    let workspace = state.workspace(&payload.workspace_id)?;
    write_workspace_file(&workspace, &payload.path, &payload.content)
}

#[tauri::command]
pub fn workspace_create_directory(
    state: State<'_, AppState>,
    payload: WorkspaceCreateDirectoryRequest,
) -> Result<(), String> {
    let workspace = state.workspace(&payload.workspace_id)?;
    create_workspace_directory(&workspace, &payload.path)
}

#[tauri::command]
pub fn workspace_rename_entry(
    state: State<'_, AppState>,
    payload: WorkspaceRenameRequest,
) -> Result<(), String> {
    let workspace = state.workspace(&payload.workspace_id)?;
    rename_workspace_entry(&workspace, &payload.from_path, &payload.to_path)
}

#[tauri::command]
pub fn workspace_delete_entry(
    state: State<'_, AppState>,
    payload: WorkspaceDeleteRequest,
) -> Result<(), String> {
    let workspace = state.workspace(&payload.workspace_id)?;
    delete_workspace_entry(&workspace, &payload.path)
}

#[tauri::command]
pub fn workspace_write_binary(
    state: State<'_, AppState>,
    payload: WorkspaceWriteBinaryRequest,
) -> Result<(), String> {
    let workspace = state.workspace(&payload.workspace_id)?;
    write_workspace_binary(&workspace, &payload.path, &payload.bytes)
}
```

- [ ] **Step 3: Register command module**

Update `src-tauri/src/commands/mod.rs`:

```rust
pub mod app;
pub mod workspace;
```

- [ ] **Step 4: Register handlers in `src-tauri/src/lib.rs`**

Import and register:

```rust
use commands::workspace::{
    workspace_create_directory, workspace_delete_entry, workspace_list_entries, workspace_open,
    workspace_read_file, workspace_rename_entry, workspace_write_binary, workspace_write_file,
};
```

The handler list should become:

```rust
.invoke_handler(tauri::generate_handler![
    app_health,
    workspace_open,
    workspace_list_entries,
    workspace_read_file,
    workspace_write_file,
    workspace_create_directory,
    workspace_rename_entry,
    workspace_delete_entry,
    workspace_write_binary
])
```

- [ ] **Step 5: Run Rust check**

Run:

```powershell
cargo fmt
cargo check
```

Expected:

```txt
Finished `dev` profile ...
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src-tauri/src/app_state.rs src-tauri/src/commands src-tauri/src/lib.rs
git commit -m "feat: expose native workspace commands"
```

## Task 5: Add frontend workspace service

**Files:**

- Create: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src\services\workspace\types.ts`
- Create: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src\services\workspace\nativeHandle.ts`
- Create: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src\services\workspace\nativeHandle.test.ts`
- Create: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src\services\workspace\client.ts`
- Create: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src\services\workspace\index.ts`

- [ ] **Step 1: Create workspace service types**

Write `src/services/workspace/types.ts`:

```ts
import type { WorkspaceEntry } from '../../lib/fileSystem';

export interface NativeWorkspace {
  id: string;
  name: string;
  rootPath: string;
  entries: WorkspaceEntry[];
  writable: boolean;
}

export interface NativeWorkspaceDirectoryHandle {
  source: 'tauri';
  workspaceId: string;
  name: string;
  rootPath: string;
}

export interface NativeWorkspaceFileHandle {
  source: 'tauri-file';
  workspaceId: string;
  path: string;
  name: string;
}
```

- [ ] **Step 2: Create native handle helpers**

Write `src/services/workspace/nativeHandle.ts`:

```ts
import type { NativeWorkspaceDirectoryHandle, NativeWorkspaceFileHandle } from './types';

export function createNativeWorkspaceDirectoryHandle(workspace: {
  id: string;
  name: string;
  rootPath: string;
}): NativeWorkspaceDirectoryHandle {
  return {
    source: 'tauri',
    workspaceId: workspace.id,
    name: workspace.name,
    rootPath: workspace.rootPath,
  };
}

export function createNativeWorkspaceFileHandle(
  workspaceId: string,
  path: string,
  name: string
): NativeWorkspaceFileHandle {
  return {
    source: 'tauri-file',
    workspaceId,
    path,
    name,
  };
}

export function isNativeWorkspaceDirectoryHandle(value: unknown): value is NativeWorkspaceDirectoryHandle {
  return Boolean(value && typeof value === 'object' && (value as any).source === 'tauri');
}

export function isNativeWorkspaceFileHandle(value: unknown): value is NativeWorkspaceFileHandle {
  return Boolean(value && typeof value === 'object' && (value as any).source === 'tauri-file');
}
```

- [ ] **Step 3: Add handle helper tests**

Write `src/services/workspace/nativeHandle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createNativeWorkspaceDirectoryHandle,
  createNativeWorkspaceFileHandle,
  isNativeWorkspaceDirectoryHandle,
  isNativeWorkspaceFileHandle,
} from './nativeHandle';

describe('native workspace handles', () => {
  it('identifies native directory handles', () => {
    const handle = createNativeWorkspaceDirectoryHandle({
      id: 'workspace-id',
      name: 'workspace',
      rootPath: 'D:/workspace',
    });

    expect(isNativeWorkspaceDirectoryHandle(handle)).toBe(true);
    expect(isNativeWorkspaceFileHandle(handle)).toBe(false);
  });

  it('identifies native file handles', () => {
    const handle = createNativeWorkspaceFileHandle('workspace-id', 'docs/a.md', 'a.md');

    expect(isNativeWorkspaceFileHandle(handle)).toBe(true);
    expect(isNativeWorkspaceDirectoryHandle(handle)).toBe(false);
  });
});
```

- [ ] **Step 4: Create native workspace client**

Write `src/services/workspace/client.ts`:

```ts
import { isTauriRuntime } from '../native';
import type { NativeWorkspace } from './types';

type Invoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function loadInvoke(): Promise<Invoke> {
  const api = await import('@tauri-apps/api/core');
  return api.invoke;
}

async function loadDialogOpen(): Promise<(options: Record<string, unknown>) => Promise<string | string[] | null>> {
  const api = await import('@tauri-apps/plugin-dialog');
  return api.open as (options: Record<string, unknown>) => Promise<string | string[] | null>;
}

function assertTauriRuntime() {
  if (!isTauriRuntime()) {
    throw new Error('Native workspace service is only available in Tauri runtime');
  }
}

export async function openNativeWorkspace(): Promise<NativeWorkspace | null> {
  assertTauriRuntime();
  const open = await loadDialogOpen();
  const selected = await open({
    directory: true,
    multiple: false,
    title: '打开工作区',
  });
  const rootPath = Array.isArray(selected) ? selected[0] : selected;
  if (!rootPath) return null;

  const invoke = await loadInvoke();
  return await invoke<NativeWorkspace>('workspace_open', {
    payload: { rootPath },
  });
}

export async function listNativeWorkspaceEntries(workspaceId: string) {
  const invoke = await loadInvoke();
  return await invoke<NativeWorkspace['entries']>('workspace_list_entries', { workspaceId });
}

export async function readNativeWorkspaceFile(workspaceId: string, path: string) {
  const invoke = await loadInvoke();
  return await invoke<string>('workspace_read_file', {
    payload: { workspaceId, path },
  });
}

export async function writeNativeWorkspaceFile(workspaceId: string, path: string, content: string) {
  const invoke = await loadInvoke();
  await invoke<void>('workspace_write_file', {
    payload: { workspaceId, path, content },
  });
}

export async function createNativeWorkspaceDirectory(workspaceId: string, path: string) {
  const invoke = await loadInvoke();
  await invoke<void>('workspace_create_directory', {
    payload: { workspaceId, path },
  });
}

export async function renameNativeWorkspaceEntry(workspaceId: string, fromPath: string, toPath: string) {
  const invoke = await loadInvoke();
  await invoke<void>('workspace_rename_entry', {
    payload: { workspaceId, fromPath, toPath },
  });
}

export async function deleteNativeWorkspaceEntry(workspaceId: string, path: string) {
  const invoke = await loadInvoke();
  await invoke<void>('workspace_delete_entry', {
    payload: { workspaceId, path },
  });
}

export async function writeNativeWorkspaceBinary(workspaceId: string, path: string, bytes: Uint8Array) {
  const invoke = await loadInvoke();
  await invoke<void>('workspace_write_binary', {
    payload: { workspaceId, path, bytes: Array.from(bytes) },
  });
}
```

- [ ] **Step 5: Create workspace service exports**

Write `src/services/workspace/index.ts`:

```ts
export * from './client';
export * from './nativeHandle';
export type * from './types';
```

- [ ] **Step 6: Add npm dependency for dialog plugin**

Run:

```powershell
$env:NPM_CONFIG_OFFLINE='false'
$env:HTTP_PROXY=''
$env:HTTPS_PROXY=''
$env:ALL_PROXY=''
npm install @tauri-apps/plugin-dialog --package-lock-only --ignore-scripts
```

Expected:

```txt
up to date, audited ...
```

Then ensure `package.json` contains:

```json
"@tauri-apps/plugin-dialog": "^2.0.0"
```

- [ ] **Step 7: Run tests**

Run:

```powershell
npm test -- src/services/workspace/nativeHandle.test.ts
npm run lint
```

Expected:

```txt
PASS src/services/workspace/nativeHandle.test.ts
tsc --noEmit
```

- [ ] **Step 8: Commit**

Run:

```powershell
git add package.json package-lock.json src/services/workspace
git commit -m "feat: add native workspace frontend service"
```

## Task 6: Route `fileSystem.ts` through native workspace service

**Files:**

- Modify: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src\lib\fileSystem.ts`
- Modify: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src\lib\fileSystem.test.ts`

- [ ] **Step 1: Add imports to `src/lib/fileSystem.ts`**

Add:

```ts
import { isTauriRuntime } from '../services/native';
import {
  createNativeWorkspaceDirectoryHandle,
  createNativeWorkspaceFileHandle,
  isNativeWorkspaceDirectoryHandle,
  isNativeWorkspaceFileHandle,
  listNativeWorkspaceEntries,
  openNativeWorkspace,
  readNativeWorkspaceFile,
  writeNativeWorkspaceFile,
} from '../services/workspace';
```

- [ ] **Step 2: Extend source type**

Change:

```ts
export type WorkspaceSource = 'file-system-access' | 'input-fallback';
```

to:

```ts
export type WorkspaceSource = 'file-system-access' | 'input-fallback' | 'tauri';
```

- [ ] **Step 3: Add native entry hydration helper**

Add after type declarations:

```ts
function attachNativeHandles(entries: WorkspaceEntry[], workspaceId: string): WorkspaceEntry[] {
  return entries.map((entry) => {
    if (entry.kind === 'directory') {
      return {
        ...entry,
        children: attachNativeHandles(entry.children, workspaceId),
      };
    }

    return {
      ...entry,
      handle: createNativeWorkspaceFileHandle(workspaceId, entry.path, entry.name),
    };
  });
}
```

- [ ] **Step 4: Route `openDirectory` to native runtime first**

At the start of `openDirectory`, after clearing `lastOpenDirectoryError`, add:

```ts
  if (isTauriRuntime()) {
    try {
      const workspace = await openNativeWorkspace();
      if (!workspace) return null;
      return {
        name: workspace.name,
        directoryHandle: createNativeWorkspaceDirectoryHandle(workspace),
        entries: attachNativeHandles(workspace.entries, workspace.id),
        writable: workspace.writable,
        source: 'tauri',
      };
    } catch (err) {
      console.error('Error opening native workspace:', err);
      lastOpenDirectoryError = (err as Error)?.message || '打开本地工作区失败';
      return null;
    }
  }
```

- [ ] **Step 5: Route `readWorkspaceEntries` to native runtime**

At the start of `readWorkspaceEntries`, add:

```ts
  if (isNativeWorkspaceDirectoryHandle(directoryHandle)) {
    const entries = await listNativeWorkspaceEntries(directoryHandle.workspaceId);
    return attachNativeHandles(entries, directoryHandle.workspaceId);
  }
```

- [ ] **Step 6: Route `readFile` and `writeFile` to native file handles**

At the start of `readFile`, add:

```ts
  if (isNativeWorkspaceFileHandle(fileHandle)) {
    return await readNativeWorkspaceFile(fileHandle.workspaceId, fileHandle.path);
  }
```

At the start of `writeFile`, add:

```ts
  if (isNativeWorkspaceFileHandle(fileHandle)) {
    await writeNativeWorkspaceFile(fileHandle.workspaceId, fileHandle.path, content);
    return;
  }
```

- [ ] **Step 7: Add fileSystem native tests**

Add to `src/lib/fileSystem.test.ts`:

```ts
vi.mock('../services/native', () => ({
  isTauriRuntime: vi.fn(() => false),
}));

vi.mock('../services/workspace', () => ({
  createNativeWorkspaceDirectoryHandle: vi.fn((workspace) => ({
    source: 'tauri',
    workspaceId: workspace.id,
    name: workspace.name,
    rootPath: workspace.rootPath,
  })),
  createNativeWorkspaceFileHandle: vi.fn((workspaceId, path, name) => ({
    source: 'tauri-file',
    workspaceId,
    path,
    name,
  })),
  isNativeWorkspaceDirectoryHandle: vi.fn((value) => value?.source === 'tauri'),
  isNativeWorkspaceFileHandle: vi.fn((value) => value?.source === 'tauri-file'),
  listNativeWorkspaceEntries: vi.fn(),
  openNativeWorkspace: vi.fn(),
  readNativeWorkspaceFile: vi.fn(),
  writeNativeWorkspaceFile: vi.fn(),
}));
```

Add tests for:

```ts
it('opens a native Tauri workspace when running in Tauri', async () => {
  const native = await import('../services/native');
  const workspace = await import('../services/workspace');
  vi.mocked(native.isTauriRuntime).mockReturnValue(true);
  vi.mocked(workspace.openNativeWorkspace).mockResolvedValue({
    id: 'D:/docs',
    name: 'docs',
    rootPath: 'D:/docs',
    writable: true,
    entries: [{ id: 'README.md', kind: 'file', name: 'README.md', path: 'README.md' }],
  });

  await expect(openDirectory()).resolves.toMatchObject({
    name: 'docs',
    writable: true,
    source: 'tauri',
    entries: [
      {
        id: 'README.md',
        kind: 'file',
        name: 'README.md',
        path: 'README.md',
        handle: {
          source: 'tauri-file',
          workspaceId: 'D:/docs',
          path: 'README.md',
          name: 'README.md',
        },
      },
    ],
  });
});
```

- [ ] **Step 8: Run tests**

Run:

```powershell
npm test -- src/lib/fileSystem.test.ts
npm run lint
```

Expected:

```txt
PASS src/lib/fileSystem.test.ts
tsc --noEmit
```

- [ ] **Step 9: Commit**

Run:

```powershell
git add src/lib/fileSystem.ts src/lib/fileSystem.test.ts
git commit -m "feat: route workspace file operations through native service"
```

## Task 7: Add App-level native workspace write operations

**Files:**

- Modify: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src\App.tsx`

- [ ] **Step 1: Add native workspace imports**

Add:

```ts
import {
  createNativeWorkspaceFileHandle,
  createNativeWorkspaceDirectory,
  deleteNativeWorkspaceEntry,
  isNativeWorkspaceDirectoryHandle,
  isNativeWorkspaceFileHandle,
  renameNativeWorkspaceEntry,
  writeNativeWorkspaceBinary,
  writeNativeWorkspaceFile,
} from './services/workspace';
```

- [ ] **Step 2: Add native branch in `createWorkspaceFileAt`**

Inside `createWorkspaceFileAt`, before browser handle checks, add:

```ts
    if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
      const targetEntries = getWorkspaceEntriesForDirectory(workspaceEntries, directoryPath);
      const fileName = fileNameInput
        ? normalizeWorkspaceFileName(fileNameInput)
        : getNextWorkspaceFileName(targetEntries);
      if (!fileName) {
        showErrorToast('文件名不合法，请重新输入');
        return false;
      }
      if (targetEntries.some((entry) => entry.name.toLowerCase() === fileName.toLowerCase())) {
        showErrorToast('同名文件已存在');
        return false;
      }

      const createdPath = buildWorkspacePath(directoryPath, fileName);
      await writeNativeWorkspaceFile(workspaceDirectoryHandle.workspaceId, createdPath, initialContent);
      const nextEntries = await refreshWorkspace(workspaceDirectoryHandle);
      const createdEntry = findWorkspaceFileEntry(nextEntries, createdPath);
      const fileHandle = createNativeWorkspaceFileHandle(workspaceDirectoryHandle.workspaceId, createdPath, fileName);
      setActiveFileHandle(createdEntry?.handle ?? fileHandle);
      setActiveWorkspaceFilePath(createdEntry?.path ?? createdPath);
      syncDocumentContent(initialContent);
      storeRecentFile(fileName, createdEntry?.handle ?? fileHandle);
      workspaceContentCacheRef.current.set(createdEntry?.path ?? createdPath, initialContent);
      return true;
    }
```

- [ ] **Step 3: Add native branch in `createWorkspaceFolderAt`**

Before browser handle checks, add:

```ts
    if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
      const targetEntries = getWorkspaceEntriesForDirectory(workspaceEntries, directoryPath);
      const folderName = folderNameInput
        ? normalizeWorkspaceFolderName(folderNameInput)
        : getNextWorkspaceFolderName(targetEntries);
      if (!folderName) {
        showErrorToast('文件夹名不合法，请重新输入');
        return false;
      }
      if (targetEntries.some((entry) => entry.name === folderName)) {
        showErrorToast('同名文件夹已存在');
        return false;
      }

      await createNativeWorkspaceDirectory(
        workspaceDirectoryHandle.workspaceId,
        buildWorkspacePath(directoryPath, folderName)
      );
      await refreshWorkspace(workspaceDirectoryHandle);
      return true;
    }
```

- [ ] **Step 4: Add native branch in image asset write**

In `saveImageToWorkspace`, before `getAssetsDirectoryHandle`, add:

```ts
    if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
      const buffer = await file.arrayBuffer();
      const assetPath = target.assetsDirSegments.length
        ? `${target.assetsDirSegments.join('/')}/${target.fileName}`
        : target.fileName;
      await writeNativeWorkspaceBinary(
        workspaceDirectoryHandle.workspaceId,
        assetPath,
        new Uint8Array(buffer)
      );
      return assetPath;
    }
```

- [ ] **Step 5: Add native branch in rename/delete**

In `handleWorkspaceEntryRename`, before browser parent handle logic, add:

```ts
    if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
      const nextPath = buildWorkspacePath(parentPath, nextName);
      await renameNativeWorkspaceEntry(workspaceDirectoryHandle.workspaceId, entry.path, nextPath);
      const nextEntries = await refreshWorkspace(workspaceDirectoryHandle);
      const nextEntry = findWorkspaceFileEntry(nextEntries, nextPath);
      workspaceContentCacheRef.current.delete(entry.path);
      if (activeWorkspaceFilePath === entry.path) {
        setActiveWorkspaceFilePath(nextEntry?.path ?? nextPath);
        setActiveFileHandle(
          nextEntry?.handle ?? createNativeWorkspaceFileHandle(workspaceDirectoryHandle.workspaceId, nextPath, nextName)
        );
      }
      return true;
    }
```

In `handleWorkspaceEntryDelete`, before browser parent handle logic, add:

```ts
    if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
      await deleteNativeWorkspaceEntry(workspaceDirectoryHandle.workspaceId, entry.path);
      const cache = workspaceContentCacheRef.current;
      if (entry.kind === 'file') {
        cache.delete(entry.path);
      } else {
        for (const key of Array.from(cache.keys())) {
          if (key === entry.path || key.startsWith(`${entry.path}/`)) {
            cache.delete(key);
          }
        }
      }
      if (
        activeWorkspaceFilePath &&
        (activeWorkspaceFilePath === entry.path || activeWorkspaceFilePath.startsWith(`${entry.path}/`))
      ) {
        setActiveWorkspaceFilePath(null);
        setActiveFileHandle(null);
        syncDocumentContent(initialContent);
      }
      await refreshWorkspace(workspaceDirectoryHandle);
      return true;
    }
```

- [ ] **Step 6: Update copy path warning for native entries**

In `handleWorkspaceEntryCopyPath`, if the directory handle is native, copy absolute path:

```ts
    if (isNativeWorkspaceDirectoryHandle(workspaceDirectoryHandle)) {
      const absolute = `${workspaceDirectoryHandle.rootPath.replace(/\\/g, '/')}/${entry.path}`;
      await copyWorkspaceText(absolute);
      return;
    }
```

- [ ] **Step 7: Run lint**

Run:

```powershell
npm run lint
```

Expected:

```txt
tsc --noEmit
```

- [ ] **Step 8: Commit**

Run:

```powershell
git add src/App.tsx
git commit -m "feat: support native workspace mutations in app shell"
```

## Task 8: Disable browser workspace handle persistence in Tauri runtime

**Files:**

- Modify: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src\lib\workspacePersistence.ts`

- [ ] **Step 1: Import runtime check**

Add:

```ts
import { isTauriRuntime } from '../services/native';
```

- [ ] **Step 2: Skip IndexedDB handle persistence in Tauri**

At the start of each exported function:

```ts
if (isTauriRuntime()) return;
```

For `loadWorkspaceHandle`, use:

```ts
if (isTauriRuntime()) return null;
```

This prevents trying to serialize native handles into IndexedDB before Phase 3 adds SQLite persistence.

- [ ] **Step 3: Run lint**

Run:

```powershell
npm run lint
```

Expected:

```txt
tsc --noEmit
```

- [ ] **Step 4: Commit**

Run:

```powershell
git add src/lib/workspacePersistence.ts
git commit -m "fix: skip browser workspace persistence in tauri runtime"
```

## Task 9: Add Tauri dialog dependency and command docs

**Files:**

- Modify: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\Cargo.toml`
- Modify: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\src\lib.rs`
- Modify: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\src-tauri\capabilities\main.json`
- Modify: `D:\Lumina-Edit-Pro\.worktrees\tauri-native-shell\docs\tauri-productization.md`

- [ ] **Step 1: Add Rust dialog plugin dependency**

In `src-tauri/Cargo.toml`, add:

```toml
tauri-plugin-dialog = "2"
```

- [ ] **Step 2: Initialize dialog plugin**

In `src-tauri/src/lib.rs`, add before `.manage(AppState::new())`:

```rust
.plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 3: Update capabilities**

Update `src-tauri/capabilities/main.json` permissions:

```json
"permissions": ["core:default", "dialog:open"]
```

- [ ] **Step 4: Update productization docs**

Append to `docs/tauri-productization.md`:

```markdown
## Phase 2 Workspace Direction

Phase 2 moves workspace operations into the native backend:

- Workspace selection uses Tauri dialog APIs.
- Workspace roots are registered in Rust application state.
- Frontend requests use workspace IDs and relative paths.
- Rust validates that every file operation remains inside the workspace root.
- Markdown file writes are atomic.
- Browser File System Access remains as a fallback for non-Tauri runtime.
```

- [ ] **Step 5: Run checks**

Run:

```powershell
npm run lint
cargo fmt
cargo check
```

Expected:

```txt
tsc --noEmit
Finished `dev` profile ...
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/capabilities/main.json docs/tauri-productization.md
git commit -m "docs: document native workspace backend"
```

## Final Verification

Run:

```powershell
npm run lint
npm test -- src/services/workspace/nativeHandle.test.ts src/lib/fileSystem.test.ts
npm run build
```

Expected:

```txt
tsc --noEmit
PASS src/services/workspace/nativeHandle.test.ts
PASS src/lib/fileSystem.test.ts
vite build
✓ built
```

Run:

```powershell
cd src-tauri
cargo fmt --check
cargo check
```

Expected:

```txt
Finished `dev` profile ...
```

Manual desktop verification after environment issues are resolved:

```powershell
npm run tauri:dev
```

Expected:

1. Desktop window opens.
2. Click “打开工作区”.
3. Native directory picker opens.
4. Select a folder containing Markdown files.
5. Sidebar file tree shows Markdown files.
6. Open a Markdown file.
7. Edit content and wait for autosave.
8. Close and reopen the same file from the tree; content should match saved content.
9. Create a new file and folder.
10. Insert an image; the image should be written into the configured assets directory.

## Self-Review

Spec coverage:

- Native workspace open: Tasks 4, 5, 6.
- File tree scanning: Tasks 3, 4, 6.
- File read/write and autosave path: Tasks 3, 4, 6, 7.
- Image asset writes: Tasks 3, 4, 7.
- Browser fallback preserved: Task 6 keeps existing File System Access branches.
- Workspace persistence deferred to Phase 3: Task 8 explicitly disables browser handle persistence in Tauri.

Placeholder scan:

- No implementation task contains unresolved placeholder wording.
- Known environment failures are listed as verification blockers, not as implementation placeholders.

Type consistency:

- Rust command names use snake_case and match frontend `invoke` names.
- Rust response fields use camelCase via Serde and match TypeScript types.
- Native handles use `source: 'tauri'` and `source: 'tauri-file'` consistently.
