# Tauri Productization

Lumina Edit Pro is being productized as a native-first desktop application using Tauri v2.

## Current Phase

Phase 3 adds durable native workspace persistence and startup restore on top of the Rust-backed workspace services.

Implemented in Phase 3:

- Rust JSON recent workspace store under the Tauri app config directory.
- Native commands to list, clear, remember, and restore recent workspaces.
- Frontend workspace service wrappers for recent workspace restore.
- App startup restore for the last native workspace without IndexedDB handles.
- Regression coverage for native workspace restore in app and filesystem tests.

## Completed Phase 2

Phase 2 migrated workspace and file operations from browser-only APIs to Rust-backed Tauri services while preserving browser fallback.

Implemented in Phase 2:

- Native workspace picker via `@tauri-apps/plugin-dialog`.
- Rust workspace root registration and path validation.
- Recursive Markdown workspace scanning.
- Native file read/write/create/rename/delete commands.
- Native image asset writes.
- Frontend workspace service wrappers in `src/services/workspace`.
- `src/lib/fileSystem.ts` native adapter with browser fallback.
- App-level native create folder/file, rename, delete, copy path, image insert, and autosave routing.

## Completed Phase 1

Phase 1 established the native shell and backend skeleton:

- Tauri v2 desktop window.
- Rust application entrypoint.
- Minimal native command module.
- Frontend service wrapper for native calls.
- Initial capability configuration.

## Architecture Rule

React components must not call Tauri APIs directly. Frontend-native communication goes through `src/services`.

## Next Phase

Phase 4 should add deeper desktop product polish:

- File watching / workspace refresh. `(manual refresh and native auto-refresh implemented)`
- Native open-in-file-manager behavior. `(implemented)`
- Native window title sync. `(implemented)`
- Native app packaging metadata and production icons. `(metadata and Windows icon wired)`
