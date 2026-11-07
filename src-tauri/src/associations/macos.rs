#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use super::AssociationStatus;
use serde::{Deserialize, Serialize};
use std::{
    ffi::{c_char, c_void},
    fs,
    io::Write,
    path::{Path, PathBuf},
    ptr,
};
use tauri::Manager;

const BUNDLE_ID: &str = "org.hacklily.app";
const ALL_ROLES: u32 = u32::MAX;
type Ref = *const c_void;

#[cfg_attr(target_os = "macos", link(name = "CoreFoundation", kind = "framework"))]
unsafe extern "C" {
    fn CFStringCreateWithBytes(
        allocator: Ref,
        bytes: *const u8,
        length: isize,
        encoding: u32,
        external: u8,
    ) -> Ref;
    fn CFStringGetLength(value: Ref) -> isize;
    fn CFStringGetMaximumSizeForEncoding(length: isize, encoding: u32) -> isize;
    fn CFStringGetCString(value: Ref, buffer: *mut c_char, size: isize, encoding: u32) -> u8;
    fn CFURLCreateFromFileSystemRepresentation(
        allocator: Ref,
        bytes: *const u8,
        length: isize,
        directory: u8,
    ) -> Ref;
    fn CFRelease(value: Ref);
}

#[cfg_attr(target_os = "macos", link(name = "CoreServices", kind = "framework"))]
unsafe extern "C" {
    static kUTTagClassFilenameExtension: Ref;
    fn UTTypeCreatePreferredIdentifierForTag(class: Ref, tag: Ref, conforms: Ref) -> Ref;
    fn LSCopyDefaultRoleHandlerForContentType(content_type: Ref, roles: u32) -> Ref;
    fn LSSetDefaultRoleHandlerForContentType(content_type: Ref, roles: u32, handler: Ref) -> i32;
    fn LSRegisterURL(url: Ref, update: u8) -> i32;
}

struct Owned(Ref);
impl Drop for Owned {
    fn drop(&mut self) {
        unsafe {
            CFRelease(self.0);
        }
    }
}
impl Owned {
    fn take(value: Ref) -> Result<Self, String> {
        if value.is_null() {
            Err("macOS could not resolve the file association".into())
        } else {
            Ok(Self(value))
        }
    }
    fn string(value: &str) -> Result<Self, String> {
        Self::take(unsafe {
            CFStringCreateWithBytes(
                ptr::null(),
                value.as_ptr(),
                value.len() as isize,
                0x08000100,
                0,
            )
        })
    }
    fn text(&self) -> Result<String, String> {
        let size =
            unsafe { CFStringGetMaximumSizeForEncoding(CFStringGetLength(self.0), 0x08000100) } + 1;
        let mut bytes = vec![0; size as usize];
        if unsafe { CFStringGetCString(self.0, bytes.as_mut_ptr().cast(), size, 0x08000100) } == 0 {
            return Err("Cannot read the macOS application identifier".into());
        }
        let end = bytes.iter().position(|b| *b == 0).unwrap_or(bytes.len());
        String::from_utf8(bytes[..end].to_vec()).map_err(|e| e.to_string())
    }
}

#[derive(Serialize, Deserialize)]
struct Backup {
    content_type: String,
    previous: String,
}

fn state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("file-association.json"))
}
fn backup(app: &tauri::AppHandle) -> Result<Option<Backup>, String> {
    match fs::read(state_path(app)?) {
        Ok(data) => serde_json::from_slice(&data)
            .map(Some)
            .map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
fn bundle_directory(executable: &Path) -> Option<&Path> {
    executable
        .ancestors()
        .find(|path| path.extension().is_some_and(|ext| ext == "app"))
}
fn lilypond_type() -> Result<Owned, String> {
    let extension = Owned::string("ly")?;
    Owned::take(unsafe {
        UTTypeCreatePreferredIdentifierForTag(
            kUTTagClassFilenameExtension,
            extension.0,
            ptr::null(),
        )
    })
}
fn default_for(content_type: &Owned) -> Option<String> {
    Owned::take(unsafe { LSCopyDefaultRoleHandlerForContentType(content_type.0, ALL_ROLES) })
        .ok()
        .and_then(|value| value.text().ok())
}
fn set_default(content_type: &str, handler: &str) -> Result<(), String> {
    let content_type = Owned::string(content_type)?;
    let handler = Owned::string(handler)?;
    let result =
        unsafe { LSSetDefaultRoleHandlerForContentType(content_type.0, ALL_ROLES, handler.0) };
    if result != 0 {
        Err(format!(
            "macOS could not change the default .ly application (error {result})"
        ))
    } else {
        Ok(())
    }
}

pub fn status(app: &tauri::AppHandle) -> Result<AssociationStatus, String> {
    let saved = backup(app)?;
    let content_type = match saved.as_ref() {
        Some(saved) => Owned::string(&saved.content_type)?,
        None => lilypond_type()?,
    };
    let current = default_for(&content_type);
    Ok(AssociationStatus {
        supported: true,
        platform: "macos",
        registered: saved.is_some(),
        is_default: current.as_deref() == Some(BUNDLE_ID),
        current_default: current,
        previous_default: saved.map(|saved| saved.previous),
    })
}

pub fn register(app: &tauri::AppHandle) -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let bundle = bundle_directory(&executable)
        .ok_or("Launch the installed Hacklily.app bundle to register .ly files on macOS.")?;
    let path = bundle
        .to_str()
        .ok_or("The app bundle path is not valid UTF-8")?;
    let url = Owned::take(unsafe {
        CFURLCreateFromFileSystemRepresentation(ptr::null(), path.as_ptr(), path.len() as isize, 1)
    })?;
    let result = unsafe { LSRegisterURL(url.0, 1) };
    if result != 0 {
        return Err(format!(
            "macOS could not register Hacklily.app (error {result})"
        ));
    }
    let saved = match backup(app)? {
        Some(saved) => saved,
        None => {
            let content_type = lilypond_type()?;
            let previous = default_for(&content_type)
                .filter(|id| id != BUNDLE_ID)
                .or_else(|| {
                    Owned::string("public.plain-text")
                        .ok()
                        .and_then(|kind| default_for(&kind))
                        .filter(|id| id != BUNDLE_ID)
                })
                .unwrap_or_else(|| "com.apple.TextEdit".into());
            let saved = Backup {
                content_type: content_type.text()?,
                previous,
            };
            let state = state_path(app)?;
            let parent = state.parent().ok_or("Invalid association state path")?;
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
            file.write_all(&serde_json::to_vec(&saved).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            file.persist(state).map_err(|e| e.to_string())?;
            saved
        }
    };
    set_default(&saved.content_type, BUNDLE_ID)
}

pub fn unregister(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(saved) = backup(app)? {
        if default_for(&Owned::string(&saved.content_type)?).as_deref() == Some(BUNDLE_ID) {
            set_default(&saved.content_type, &saved.previous)?;
        }
        fs::remove_file(state_path(app)?).map_err(|e| e.to_string())?;
    }
    // The installed .app remains available under Finder's Open With menu.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn locates_the_installed_bundle_without_relying_on_cwd() {
        assert_eq!(
            bundle_directory(Path::new(
                "/Applications/音乐 Scores.app/Contents/MacOS/hacklily-desktop"
            )),
            Some(Path::new("/Applications/音乐 Scores.app"))
        );
        assert_eq!(
            bundle_directory(Path::new("/tmp/debug/hacklily-desktop")),
            None
        );
    }
}
