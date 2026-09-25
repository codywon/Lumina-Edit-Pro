# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Important
- Goal: To become the most user-friendly markdown editor for AI worldwide

## Desktop Build & "无法访问该页面" Prevention Rule (CRITICAL)

### Root Cause Analysis
1. **Debug vs Release Binary Discrepancy**:
   - `src-tauri/target/debug/lumina-edit-pro.exe` is built in Tauri Debug mode. By design, Tauri debug binaries do NOT embed the frontend assets into the binary; instead, they connect to the Vite dev server at `devUrl` (`http://localhost:3188`).
   - If `npm run dev` is not running, launching a debug binary will always fail with the WebView2 error: **"无法访问该页面" (ERR_CONNECTION_REFUSED)**.
2. **Windows File Locking (`os error 5: 拒绝访问`)**:
   - If `lumina-edit-pro.exe` is running in the background, Windows locks the file. Recompiling with `tauri build` will fail to overwrite the binary, leaving an outdated or broken file.
3. **User Folder Confusion**:
   - Users who open `src-tauri/target/debug/` directly will double-click the debug binary and see "无法访问该页面".

### Mandatory Engineering Rules (NEVER BREAK)
1. **Kill Background Processes Before Build**:
   - Always run `powershell -Command "Stop-Process -Name lumina-edit-pro -Force -ErrorAction SilentlyContinue"` before compiling.
2. **Synchronize Root Executable**:
   - Every desktop build MUST copy the self-contained release executable to the project root:
     `D:\myscript\Lumina-Edit-Pro\Lumina-Edit-Pro.exe`
   - The build script MUST ALSO overwrite `src-tauri/target/debug/lumina-edit-pro.exe` with the self-contained release binary, so that double-clicking ANY `.exe` in ANY directory always opens the embedded editor and NEVER produces "无法访问该页面".
3. **Always Build with Embedded Assets**:
   - Use `npm run tauri:build` (or `npx tauri build --no-bundle`) which guarantees `npm run build` runs first to refresh `dist/`, and embeds all HTML, CSS, JS, KaTeX fonts directly into the single executable.

## Development commands

- `npm install` — install dependencies.
- `npm run dev` — start the Vite dev server on port 3188, bound to `0.0.0.0`.
- `npm run build` — create a production build with Vite.
- `npm run preview` — preview the production build.
- `npm run lint` — run static type check: `tsc --noEmit`.
- `npm run test` — run unit test suite with Vitest: `vitest run --environment jsdom`.
- `npm run tauri:dev` — run Tauri desktop in development mode with HMR on port 3188.
- `npm run tauri:build` — compile production desktop binary and sync to root `Lumina-Edit-Pro.exe`.
- `npm run clean` — remove `dist`.

## High-level architecture

- This is a client-side React 19 + TypeScript + Vite single-page app for Markdown editing with AI assistance.
- Boot flow: `index.html` pre-applies the light/dark class on `<html>` to avoid theme flash, `src/main.tsx` mounts React, and `src/App.tsx` composes the app providers and shell.
- `src/App.tsx` is the main orchestration layer. It creates the TipTap editor, owns the top-level UI/document state, and composes the main regions: `Header`, `SidebarLeft`, `Editor`, `SidebarRight`, `Footer`, and the modal components.

## Editor and document flow

- The canonical document state is a Markdown string stored in `App.tsx`.
- TipTap is configured in `src/App.tsx` with StarterKit, `tiptap-markdown`, tables, highlight support, and a custom lowlight-backed code block node view.
- On editor updates, the ProseMirror document is serialized back to Markdown and stored in React state; heading nodes are also extracted there to drive the outline sidebar.
- When a file is opened, the flow goes the other direction: Markdown content is loaded into app state and then pushed back into the editor instance.
- `src/components/Editor.tsx` is primarily the UI/controller for the existing editor instance: toolbar actions, source mode textarea, search highlighting, scroll-to-heading behavior, fullscreen/toolbar controls, and editor presentation.
- Important detail: the editor instance is created in `src/App.tsx`, not in `src/components/Editor.tsx`.
- `viewMode` includes `'split'`, but `src/components/Editor.tsx` only has a dedicated `'source'` branch and a single rich-editor branch, so split mode is not a separate rendering path right now.

## Cross-cutting state and persistence

- `src/contexts/ThemeContext.tsx` manages `light` / `dark` / `system` theme selection by toggling classes on `<html>` and persisting the choice in `localStorage`.
- `src/contexts/SettingsContext.tsx` persists editor/UI settings to `localStorage` and applies global CSS variables/classes such as editor font size, line height, and compact density mode.
- `src/App.tsx` also persists document content and recent files in `localStorage`.

## AI integration

- `src/components/SidebarRight.tsx` calls Gemini directly from the browser using `@google/genai`.
- The current Markdown document is embedded into the prompt, and AI responses can be appended to the document content.
- Environment wiring is split between `README.md` and `vite.config.ts`: the README tells local users to set `GEMINI_API_KEY` in `.env.local`, and `vite.config.ts` injects `process.env.GEMINI_API_KEY` at build/dev time.

## File and workspace handling

- `src/lib/fileSystem.ts` wraps browser File System Access APIs for opening files, opening directories, reading, and writing.
- When those APIs are unavailable, it falls back to `<input type="file">` for open flows and blob download behavior for saves.
- The current file handling is Markdown-focused (`.md` files).

## Styling and configuration

- Tailwind CSS v4 is configured in `src/index.css` rather than a separate Tailwind config file. The file uses `@import "tailwindcss"`, `@plugin "@tailwindcss/typography"`, and an `@theme` block for design tokens.
- `src/index.css` also contains the editor-specific presentation rules: prose styling, code block/syntax highlighting, density mode, line numbers, and focus mode styling.
- `vite.config.ts` uses the React and Tailwind Vite plugins, defines `process.env.GEMINI_API_KEY`, and maps the `@` alias to the repository root (not `src/`).
- `vite.config.ts` also contains an AI Studio-specific HMR guard controlled by `DISABLE_HMR`; keep that behavior in mind before changing dev-server settings.

## Product/UI note

- Much of the user-facing UI copy is in Chinese. Preserve that unless the task is explicitly changing product language.
