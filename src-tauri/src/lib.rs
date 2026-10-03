use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NativeAppHealth {
    pub app_name: String,
    pub version: String,
    pub status: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEntry {
    pub id: String,
    pub kind: String, // "file" | "directory"
    pub name: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<WorkspaceEntry>>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NativeWorkspace {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub entries: Vec<WorkspaceEntry>,
    pub writable: bool,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NativeFile {
    pub path: String,
    pub name: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeRecentWorkspace {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub last_opened_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DefaultEditorResult {
    pub success: bool,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CurrentExeInfo {
    pub exe_path: String,
    pub exe_dir: String,
    pub exe_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateWriteChunkPayload {
    pub chunk: Vec<u8>,
    pub is_first: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSaveAsPayload {
    pub target_path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkFetchPayload {
    pub url: String,
    pub headers: Option<HashMap<String, String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkFetchResult {
    pub status: u16,
    pub content: String,
    pub content_type: String,
    pub final_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDownloadPayload {
    pub url: String,
    pub headers: Option<HashMap<String, String>>,
    pub target_file_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAssetDataUrlPayload {
    pub path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDownloadResult {
    pub status: u16,
    pub content_type: String,
    pub size: usize,
    pub bytes: Option<Vec<u8>>,
    pub saved_path: Option<String>,
}

// Payloads
#[derive(Deserialize)]
pub struct FilePathPayload {
    pub path: String,
}

#[derive(Deserialize)]
pub struct FileWritePayload {
    pub path: String,
    pub content: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteAssetPayload {
    pub file_path: String,
    pub relative_path: String,
    pub bytes: Vec<u8>,
}

#[derive(Deserialize)]
pub struct WorkspacePathPayload {
    #[serde(rename = "workspaceId")]
    pub workspace_id: String,
    pub path: String,
}

#[derive(Deserialize)]
pub struct WorkspaceFileWritePayload {
    #[serde(rename = "workspaceId")]
    pub workspace_id: String,
    pub path: String,
    pub content: String,
}

#[derive(Deserialize)]
pub struct WorkspaceBinaryPayload {
    #[serde(rename = "workspaceId")]
    pub workspace_id: String,
    pub path: String,
    pub bytes: Vec<u8>,
}

#[derive(Deserialize)]
pub struct WorkspaceRenamePayload {
    #[serde(rename = "workspaceId")]
    pub workspace_id: String,
    #[serde(rename = "fromPath")]
    pub from_path: String,
    #[serde(rename = "toPath")]
    pub to_path: String,
}

// Helper: Scan workspace directory recursively for Markdown files
fn scan_directory_entries(dir: &Path, base: &Path) -> Vec<WorkspaceEntry> {
    let mut entries = Vec::new();
    if let Ok(read_dir) = fs::read_dir(dir) {
        let mut dirs = Vec::new();
        let mut files = Vec::new();

        for entry_res in read_dir.flatten() {
            let path = entry_res.path();
            let name = entry_res.file_name().to_string_lossy().to_string();

            // Ignore hidden files and build folders
            if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" {
                continue;
            }

            if path.is_dir() {
                dirs.push((name, path));
            } else if path.is_file() {
                // Check if markdown or txt
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                if ext == "md" || ext == "markdown" || ext == "txt" {
                    files.push((name, path));
                }
            }
        }

        dirs.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));
        files.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()));

        for (name, path) in dirs {
            let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            let children = scan_directory_entries(&path, base);
            entries.push(WorkspaceEntry {
                id: rel.clone(),
                kind: "directory".into(),
                name,
                path: rel,
                children: Some(children),
            });
        }

        for (name, path) in files {
            let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            entries.push(WorkspaceEntry {
                id: rel.clone(),
                kind: "file".into(),
                name,
                path: rel,
                children: None,
            });
        }
    }
    entries
}

// App Health
#[tauri::command]
fn app_health() -> NativeAppHealth {
    NativeAppHealth {
        app_name: "Lumina Edit Pro".into(),
        version: "1.0.0".into(),
        status: "ok".into(),
    }
}

// Window Management
#[tauri::command]
fn app_set_window_title(window: tauri::Window, title: String) -> Result<(), String> {
    window.set_title(&title).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn app_window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn app_window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn app_window_start_dragging(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn app_get_cli_open_file() -> Result<Option<NativeFile>, String> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        for arg in args.iter().skip(1) {
            if arg.starts_with('-') {
                continue;
            }
            let p = Path::new(arg);
            if p.is_file() {
                if let Ok(content) = fs::read_to_string(p) {
                    let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                    return Ok(Some(NativeFile {
                        path: arg.clone(),
                        name,
                        content,
                    }));
                }
            }
        }
    }
    Ok(None)
}

#[tauri::command]
fn app_set_as_default_editor() -> Result<DefaultEditorResult, String> {
    #[cfg(target_os = "windows")]
    {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_str = exe_path.to_string_lossy().to_string();
        let open_cmd = format!("\"{}\" \"%1\"", exe_str);
        let icon_cmd = format!("\"{}\",0", exe_str);

        let commands = [
            format!("reg add \"HKCU\\Software\\Classes\\LuminaEditPro.Document\" /ve /d \"Markdown Document\" /f"),
            format!("reg add \"HKCU\\Software\\Classes\\LuminaEditPro.Document\\DefaultIcon\" /ve /d \"{}\" /f", icon_cmd),
            format!("reg add \"HKCU\\Software\\Classes\\LuminaEditPro.Document\\shell\\open\\command\" /ve /d \"{}\" /f", open_cmd),
            format!("reg add \"HKCU\\Software\\Classes\\.md\" /ve /d \"LuminaEditPro.Document\" /f"),
            format!("reg add \"HKCU\\Software\\Classes\\.md\\OpenWithProgids\" /v \"LuminaEditPro.Document\" /t REG_NONE /f"),
            format!("reg add \"HKCU\\Software\\Classes\\.markdown\" /ve /d \"LuminaEditPro.Document\" /f"),
            format!("reg add \"HKCU\\Software\\Classes\\.markdown\\OpenWithProgids\" /v \"LuminaEditPro.Document\" /t REG_NONE /f"),
            format!("reg add \"HKCU\\Software\\Classes\\Applications\\lumina-edit-pro.exe\\shell\\open\\command\" /ve /d \"{}\" /f", open_cmd),
            format!("reg add \"HKCU\\Software\\Classes\\Applications\\lumina-edit-pro.exe\\SupportedTypes\" /v \".md\" /t REG_SZ /d \"\" /f"),
            format!("reg add \"HKCU\\Software\\Classes\\Applications\\lumina-edit-pro.exe\\SupportedTypes\" /v \".markdown\" /t REG_SZ /d \"\" /f"),
            format!("reg add \"HKCU\\Software\\Classes\\Applications\\lumina-edit-pro.exe\\SupportedTypes\" /v \".txt\" /t REG_SZ /d \"\" /f"),
        ];

        for cmd in commands {
            let mut command = std::process::Command::new("cmd");
            command.args(["/C", &cmd]);
            #[cfg(target_os = "windows")]
            command.creation_flags(0x08000000);
            let _ = command.output();
        }

        // Open Windows Default Apps Settings
        let mut settings_cmd = std::process::Command::new("cmd");
        settings_cmd.args(["/C", "start", "ms-settings:defaultapps"]);
        #[cfg(target_os = "windows")]
        settings_cmd.creation_flags(0x08000000);
        let _ = settings_cmd.spawn();

        return Ok(DefaultEditorResult {
            success: true,
            message: "已在 Windows 注册表完成 .md 关联注册！正在为您打开系统“默认应用”设置，请确认选择 Lumina Edit Pro。".into(),
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(DefaultEditorResult {
            success: false,
            message: "非 Windows 系统请使用系统的“打开方式 -> 始终以此应用打开”进行设置。".into(),
        })
    }
}

#[tauri::command]
fn app_open_default_apps_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut settings_cmd = std::process::Command::new("cmd");
        settings_cmd.args(["/C", "start", "ms-settings:defaultapps"]);
        settings_cmd.creation_flags(0x08000000);
        let _ = settings_cmd.spawn();
    }
    Ok(())
}

// Single File Commands
#[tauri::command]
fn file_mtime(payload: FilePathPayload) -> Result<u64, String> {
    let metadata = fs::metadata(&payload.path).map_err(|e| e.to_string())?;
    let mtime = metadata
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    Ok(mtime)
}

#[tauri::command]
fn file_read(payload: FilePathPayload) -> Result<String, String> {
    fs::read_to_string(&payload.path).map_err(|e| e.to_string())
}

#[tauri::command]
fn file_write(payload: FileWritePayload) -> Result<(), String> {
    let path = Path::new(&payload.path);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(path, payload.content).map_err(|e| e.to_string())
}

#[tauri::command]
fn file_write_asset(payload: FileWriteAssetPayload) -> Result<serde_json::Value, String> {
    let file_path = Path::new(&payload.file_path);
    let parent = file_path.parent().unwrap_or(file_path);
    let target = parent.join(&payload.relative_path);
    if let Some(target_parent) = target.parent() {
        let _ = fs::create_dir_all(target_parent);
    }
    fs::write(&target, payload.bytes).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "relativePath": payload.relative_path }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileExportSavePayload {
    pub default_name: String,
    pub filter_name: String,
    pub extensions: Vec<String>,
    pub bytes: Vec<u8>,
}

#[tauri::command]
async fn file_export_save(window: tauri::Window, app: tauri::AppHandle, payload: FileExportSavePayload) -> Result<Option<String>, String> {
    use std::sync::mpsc;
    let (tx, rx) = mpsc::channel();

    let ext_refs: Vec<&str> = payload.extensions.iter().map(|s| s.as_str()).collect();
    app.dialog()
        .file()
        .set_parent(&window)
        .set_file_name(&payload.default_name)
        .add_filter(&payload.filter_name, &ext_refs)
        .save_file(move |file_path| {
            let _ = tx.send(file_path);
        });

    let selected = rx.recv().map_err(|e| e.to_string())?;
    if let Some(path) = selected {
        let path_str = path.to_string();
        let mut p = PathBuf::from(&path_str);
        if p.extension().is_none() && !payload.extensions.is_empty() {
            p.set_extension(&payload.extensions[0]);
        }
        if let Some(parent) = p.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&p, &payload.bytes).map_err(|e| e.to_string())?;
        Ok(Some(p.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn file_pick_open(window: tauri::Window, app: tauri::AppHandle) -> Result<Option<NativeFile>, String> {
    use std::sync::mpsc;
    let (tx, rx) = mpsc::channel();

    app.dialog()
        .file()
        .set_parent(&window)
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .pick_file(move |file_path| {
            let _ = tx.send(file_path);
        });

    let selected = rx.recv().map_err(|e| e.to_string())?;
    if let Some(path) = selected {
        let path_str = path.to_string();
        let p = Path::new(&path_str);
        let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
        let content = fs::read_to_string(p).map_err(|e| e.to_string())?;
        Ok(Some(NativeFile {
            path: path_str,
            name,
            content,
        }))
    } else {
        Ok(None)
    }
}

// Workspace Commands
#[tauri::command]
async fn workspace_pick_open(window: tauri::Window, app: tauri::AppHandle) -> Result<Option<NativeWorkspace>, String> {
    use std::sync::mpsc;
    let (tx, rx) = mpsc::channel();

    app.dialog()
        .file()
        .set_parent(&window)
        .pick_folder(move |dir_path| {
            let _ = tx.send(dir_path);
        });

    let selected = rx.recv().map_err(|e| e.to_string())?;
    if let Some(dir_path) = selected {
        let path_str = dir_path.to_string();
        let p = Path::new(&path_str);
        let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
        let entries = scan_directory_entries(p, p);

        // Save to recent
        save_recent_workspace(&app, &path_str, &name);

        Ok(Some(NativeWorkspace {
            id: path_str.clone(),
            name,
            root_path: path_str,
            entries,
            writable: true,
        }))
    } else {
        Ok(None)
    }
}

// Helper: Recent workspaces store
fn get_recent_file_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("recent_workspaces.json"))
}

fn save_recent_workspace(app: &tauri::AppHandle, path: &str, name: &str) {
    if let Some(file_path) = get_recent_file_path(app) {
        if let Some(parent) = file_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let mut list: Vec<NativeRecentWorkspace> = fs::read_to_string(&file_path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        list.retain(|item| item.root_path != path);
        list.insert(0, NativeRecentWorkspace {
            id: path.to_string(),
            name: name.to_string(),
            root_path: path.to_string(),
            last_opened_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64,
        });
        if list.len() > 10 {
            list.truncate(10);
        }
        let _ = fs::write(&file_path, serde_json::to_string_pretty(&list).unwrap_or_default());
    }
}

#[tauri::command]
fn workspace_restore_recent(app: tauri::AppHandle) -> Result<Option<NativeWorkspace>, String> {
    if let Some(file_path) = get_recent_file_path(&app) {
        if let Ok(content) = fs::read_to_string(&file_path) {
            if let Ok(list) = serde_json::from_str::<Vec<NativeRecentWorkspace>>(&content) {
                if let Some(first) = list.first() {
                    let p = Path::new(&first.root_path);
                    if p.is_dir() {
                        let entries = scan_directory_entries(p, p);
                        return Ok(Some(NativeWorkspace {
                            id: first.root_path.clone(),
                            name: first.name.clone(),
                            root_path: first.root_path.clone(),
                            entries,
                            writable: true,
                        }));
                    }
                }
            }
        }
    }
    Ok(None)
}

#[tauri::command]
fn workspace_recent_list(app: tauri::AppHandle) -> Result<Vec<NativeRecentWorkspace>, String> {
    if let Some(file_path) = get_recent_file_path(&app) {
        if let Ok(content) = fs::read_to_string(&file_path) {
            if let Ok(list) = serde_json::from_str::<Vec<NativeRecentWorkspace>>(&content) {
                return Ok(list);
            }
        }
    }
    Ok(Vec::new())
}

#[tauri::command]
fn workspace_recent_clear(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(file_path) = get_recent_file_path(&app) {
        let _ = fs::remove_file(file_path);
    }
    Ok(())
}

#[tauri::command]
fn workspace_list_entries(workspace_id: String) -> Result<Vec<WorkspaceEntry>, String> {
    let p = Path::new(&workspace_id);
    if p.is_dir() {
        Ok(scan_directory_entries(p, p))
    } else {
        Err("工作区路径不存在".into())
    }
}

#[tauri::command]
fn workspace_read_file(payload: WorkspacePathPayload) -> Result<String, String> {
    let full_path = Path::new(&payload.workspace_id).join(&payload.path);
    fs::read_to_string(&full_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn workspace_write_file(payload: WorkspaceFileWritePayload) -> Result<(), String> {
    let full_path = Path::new(&payload.workspace_id).join(&payload.path);
    if let Some(parent) = full_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&full_path, payload.content).map_err(|e| e.to_string())
}

#[tauri::command]
fn workspace_create_directory(payload: WorkspacePathPayload) -> Result<(), String> {
    let full_path = Path::new(&payload.workspace_id).join(&payload.path);
    fs::create_dir_all(&full_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn workspace_rename_entry(payload: WorkspaceRenamePayload) -> Result<(), String> {
    let from = Path::new(&payload.workspace_id).join(&payload.from_path);
    let to = Path::new(&payload.workspace_id).join(&payload.to_path);
    if let Some(parent) = to.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::rename(from, to).map_err(|e| e.to_string())
}

#[tauri::command]
fn workspace_delete_entry(payload: WorkspacePathPayload) -> Result<(), String> {
    let target = Path::new(&payload.workspace_id).join(&payload.path);
    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|e| e.to_string())
    } else {
        fs::remove_file(target).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn workspace_reveal_entry(payload: WorkspacePathPayload) -> Result<(), String> {
    let target = Path::new(&payload.workspace_id).join(&payload.path);
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        if let Some(parent) = target.parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn workspace_write_binary(payload: WorkspaceBinaryPayload) -> Result<(), String> {
    let target = Path::new(&payload.workspace_id).join(&payload.path);
    if let Some(parent) = target.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(target, payload.bytes).map_err(|e| e.to_string())
}

const EMBEDDED_USER_MANUAL_HTML: &str = include_str!("../../docs/用户手册.html");

fn cleanup_old_executable() {
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            let file_name = current_exe.file_name().unwrap_or_default().to_string_lossy();
            let old_file = parent.join(format!("{}.old", file_name));
            if old_file.exists() {
                let _ = fs::remove_file(old_file);
            }
            let new_file = parent.join(format!("{}.new", file_name));
            if new_file.exists() {
                let _ = fs::remove_file(new_file);
            }
        }
    }
}

#[tauri::command]
fn app_get_exe_info() -> Result<CurrentExeInfo, String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let parent = current_exe.parent().ok_or("无法获取当前可执行文件目录")?;
    let file_name = current_exe.file_name().ok_or("无法获取当前可执行文件名")?;

    Ok(CurrentExeInfo {
        exe_path: current_exe.to_string_lossy().to_string(),
        exe_dir: parent.to_string_lossy().to_string(),
        exe_name: file_name.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn app_write_update_chunk(payload: UpdateWriteChunkPayload) -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let parent = current_exe.parent().ok_or("无法获取当前可执行文件目录")?;
    let file_name = current_exe.file_name().ok_or("无法获取当前可执行文件名")?;
    let temp_new_exe = parent.join(format!("{}.new", file_name.to_string_lossy()));

    if payload.is_first && temp_new_exe.exists() {
        let _ = fs::remove_file(&temp_new_exe);
    }

    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&temp_new_exe)
        .map_err(|e| format!("无法写入更新临时文件（请检查所在文件夹是否有写入权限）：{}", e))?;

    file.write_all(&payload.chunk)
        .map_err(|e| format!("写入更新数据块失败：{}", e))
}

#[tauri::command]
fn app_cancel_update() -> Result<(), String> {
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            let file_name = current_exe.file_name().unwrap_or_default().to_string_lossy();
            let temp_new_exe = parent.join(format!("{}.new", file_name));
            if temp_new_exe.exists() {
                let _ = fs::remove_file(temp_new_exe);
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn app_save_update_as(payload: UpdateSaveAsPayload) -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let parent = current_exe.parent().ok_or("无法获取当前可执行文件目录")?;
    let file_name = current_exe.file_name().ok_or("无法获取当前可执行文件名")?;
    let temp_new_exe = parent.join(format!("{}.new", file_name.to_string_lossy()));

    if !temp_new_exe.is_file() {
        return Err("未找到已下载的新版本文件".to_string());
    }

    fs::copy(&temp_new_exe, &payload.target_path)
        .map_err(|e| format!("另存为新版本失败：{}", e))?;

    Ok(())
}

#[tauri::command]
fn app_apply_update_and_restart() -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let parent = current_exe.parent().ok_or("无法获取当前可执行文件目录")?;
    let file_name = current_exe.file_name().ok_or("无法获取当前可执行文件名")?;
    let file_name_str = file_name.to_string_lossy().to_string();

    let temp_new_exe = parent.join(format!("{}.new", file_name_str));
    if !temp_new_exe.is_file() {
        return Err("未找到已下载的新版本二进制文件，请重新下载".to_string());
    }

    let old_backup_exe = parent.join(format!("{}.old", file_name_str));
    if old_backup_exe.exists() {
        let _ = fs::remove_file(&old_backup_exe);
    }

    // Step 1: 原子重命名正在运行的当前 exe -> .old
    fs::rename(&current_exe, &old_backup_exe)
        .map_err(|e| format!("重命名旧版本失败（可能需要管理员权限或移动到可写目录）：{}", e))?;

    // Step 2: 将已下载好的 .new 重命名为原名称
    if let Err(e) = fs::rename(&temp_new_exe, &current_exe) {
        // 出错时自动安全回滚
        let _ = fs::rename(&old_backup_exe, &current_exe);
        return Err(format!("置换新版本失败，已安全恢复旧版本：{}", e));
    }

    // Step 3: 拉起全新的可执行文件
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new(&current_exe);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW for launcher
        if let Err(e) = cmd.spawn() {
            return Err(format!("新版本已成功替换，但自动拉起新进程失败，请手动双击启动：{}", e));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Err(e) = std::process::Command::new(&current_exe).spawn() {
            return Err(format!("新版本已成功替换，但自动拉起新进程失败，请手动双击启动：{}", e));
        }
    }

    // Step 4: 当前旧进程安全退出
    std::process::exit(0);
}

#[tauri::command]
async fn network_fetch_text(payload: NetworkFetchPayload) -> Result<NetworkFetchResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut req = client.get(&payload.url).header(
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    );

    if let Some(headers) = payload.headers {
        for (k, v) in headers {
            req = req.header(k, v);
        }
    }

    let resp = req.send().await.map_err(|e| format!("Network request failed: {}", e))?;
    let status = resp.status().as_u16();
    let final_url = resp.url().to_string();
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let content = resp.text().await.map_err(|e| format!("Failed to read response body: {}", e))?;

    Ok(NetworkFetchResult {
        status,
        content,
        content_type,
        final_url,
    })
}

#[tauri::command]
async fn network_download_asset(payload: NetworkDownloadPayload) -> Result<NetworkDownloadResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut req = client.get(&payload.url).header(
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    );

    if let Some(headers) = payload.headers {
        for (k, v) in headers {
            req = req.header(k, v);
        }
    }

    let resp = req.send().await.map_err(|e| format!("Asset download request failed: {}", e))?;
    let status = resp.status().as_u16();
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let bytes = resp.bytes().await.map_err(|e| format!("Failed to read asset bytes: {}", e))?;
    let size = bytes.len();

    let saved_path = if let Some(target_path) = payload.target_file_path {
        let p = Path::new(&target_path);
        if let Some(parent) = p.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(p, &bytes).map_err(|e| format!("Failed to write downloaded asset to {}: {}", target_path, e))?;
        Some(target_path)
    } else {
        None
    };

    let result_bytes = if saved_path.is_some() {
        None
    } else {
        Some(bytes.to_vec())
    };

    Ok(NetworkDownloadResult {
        status,
        content_type,
        size,
        bytes: result_bytes,
        saved_path,
    })
}

#[tauri::command]
fn app_read_asset_data_url(payload: ReadAssetDataUrlPayload) -> Result<String, String> {
    let mut p = PathBuf::from(&payload.path);
    if !p.exists() {
        if let Ok(decoded) = percent_encoding::percent_decode_str(&payload.path).decode_utf8() {
            let p_dec = PathBuf::from(decoded.as_ref());
            if p_dec.exists() {
                p = p_dec;
            }
        }
    }
    if !p.exists() {
        return Err(format!("File does not exist: {}", payload.path));
    }
    let bytes = fs::read(&p).map_err(|e| format!("Failed to read asset: {}", e))?;
    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    };
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;
    Ok(format!("data:{};base64,{}", mime, BASE64.encode(&bytes)))
}

#[tauri::command]
fn app_open_user_manual() -> Result<(), String> {
    let temp_file = std::env::temp_dir().join("Lumina-Edit-Pro-用户手册.html");
    let _ = fs::write(&temp_file, EMBEDDED_USER_MANUAL_HTML);

    if temp_file.is_file() {
        let path_str = temp_file.to_string_lossy().to_string();
        #[cfg(target_os = "windows")]
        {
            let mut cmd = std::process::Command::new("cmd");
            cmd.args(["/C", "start", "", &path_str]);
            cmd.creation_flags(0x08000000);
            if cmd.spawn().is_ok() {
                return Ok(());
            }
        }
        #[cfg(target_os = "macos")]
        {
            if std::process::Command::new("open").arg(&path_str).spawn().is_ok() {
                return Ok(());
            }
        }
        #[cfg(target_os = "linux")]
        {
            if std::process::Command::new("xdg-open").arg(&path_str).spawn().is_ok() {
                return Ok(());
            }
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 启动时静默清理上次更新遗留的 .old 和 .new 临时文件
    cleanup_old_executable();

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_health,
            app_set_window_title,
            app_window_minimize,
            app_window_toggle_maximize,
            app_window_close,
            app_window_start_dragging,
            app_get_cli_open_file,
            app_set_as_default_editor,
            app_open_default_apps_settings,
            app_get_exe_info,
            app_write_update_chunk,
            app_cancel_update,
            app_save_update_as,
            app_apply_update_and_restart,
            file_mtime,
            file_read,
            file_write,
            file_write_asset,
            file_export_save,
            file_pick_open,
            workspace_pick_open,
            workspace_restore_recent,
            workspace_recent_list,
            workspace_recent_clear,
            workspace_list_entries,
            workspace_read_file,
            workspace_write_file,
            workspace_create_directory,
            workspace_rename_entry,
            workspace_delete_entry,
            workspace_reveal_entry,
            workspace_write_binary,
            network_fetch_text,
            network_download_asset,
            app_read_asset_data_url,
            app_open_user_manual
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
