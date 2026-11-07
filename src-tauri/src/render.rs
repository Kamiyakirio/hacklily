use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::{Child, Command},
    sync::{Semaphore, watch},
};

use crate::engine::EngineManager;

pub struct RenderManager {
    queue: Semaphore,
    jobs: Mutex<Jobs>,
}

#[derive(Default)]
struct Jobs {
    active: HashMap<String, watch::Sender<bool>>,
    cancelled: VecDeque<String>,
}

impl Default for RenderManager {
    fn default() -> Self {
        Self {
            queue: Semaphore::new(1),
            jobs: Mutex::new(Jobs::default()),
        }
    }
}

#[derive(Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Svg,
    Pdf,
}

#[derive(Serialize)]
pub struct RenderResult {
    pub files: Vec<String>,
    pub logs: String,
    pub midi: Option<String>,
    pub errors: usize,
}

impl RenderManager {
    pub fn cancel(&self, request_id: &str) {
        if let Ok(mut jobs) = self.jobs.lock() {
            if let Some(job) = jobs.active.get(request_id) {
                let _ = job.send(true);
            } else {
                // IPC cancellation can arrive before the async render command
                // is first polled. Remember a bounded number of early cancels.
                if jobs.cancelled.len() == 256 {
                    jobs.cancelled.pop_front();
                }
                jobs.cancelled.push_back(request_id.to_owned());
            }
        }
    }

    pub async fn render(
        &self,
        engine: &EngineManager,
        request_id: String,
        src: String,
        format: Format,
        include_dir: Option<String>,
    ) -> Result<RenderResult, String> {
        let executable = engine.executable()?;
        let (cancel, mut cancelled) = watch::channel(false);
        {
            let mut jobs = self.jobs.lock().map_err(|e| e.to_string())?;
            if let Some(index) = jobs.cancelled.iter().position(|id| id == &request_id) {
                jobs.cancelled.remove(index);
                return Err("Render cancelled".into());
            }
            if jobs.active.contains_key(&request_id) {
                return Err("Duplicate render request".into());
            }
            jobs.active.insert(request_id.clone(), cancel);
        }
        let result = async {
            let _permit = tokio::select! {
                permit = self.queue.acquire() => permit.map_err(|e| e.to_string())?,
                _ = cancelled.changed() => return Err("Render cancelled".into()),
            };
            if *cancelled.borrow() {
                return Err("Render cancelled".into());
            }
            compile(&executable, &src, format, include_dir.as_deref(), cancelled).await
        }
        .await;
        if let Ok(mut jobs) = self.jobs.lock() {
            jobs.active.remove(&request_id);
        }
        result
    }
}

pub async fn compile(
    executable: &Path,
    src: &str,
    format: Format,
    include_dir: Option<&str>,
    cancelled: watch::Receiver<bool>,
) -> Result<RenderResult, String> {
    if src.len() > 8 * 1024 * 1024 {
        return Err("The score exceeds 8 MiB".into());
    }
    let directory = tempfile::tempdir().map_err(|e| e.to_string())?;
    std::fs::write(directory.path().join("hacklily.ly"), src).map_err(|e| e.to_string())?;
    let mut command = Command::new(executable);
    command
        .current_dir(directory.path())
        .kill_on_drop(true)
        .arg(if format == Format::Svg {
            "--svg"
        } else {
            "--pdf"
        })
        .args(["--output=score", "--loglevel=INFO"])
        .env("LANG", "C")
        .env("LC_ALL", "C");
    if let Some(include) = include_dir {
        command.arg("-I").arg(format!("{include}/"));
    }
    command.arg("hacklily.ly");
    let (success, logs) = run(command, cancelled).await?;
    let mut files = Vec::new();
    let extension = if format == Format::Svg { "svg" } else { "pdf" };
    let mut outputs: Vec<PathBuf> = std::fs::read_dir(directory.path())
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == extension))
        .collect();
    outputs.sort_by_key(|path| page_number(path));
    if outputs.len() > 256 {
        return Err("The score exceeds 256 output pages".into());
    }
    if success {
        for output in outputs {
            let bytes = read_output(&output)?;
            files.push(if format == Format::Svg {
                String::from_utf8(bytes).map_err(|e| e.to_string())?
            } else {
                STANDARD.encode(bytes)
            });
        }
    }
    let midi_path = ["score.midi", "score.mid"]
        .into_iter()
        .map(|name| directory.path().join(name))
        .find(|path| path.is_file());
    let midi = if success {
        midi_path
            .map(|path| read_output(&path).map(|bytes| STANDARD.encode(bytes)))
            .transpose()?
    } else {
        None
    };
    if format == Format::Pdf && files.is_empty() {
        return Err(logs);
    }
    Ok(RenderResult {
        files,
        logs,
        midi,
        errors: usize::from(!success),
    })
}

fn read_output(path: &Path) -> Result<Vec<u8>, String> {
    if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > 64 * 1024 * 1024 {
        return Err("A rendered file exceeds 64 MiB".into());
    }
    std::fs::read(path).map_err(|e| e.to_string())
}

fn page_number(path: &Path) -> usize {
    path.file_stem()
        .and_then(|name| name.to_str())
        .and_then(|name| name.strip_prefix("score-"))
        .and_then(|number| number.parse().ok())
        .unwrap_or(0)
}

async fn drain(mut pipe: impl AsyncRead + Unpin) -> Result<Vec<u8>, std::io::Error> {
    let mut output = Vec::new();
    let mut buffer = [0_u8; 8192];
    loop {
        let read = pipe.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        let keep = read.min((4_usize * 1024 * 1024).saturating_sub(output.len()));
        output.extend_from_slice(&buffer[..keep]);
    }
    Ok(output)
}

pub async fn run(
    mut command: Command,
    mut cancelled: watch::Receiver<bool>,
) -> Result<(bool, String), String> {
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    #[cfg(unix)]
    command.process_group(0);
    command
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Could not start LilyPond: {e}"))?;
    let stdout = child.stdout.take().ok_or("Missing LilyPond stdout")?;
    let stderr = child.stderr.take().ok_or("Missing LilyPond stderr")?;
    let stdout_task = tokio::spawn(drain(stdout));
    let stderr_task = tokio::spawn(drain(stderr));
    let status = tokio::select! {
        status = child.wait() => status.map_err(|e| e.to_string()),
        _ = cancelled.changed() => { stop(&mut child).await; Err("Render cancelled".into()) },
        _ = tokio::time::sleep(Duration::from_secs(60)) => { stop(&mut child).await; Err("LilyPond timed out after 60 seconds".into()) },
    };
    let stdout = stdout_task
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    let stderr = stderr_task
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    let logs = format!(
        "{}{}",
        String::from_utf8_lossy(&stdout),
        String::from_utf8_lossy(&stderr)
    );
    let status = status.map_err(|message| format!("{message}\n{logs}"))?;
    Ok((status.success(), logs))
}

async fn stop(child: &mut Child) {
    if let Some(pid) = child.id() {
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill.exe")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(0x08000000)
                .output()
                .await;
        }
        #[cfg(unix)]
        unsafe {
            libc::kill(-(pid as i32), libc::SIGKILL);
        }
    }
    let _ = child.kill().await;
    let _ = child.wait().await;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn honours_cancellation_before_the_render_command_starts() {
        let temp = tempfile::tempdir().unwrap();
        let engine = EngineManager::new(temp.path().to_path_buf());
        std::fs::create_dir_all(engine.root.join("bin")).unwrap();
        std::fs::write(
            engine.root.join("bin").join(if cfg!(windows) {
                "lilypond.exe"
            } else {
                "lilypond"
            }),
            "must not run",
        )
        .unwrap();
        std::fs::write(engine.root.join(".installed"), "complete").unwrap();
        let manager = RenderManager::default();
        manager.cancel("early");
        let result = manager
            .render(&engine, "early".into(), "score".into(), Format::Svg, None)
            .await;
        assert_eq!(result.err().unwrap(), "Render cancelled");
    }

    #[tokio::test]
    #[ignore = "requires HACKLILY_TEST_ENGINE"]
    async fn cancels_a_running_lilypond_process() {
        let exe = PathBuf::from(std::env::var("HACKLILY_TEST_ENGINE").unwrap());
        let (cancel, cancelled) = watch::channel(false);
        let task = tokio::spawn(async move {
            compile(&exe, "#(let loop () (loop))", Format::Svg, None, cancelled).await
        });
        tokio::time::sleep(Duration::from_millis(200)).await;
        cancel.send(true).unwrap();
        let result = tokio::time::timeout(Duration::from_secs(10), task)
            .await
            .unwrap()
            .unwrap();
        assert!(result.err().unwrap().starts_with("Render cancelled"));
    }
    #[test]
    fn sorts_pages_numerically() {
        let mut pages = ["score-10.svg", "score-2.svg", "score-1.svg"];
        pages.sort_by_key(|page| page_number(Path::new(page)));
        assert_eq!(pages, ["score-1.svg", "score-2.svg", "score-10.svg"]);
    }

    #[tokio::test]
    #[ignore = "requires the official LilyPond package; set HACKLILY_TEST_ENGINE to its executable"]
    async fn renders_real_svg_pdf_midi_and_errors() {
        let exe = PathBuf::from(std::env::var("HACKLILY_TEST_ENGINE").unwrap());
        let (_cancel, cancelled) = watch::channel(false);
        let source = r#"\version "2.26.0"
\score { \relative c' { c4 d e f } \layout {} \midi {} }"#;
        let svg = compile(&exe, source, Format::Svg, None, cancelled.clone())
            .await
            .unwrap();
        assert!(!svg.files.is_empty(), "{}", svg.logs);
        assert!(svg.files[0].contains("<svg"));
        assert!(svg.files[0].contains("hacklily.ly:2:"), "{}", svg.files[0]);
        assert!(
            STANDARD
                .decode(svg.midi.unwrap())
                .unwrap()
                .starts_with(b"MThd")
        );
        let pdf = compile(&exe, source, Format::Pdf, None, cancelled.clone())
            .await
            .unwrap();
        assert!(
            STANDARD
                .decode(&pdf.files[0])
                .unwrap()
                .starts_with(b"%PDF-")
        );
        let error = compile(
            &exe,
            "\\notAValidLilypondCommand",
            Format::Svg,
            None,
            cancelled,
        )
        .await
        .unwrap();
        assert!(error.files.is_empty());
        assert_eq!(error.errors, 1);
        assert!(error.logs.contains("hacklily.ly:1:"));
    }
}
