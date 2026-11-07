use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::ipc::Channel;
use tokio::{io::AsyncWriteExt, sync::Mutex};

pub const VERSION: &str = "2.26.0";

pub struct EngineManager {
    pub root: PathBuf,
    installation: Mutex<()>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineProgress {
    pub stage: &'static str,
    pub downloaded: u64,
    pub total: Option<u64>,
}

#[derive(Serialize)]
pub struct EngineInfo {
    pub version: &'static str,
}

struct Distribution {
    filename: &'static str,
    sha256: &'static str,
}

fn distribution() -> Result<Distribution, String> {
    // SHA-256 values published with the official GitLab 2.26.0 package files.
    // https://gitlab.com/api/v4/projects/18695663/packages/58476196/package_files
    let (filename, sha256) = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => (
            "lilypond-2.26.0-mingw-x86_64.zip",
            "14ddddc233b469ef60d4ffc1c7f35520f15ac6b58e38cab458c60bdcc3af650c",
        ),
        ("linux", "x86_64") => (
            "lilypond-2.26.0-linux-x86_64.tar.gz",
            "cd8a097a9f52cb2b9f4e7914774786f203f4fc61fcd299afcbb63c23fa5c6b24",
        ),
        ("macos", "x86_64") => (
            "lilypond-2.26.0-darwin-x86_64.tar.gz",
            "6dcbca34b13ad6d4ba3606a0b48edd02688284fcd52e9c00141242df1996a148",
        ),
        ("macos", "aarch64") => (
            "lilypond-2.26.0-darwin-arm64.tar.gz",
            "18ffc454fef3753c26a015d95a3c232f89b22f052b897c046e0198740a1221be",
        ),
        _ => {
            return Err(format!(
                "No official LilyPond package is configured for {} / {}",
                std::env::consts::OS,
                std::env::consts::ARCH
            ));
        }
    };
    Ok(Distribution { filename, sha256 })
}

impl EngineManager {
    pub fn new(engine_dir: PathBuf) -> Self {
        Self {
            root: engine_dir.join(format!(
                "{VERSION}-{}-{}",
                std::env::consts::OS,
                std::env::consts::ARCH
            )),
            installation: Mutex::new(()),
        }
    }

    pub fn executable(&self) -> Result<PathBuf, String> {
        let exe = self.root.join("bin").join(if cfg!(windows) {
            "lilypond.exe"
        } else {
            "lilypond"
        });
        if !exe.is_file() || !self.root.join(".installed").is_file() {
            return Err("LilyPond is not ready. Download the engine first.".into());
        }
        Ok(exe)
    }

    pub async fn prepare(&self, progress: Channel<EngineProgress>) -> Result<EngineInfo, String> {
        let _guard = self.installation.lock().await;
        let package = distribution()?;
        if self.executable().is_ok() {
            let _ = progress.send(EngineProgress {
                stage: "ready",
                downloaded: 0,
                total: None,
            });
            return Ok(EngineInfo { version: VERSION });
        }
        let parent = self.root.parent().ok_or("Invalid engine directory")?;
        std::fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Could not create the engine directory {}: {e}",
                parent.display()
            )
        })?;
        let staging = tempfile::tempdir_in(parent).map_err(|e| {
            format!(
                "Could not create an installation directory in {}: {e}",
                parent.display()
            )
        })?;
        let archive = staging.path().join(package.filename);
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|e| e.to_string())?;
        let url = format!(
            "https://gitlab.com/api/v4/projects/18695663/packages/generic/lilypond/{VERSION}/{}",
            package.filename
        );
        let mut response = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Could not download LilyPond: {e}"))?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        let total = response.content_length();
        let mut file = tokio::fs::File::create(&archive)
            .await
            .map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut downloaded = 0;
        let mut last_progress = std::time::Instant::now();
        let _ = progress.send(EngineProgress {
            stage: "downloading",
            downloaded,
            total,
        });
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            downloaded += chunk.len() as u64;
            if downloaded > 150 * 1024 * 1024 {
                return Err("LilyPond download exceeds the expected size".into());
            }
            hasher.update(&chunk);
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
            if last_progress.elapsed() >= Duration::from_millis(150) {
                let _ = progress.send(EngineProgress {
                    stage: "downloading",
                    downloaded,
                    total,
                });
                last_progress = std::time::Instant::now();
            }
        }
        file.flush().await.map_err(|e| e.to_string())?;
        drop(file);
        let checksum: String = hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        if checksum != package.sha256 {
            return Err("LilyPond download checksum mismatch. Please retry.".into());
        }
        let _ = progress.send(EngineProgress {
            stage: "extracting",
            downloaded,
            total,
        });
        let destination = self.root.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let unpacked = staging.path().join("unpacked");
            std::fs::create_dir(&unpacked).map_err(|e| e.to_string())?;
            extract(&archive, &unpacked)?;
            let package_root = std::fs::read_dir(&unpacked)
                .map_err(|e| e.to_string())?
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .find(|path| {
                    path.join("bin")
                        .join(if cfg!(windows) {
                            "lilypond.exe"
                        } else {
                            "lilypond"
                        })
                        .is_file()
                })
                .ok_or("The downloaded package does not contain LilyPond")?;
            std::fs::write(package_root.join(".installed"), package.sha256)
                .map_err(|e| e.to_string())?;
            // The staging directory is on the same filesystem: readers only see
            // the completed installation after the atomic rename.
            install_directory(&package_root, &destination)?;
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??;
        self.executable()?;
        let _ = progress.send(EngineProgress {
            stage: "ready",
            downloaded,
            total,
        });
        Ok(EngineInfo { version: VERSION })
    }
}

fn install_directory(source: &Path, destination: &Path) -> Result<(), String> {
    // Windows scanners can briefly hold newly extracted executables and DLLs
    // open, preventing the final atomic directory rename.
    for attempt in 0..40 {
        match std::fs::rename(source, destination) {
            Ok(()) => return Ok(()),
            Err(error)
                if cfg!(windows)
                    && matches!(error.raw_os_error(), Some(5 | 32 | 33))
                    && attempt < 39 =>
            {
                std::thread::sleep(Duration::from_millis(250));
            }
            Err(error) => {
                return Err(format!(
                    "Could not install LilyPond from {} to {}: {error}",
                    source.display(),
                    destination.display()
                ));
            }
        }
    }
    unreachable!()
}

fn extract(archive: &Path, destination: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    if archive
        .extension()
        .is_some_and(|extension| extension == "zip")
    {
        let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        let mut expanded = 0;
        for index in 0..zip.len() {
            let mut entry = zip.by_index(index).map_err(|e| e.to_string())?;
            let relative = entry
                .enclosed_name()
                .ok_or("Invalid path in LilyPond archive")?;
            let output = destination.join(relative);
            expanded += entry.size();
            if expanded > 1024 * 1024 * 1024 {
                return Err("LilyPond archive is too large".into());
            }
            if entry.is_dir() {
                std::fs::create_dir_all(&output)
                    .map_err(|e| format!("Could not create {}: {e}", output.display()))?;
            } else {
                if let Some(parent) = output.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Could not create {}: {e}", parent.display()))?;
                }
                let mut target = std::fs::File::create(&output)
                    .map_err(|e| format!("Could not create {}: {e}", output.display()))?;
                std::io::copy(&mut entry, &mut target)
                    .map_err(|e| format!("Could not extract {}: {e}", output.display()))?;
            }
        }
    } else {
        tar::Archive::new(flate2::read::GzDecoder::new(file))
            .unpack(destination)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[cfg(windows)]
    #[test]
    fn waits_for_temporary_windows_directory_handles() {
        use std::os::windows::fs::OpenOptionsExt;
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("unpacked");
        let destination = temp.path().join("installed");
        std::fs::create_dir(&source).unwrap();
        std::fs::write(source.join("engine.dll"), b"complete").unwrap();
        let scanner = std::fs::OpenOptions::new()
            .read(true)
            .custom_flags(0x02000000) // FILE_FLAG_BACKUP_SEMANTICS: open a directory
            .share_mode(3) // FILE_SHARE_READ | FILE_SHARE_WRITE, without DELETE
            .open(&source)
            .unwrap();
        let release_handle = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            drop(scanner);
        });
        install_directory(&source, &destination).unwrap();
        release_handle.join().unwrap();
        assert_eq!(
            std::fs::read(destination.join("engine.dll")).unwrap(),
            b"complete"
        );
        assert!(!source.exists());
    }
    #[test]
    fn ignores_partial_installations() {
        let temp = tempfile::tempdir().unwrap();
        let manager = EngineManager::new(temp.path().to_path_buf());
        std::fs::create_dir_all(manager.root.join("bin")).unwrap();
        std::fs::write(
            manager.root.join("bin").join(if cfg!(windows) {
                "lilypond.exe"
            } else {
                "lilypond"
            }),
            "partial",
        )
        .unwrap();
        assert!(manager.executable().is_err());
        std::fs::write(manager.root.join(".installed"), "complete").unwrap();
        assert!(manager.executable().is_ok());
    }
    #[test]
    fn rejects_archive_traversal() {
        let temp = tempfile::tempdir().unwrap();
        let archive = temp.path().join("test.zip");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&archive).unwrap());
        zip.start_file("../escape", zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"escape").unwrap();
        zip.finish().unwrap();
        assert!(extract(&archive, &temp.path().join("output")).is_err());
        assert!(!temp.path().join("escape").exists());
    }
}
