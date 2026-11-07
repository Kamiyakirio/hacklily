use crate::{engine::EngineManager, render};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tokio::{process::Command, sync::watch};

#[derive(Serialize)]
pub struct ScoreFile {
    pub path: String,
    pub src: String,
}

#[tauri::command]
pub async fn open_score(app: AppHandle) -> Result<Option<ScoreFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("LilyPond", &["ly"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 8 * 1024 * 1024 {
            return Err("The score exceeds 8 MiB".into());
        }
        let src = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        Ok(Some(ScoreFile {
            path: path.to_string_lossy().into_owned(),
            src,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_score(
    app: AppHandle,
    src: String,
    path: Option<String>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = match path {
            Some(path) => PathBuf::from(path),
            None => {
                let Some(file) = app
                    .dialog()
                    .file()
                    .add_filter("LilyPond", &["ly"])
                    .set_file_name("score.ly")
                    .blocking_save_file()
                else {
                    return Ok(None);
                };
                file.into_path().map_err(|e| e.to_string())?
            }
        };
        atomic_write(&path, src.as_bytes())?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Pdf,
    Midi,
    Ly,
}

#[tauri::command]
pub async fn save_export(
    app: AppHandle,
    content: String,
    format: ExportFormat,
    name: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (description, extension) = match format {
            ExportFormat::Pdf => ("PDF", "pdf"),
            ExportFormat::Midi => ("MIDI", "midi"),
            ExportFormat::Ly => ("LilyPond", "ly"),
        };
        let Some(file) = app
            .dialog()
            .file()
            .add_filter(description, &[extension])
            .set_file_name(format!("{name}.{extension}"))
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        let bytes = STANDARD.decode(content).map_err(|e| e.to_string())?;
        atomic_write(&path, &bytes)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid save path")?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    file.write_all(bytes).map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn import_musicxml(
    app: AppHandle,
    engine: State<'_, EngineManager>,
) -> Result<Option<ScoreFile>, String> {
    let chosen = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("MusicXML", &["xml", "musicxml", "mxl"])
            .blocking_pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(file) = chosen else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    engine.executable()?;
    let src = convert_musicxml(&engine.root, &path).await?;
    Ok(Some(ScoreFile {
        path: path.to_string_lossy().into_owned(),
        src,
    }))
}

async fn convert_musicxml(root: &Path, path: &Path) -> Result<String, String> {
    let bin = root.join("bin");
    let temporary = tempfile::tempdir().map_err(|e| e.to_string())?;
    let output = temporary.path().join("import.ly");
    let mut command = if cfg!(windows) {
        let mut python = Command::new(bin.join("python.exe"));
        python.arg(bin.join("musicxml2ly.py"));
        python
    } else {
        Command::new(bin.join("musicxml2ly"))
    };
    command.arg(path).arg("--output").arg(&output);
    let (_cancel, cancelled) = watch::channel(false);
    let (success, logs) = render::run(command, cancelled).await?;
    if !success || !output.is_file() {
        return Err(logs);
    }
    std::fs::read_to_string(output).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replaces_the_selected_file_atomically() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("音乐.ly");
        std::fs::write(&path, "old").unwrap();
        atomic_write(&path, "new 音符".as_bytes()).unwrap();
        assert_eq!(std::fs::read_to_string(path).unwrap(), "new 音符");
    }
    #[tokio::test]
    #[ignore = "requires HACKLILY_TEST_ENGINE"]
    async fn imports_real_musicxml_with_the_bundled_converter() {
        let exe = PathBuf::from(std::env::var("HACKLILY_TEST_ENGINE").unwrap());
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("score.musicxml");
        std::fs::write(&path, r#"<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>"#).unwrap();
        let source = convert_musicxml(exe.parent().unwrap().parent().unwrap(), &path)
            .await
            .unwrap();
        assert!(source.contains("\\version"));
        assert!(source.contains("\\score"));
    }
}
