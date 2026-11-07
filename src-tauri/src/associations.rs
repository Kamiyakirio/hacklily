use serde::Serialize;

#[cfg(any(target_os = "linux", test))]
#[path = "associations/linux.rs"]
mod linux;
#[cfg(any(target_os = "macos", test))]
#[path = "associations/macos.rs"]
mod macos;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssociationStatus {
    supported: bool,
    platform: &'static str,
    registered: bool,
    is_default: bool,
    current_default: Option<String>,
    previous_default: Option<String>,
}

#[tauri::command]
pub fn file_association_status(app: tauri::AppHandle) -> Result<AssociationStatus, String> {
    let _ = &app;
    #[cfg(windows)]
    return windows::status().map_err(|e| e.to_string());
    #[cfg(target_os = "linux")]
    return linux::status(&app);
    #[cfg(target_os = "macos")]
    return macos::status(&app);
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    Ok(AssociationStatus {
        supported: false,
        platform: "unsupported",
        registered: false,
        is_default: false,
        current_default: None,
        previous_default: None,
    })
}

#[tauri::command]
pub fn register_file_association(app: tauri::AppHandle) -> Result<AssociationStatus, String> {
    #[cfg(windows)]
    {
        windows::register().map_err(|e| e.to_string())?;
        file_association_status(app)
    }
    #[cfg(target_os = "linux")]
    {
        linux::register(&app)?;
        file_association_status(app)
    }
    #[cfg(target_os = "macos")]
    {
        macos::register(&app)?;
        file_association_status(app)
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    Err("File associations are supported on Windows, macOS, and Linux.".into())
}

#[tauri::command]
pub fn unregister_file_association(app: tauri::AppHandle) -> Result<AssociationStatus, String> {
    #[cfg(windows)]
    {
        if windows::status().map_err(|e| e.to_string())?.is_default {
            return Err("Choose another default app for .ly in Windows Settings before removing Hacklily's registration.".into());
        }
        windows::unregister().map_err(|e| e.to_string())?;
        file_association_status(app)
    }
    #[cfg(target_os = "linux")]
    {
        linux::unregister(&app)?;
        file_association_status(app)
    }
    #[cfg(target_os = "macos")]
    {
        macos::unregister(&app)?;
        file_association_status(app)
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    Err("File associations are supported on Windows, macOS, and Linux.".into())
}

#[tauri::command]
pub fn open_default_apps(for_hacklily: bool) -> Result<(), String> {
    #[cfg(windows)]
    return windows::open_settings(for_hacklily);
    #[cfg(not(windows))]
    {
        let _ = for_hacklily;
        Err("Open your operating system's default application settings.".into())
    }
}

#[cfg(windows)]
mod windows {
    use super::AssociationStatus;
    use std::{io, path::Path, ptr};
    use windows_sys::Win32::UI::{
        Shell::{
            ASSOCSTR, ASSOCSTR_FRIENDLYAPPNAME, ASSOCSTR_PROGID, AssocQueryStringW,
            SHCNE_ASSOCCHANGED, SHCNF_IDLIST, SHChangeNotify, ShellExecuteW,
        },
        WindowsAndMessaging::SW_SHOWNORMAL,
    };
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};

    const PROG_ID: &str = "org.hacklily.app.LilyPond";
    const APP_KEY: &str = r"Software\Hacklily\FileAssociations";
    const CAPABILITIES: &str = r"Software\Hacklily\FileAssociations\Capabilities";
    const OPEN_WITH: &str = r"Software\Classes\.ly\OpenWithProgids";
    const REGISTERED_APPS: &str = r"Software\RegisteredApplications";

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }

    fn query_association(kind: ASSOCSTR) -> Option<String> {
        let extension = wide(".ly");
        let mut length = 0;
        // Querying through the Shell respects Windows UserChoice and policy.
        unsafe {
            AssocQueryStringW(
                0,
                kind,
                extension.as_ptr(),
                ptr::null(),
                ptr::null_mut(),
                &mut length,
            );
        }
        if length == 0 {
            return None;
        }
        let mut buffer = vec![0u16; length as usize];
        let result = unsafe {
            AssocQueryStringW(
                0,
                kind,
                extension.as_ptr(),
                ptr::null(),
                buffer.as_mut_ptr(),
                &mut length,
            )
        };
        if result < 0 {
            return None;
        }
        let value = String::from_utf16_lossy(&buffer[..length.saturating_sub(1) as usize]);
        (!value.is_empty()).then_some(value)
    }

    fn optional_key(root: &RegKey, path: &str) -> io::Result<Option<RegKey>> {
        match root.open_subkey(path) {
            Ok(key) => Ok(Some(key)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    }

    fn ignore_missing(result: io::Result<()>) -> io::Result<()> {
        match result {
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            other => other,
        }
    }

    pub fn status() -> io::Result<AssociationStatus> {
        let root = RegKey::predef(HKEY_CURRENT_USER);
        let registered = optional_key(
            &root,
            &format!(r"Software\Classes\{PROG_ID}\shell\open\command"),
        )?
        .and_then(|key| key.get_value::<String, _>("").ok())
        .is_some();
        let previous_default =
            optional_key(&root, APP_KEY)?.and_then(|key| key.get_value("PreviousDefaultName").ok());
        Ok(AssociationStatus {
            supported: true,
            platform: "windows",
            registered,
            is_default: query_association(ASSOCSTR_PROGID)
                .is_some_and(|id| id.eq_ignore_ascii_case(PROG_ID)),
            current_default: query_association(ASSOCSTR_FRIENDLYAPPNAME),
            previous_default,
        })
    }

    fn register_at(root: &RegKey, executable: &Path, previous: Option<&str>) -> io::Result<()> {
        let executable = executable.to_string_lossy();
        let (metadata, _) = root.create_subkey(APP_KEY)?;
        if metadata.get_value::<u32, _>("Registered").is_err() {
            if let Some(previous) = previous {
                metadata.set_value("PreviousDefaultName", &previous)?;
            }
        }
        let (class, _) = root.create_subkey(format!(r"Software\Classes\{PROG_ID}"))?;
        class.set_value("", &"LilyPond score")?;
        class.set_value("FriendlyTypeName", &"LilyPond score")?;
        class
            .create_subkey("DefaultIcon")?
            .0
            .set_value("", &format!("\"{executable}\",0"))?;
        let (open, _) = class.create_subkey(r"shell\open")?;
        open.set_value("FriendlyAppName", &"Hacklily")?;
        open.create_subkey("command")?
            .0
            .set_value("", &format!("\"{executable}\" \"%1\""))?;
        root.create_subkey(OPEN_WITH)?.0.set_value(PROG_ID, &"")?;
        let (capabilities, _) = root.create_subkey(CAPABILITIES)?;
        capabilities.set_value("ApplicationName", &"Hacklily")?;
        capabilities.set_value(
            "ApplicationDescription",
            &"Edit and preview LilyPond scores",
        )?;
        capabilities.set_value("ApplicationIcon", &format!("\"{executable}\",0"))?;
        capabilities
            .create_subkey("FileAssociations")?
            .0
            .set_value(".ly", &PROG_ID)?;
        root.create_subkey(REGISTERED_APPS)?
            .0
            .set_value("Hacklily", &CAPABILITIES)?;
        metadata.set_value("Registered", &1u32)?;
        // Never write .ly's default value or Windows' protected UserChoice.
        Ok(())
    }

    fn unregister_at(root: &RegKey) -> io::Result<()> {
        let (open_with, _) = root.create_subkey(OPEN_WITH)?;
        ignore_missing(open_with.delete_value(PROG_ID))?;
        let (apps, _) = root.create_subkey(REGISTERED_APPS)?;
        ignore_missing(apps.delete_value("Hacklily"))?;
        ignore_missing(root.delete_subkey_all(format!(r"Software\Classes\{PROG_ID}")))?;
        ignore_missing(root.delete_subkey_all(APP_KEY))?;
        Ok(())
    }

    fn notify_shell() {
        unsafe {
            SHChangeNotify(
                SHCNE_ASSOCCHANGED as i32,
                SHCNF_IDLIST,
                ptr::null(),
                ptr::null(),
            );
        }
    }

    pub fn register() -> io::Result<()> {
        let previous = query_association(ASSOCSTR_FRIENDLYAPPNAME);
        register_at(
            &RegKey::predef(HKEY_CURRENT_USER),
            &std::env::current_exe()?,
            previous.as_deref(),
        )?;
        notify_shell();
        Ok(())
    }

    pub fn unregister() -> io::Result<()> {
        unregister_at(&RegKey::predef(HKEY_CURRENT_USER))?;
        notify_shell();
        Ok(())
    }

    pub fn open_settings(for_hacklily: bool) -> Result<(), String> {
        let uri = wide(if for_hacklily {
            "ms-settings:defaultapps?registeredAppUser=Hacklily"
        } else {
            "ms-settings:defaultapps"
        });
        let result = unsafe {
            ShellExecuteW(
                ptr::null_mut(),
                ptr::null(),
                uri.as_ptr(),
                ptr::null(),
                ptr::null(),
                SW_SHOWNORMAL,
            )
        } as isize;
        if result <= 32 {
            Err(format!(
                "Cannot open Windows Default Apps settings (error {result})"
            ))
        } else {
            Ok(())
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn registration_is_reversible_and_preserves_other_associations() {
            let root = RegKey::predef(HKEY_CURRENT_USER);
            let sandbox = format!(r"Software\Hacklily-AssociationTest-{}", std::process::id());
            let (test, _) = root.create_subkey(&sandbox).unwrap();
            // A failed assertion still cleans up the isolated test registry tree.
            struct Cleanup(RegKey, String);
            impl Drop for Cleanup {
                fn drop(&mut self) {
                    let _ = self.0.delete_subkey_all(&self.1);
                }
            }
            let _cleanup = Cleanup(root, sandbox);
            let (extension, _) = test.create_subkey(r"Software\Classes\.ly").unwrap();
            extension.set_value("", &"OtherEditor.Score").unwrap();
            let (other, _) = test.create_subkey(OPEN_WITH).unwrap();
            other.set_value("OtherEditor.Score", &"").unwrap();
            let (choice, _) = test
                .create_subkey(
                    r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.ly\UserChoice",
                )
                .unwrap();
            choice.set_value("ProgId", &"OtherEditor.Score").unwrap();
            let path = Path::new(r"C:\Apps\音乐 Editor\hacklily-desktop.exe");
            register_at(&test, path, Some("Other editor")).unwrap();
            register_at(&test, path, Some("Hacklily")).unwrap();
            let metadata = test.open_subkey(APP_KEY).unwrap();
            assert_eq!(
                metadata
                    .get_value::<String, _>("PreviousDefaultName")
                    .unwrap(),
                "Other editor"
            );
            let command = test
                .open_subkey(format!(r"Software\Classes\{PROG_ID}\shell\open\command"))
                .unwrap();
            assert_eq!(
                command.get_value::<String, _>("").unwrap(),
                format!("\"{}\" \"%1\"", path.display())
            );
            unregister_at(&test).unwrap();
            unregister_at(&test).unwrap();
            assert_eq!(
                extension.get_value::<String, _>("").unwrap(),
                "OtherEditor.Score"
            );
            assert_eq!(
                choice.get_value::<String, _>("ProgId").unwrap(),
                "OtherEditor.Score"
            );
            assert!(other.get_value::<String, _>("OtherEditor.Score").is_ok());
            assert!(other.get_value::<String, _>(PROG_ID).is_err());
            assert!(test.open_subkey(APP_KEY).is_err());
            assert!(
                test.open_subkey(format!(r"Software\Classes\{PROG_ID}"))
                    .is_err()
            );
        }
    }
}
