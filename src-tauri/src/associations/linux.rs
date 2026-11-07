#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use super::AssociationStatus;
use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::Manager;

const MIME: &str = "text/x-lilypond";
const DESKTOP: &str = "org.hacklily.app-user.desktop";
const MIME_XML: &str = "org.hacklily.app-user.xml";

#[derive(Serialize, Deserialize)]
struct Backup {
    previous: Option<String>,
}

struct Paths {
    config: PathBuf,
    data: PathBuf,
    state: PathBuf,
}

impl Paths {
    fn for_app(app: &tauri::AppHandle) -> Result<Self, String> {
        let home = env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or("HOME is not set")?;
        let directory = |name, fallback| {
            env::var_os(name)
                .map(PathBuf::from)
                .filter(|p| p.is_absolute())
                .unwrap_or_else(|| home.join(fallback))
        };
        Ok(Self {
            config: directory("XDG_CONFIG_HOME", ".config"),
            data: directory("XDG_DATA_HOME", ".local/share"),
            state: app
                .path()
                .app_config_dir()
                .map_err(|e| e.to_string())?
                .join("file-association.json"),
        })
    }
    fn desktop(&self) -> PathBuf {
        self.data.join("applications").join(DESKTOP)
    }
    fn mime_xml(&self) -> PathBuf {
        self.data.join("mime/packages").join(MIME_XML)
    }
    fn mimeapps(&self) -> Vec<PathBuf> {
        let desktops = env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
        let mut paths = Vec::new();
        for base in [&self.config, &self.data.join("applications")] {
            paths.push(base.join("mimeapps.list"));
            for desktop in desktops
                .split(':')
                .filter(|d| !d.is_empty() && !d.contains(['/', '\\']))
            {
                paths.push(base.join(format!("{}-mimeapps.list", desktop.to_ascii_lowercase())));
            }
        }
        paths
    }
}

fn command(program: &str, args: &[&std::ffi::OsStr]) -> Result<String, String> {
    let result = Command::new(program).args(args).output().map_err(|e| {
        format!("{program}: {e}. Install xdg-utils, shared-mime-info, and desktop-file-utils.")
    })?;
    if !result.status.success() {
        return Err(format!(
            "{program}: {}",
            String::from_utf8_lossy(&result.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&result.stdout).trim().into())
}

fn current_default() -> Result<Option<String>, String> {
    let value = command(
        "xdg-mime",
        &["query".as_ref(), "default".as_ref(), MIME.as_ref()],
    )?;
    Ok((!value.is_empty()).then_some(value))
}

fn backup(paths: &Paths) -> Result<Option<Backup>, String> {
    match fs::read(&paths.state) {
        Ok(data) => serde_json::from_slice(&data)
            .map(Some)
            .map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn write(path: &Path, content: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid association path")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    file.write_all(content).map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

fn remove(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        other => other.map_err(|e| e.to_string()),
    }
}

fn desktop_entry(executable: &Path) -> String {
    // Desktop Entry Exec has its own escaping; it is not a shell command.
    let executable = executable
        .to_string_lossy()
        .replace('\\', r"\\\\")
        .replace('"', r#"\\""#)
        .replace('`', r"\\`")
        .replace('$', r"\\$")
        .replace('%', "%%")
        .replace('\n', "\\n")
        .replace('\r', "\\r");
    format!(
        "[Desktop Entry]\nType=Application\nName=Hacklily\nExec=\"{executable}\" %f\nMimeType={MIME};\nTerminal=false\nNoDisplay=true\nCategories=AudioVideo;Music;\n"
    )
}

fn remove_our_references(source: &str) -> String {
    let mut output = String::new();
    for line in source.split_inclusive('\n') {
        let clean = line.trim_end_matches(['\r', '\n']);
        if let Some((key, value)) = clean.split_once('=') {
            if key.trim() == MIME && value.split(';').any(|id| id.trim() == DESKTOP) {
                let other: Vec<_> = value
                    .split(';')
                    .filter(|id| !id.is_empty() && id.trim() != DESKTOP)
                    .collect();
                if !other.is_empty() {
                    output.push_str(&format!("{key}={};\n", other.join(";")));
                }
                continue;
            }
        }
        output.push_str(line);
    }
    output
}

fn refresh(paths: &Paths) -> Result<(), String> {
    command(
        "update-mime-database",
        &[paths.data.join("mime").as_os_str()],
    )?;
    command(
        "update-desktop-database",
        &[paths.data.join("applications").as_os_str()],
    )?;
    Ok(())
}

pub fn status(app: &tauri::AppHandle) -> Result<AssociationStatus, String> {
    let paths = Paths::for_app(app)?;
    let current = current_default()?;
    Ok(AssociationStatus {
        supported: true,
        platform: "linux",
        registered: paths.desktop().is_file() || paths.state.is_file(),
        is_default: current.as_deref() == Some(DESKTOP),
        current_default: current,
        previous_default: backup(&paths)?.and_then(|b| b.previous),
    })
}

pub fn register(app: &tauri::AppHandle) -> Result<(), String> {
    let paths = Paths::for_app(app)?;
    let current = current_default()?;
    if backup(&paths)?.is_none() {
        let previous = current.filter(|id| id != DESKTOP);
        write(
            &paths.state,
            &serde_json::to_vec(&Backup { previous }).map_err(|e| e.to_string())?,
        )?;
    }
    // APPIMAGE points at the persistent executable rather than its temporary mount.
    let executable = env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .unwrap_or(env::current_exe().map_err(|e| e.to_string())?);
    write(&paths.desktop(), desktop_entry(&executable).as_bytes())?;
    write(&paths.mime_xml(), br#"<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="text/x-lilypond"><comment>LilyPond score</comment><sub-class-of type="text/plain"/><glob pattern="*.ly"/></mime-type>
</mime-info>"#)?;
    refresh(&paths)?;
    command(
        "xdg-mime",
        &["default".as_ref(), DESKTOP.as_ref(), MIME.as_ref()],
    )?;
    if current_default()?.as_deref() != Some(DESKTOP) {
        return Err(
            "The desktop environment did not accept Hacklily as the default .ly application."
                .into(),
        );
    }
    Ok(())
}

pub fn unregister(app: &tauri::AppHandle) -> Result<(), String> {
    let paths = Paths::for_app(app)?;
    let previous = backup(&paths)?.and_then(|b| b.previous);
    if current_default()?.as_deref() == Some(DESKTOP) {
        if let Some(previous) = previous.as_deref() {
            command(
                "xdg-mime",
                &["default".as_ref(), previous.as_ref(), MIME.as_ref()],
            )?;
        }
    }
    // Remove only our desktop ID, preserving defaults chosen after registration.
    for path in paths.mimeapps() {
        match fs::read_to_string(&path) {
            Ok(source) => {
                let updated = remove_our_references(&source);
                if updated != source {
                    write(&path, updated.as_bytes())?;
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    remove(&paths.desktop())?;
    remove(&paths.mime_xml())?;
    refresh(&paths)?;
    remove(&paths.state)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn removal_preserves_other_defaults_and_unrelated_user_edits() {
        let before = format!(
            "# user comment\n[Default Applications]\n{MIME}={DESKTOP};other.desktop;\ntext/plain=editor.desktop;\n[Added Associations]\n{MIME}=third.desktop;{DESKTOP};\n[Removed Associations]\n{MIME}={DESKTOP};\n"
        );
        let after = remove_our_references(&before);
        assert_eq!(
            after,
            format!(
                "# user comment\n[Default Applications]\n{MIME}=other.desktop;\ntext/plain=editor.desktop;\n[Added Associations]\n{MIME}=third.desktop;\n[Removed Associations]\n"
            )
        );
        assert_eq!(remove_our_references(&after), after);
    }
    #[test]
    fn desktop_exec_quotes_paths_and_never_expands_shell_or_field_codes() {
        let value = desktop_entry(Path::new("/Apps/音乐 Scores/$cost 50%/hacklily"));
        assert!(value.contains("Exec=\"/Apps/音乐 Scores/\\\\$cost 50%%/hacklily\" %f\n"));
        assert!(value.contains("MimeType=text/x-lilypond;"));
    }
}
