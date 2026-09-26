use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
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
            app_open_user_manual
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
