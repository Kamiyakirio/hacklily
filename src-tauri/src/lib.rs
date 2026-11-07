mod associations;
mod engine;
mod files;
mod render;

use engine::{EngineInfo, EngineManager, EngineProgress};
use render::{Format, RenderManager, RenderResult};
use tauri::{Manager, State, ipc::Channel};

#[tauri::command]
async fn prepare_engine(
    engine: State<'_, EngineManager>,
    on_progress: Channel<EngineProgress>,
) -> Result<EngineInfo, String> {
    engine.prepare(on_progress).await
}

#[tauri::command]
async fn render_score(
    engine: State<'_, EngineManager>,
    renderer: State<'_, RenderManager>,
    request_id: String,
    src: String,
    format: Format,
    include_dir: Option<String>,
) -> Result<RenderResult, String> {
    renderer
        .render(&engine, request_id, src, format, include_dir)
        .await
}

#[tauri::command]
fn cancel_render(renderer: State<'_, RenderManager>, request_id: String) {
    renderer.cancel(&request_id);
}

pub fn run() {
    let requests = files::OpenRequests::default();
    requests.enqueue(
        std::env::args(),
        &std::env::current_dir().unwrap_or_default(),
    );
    tauri::Builder::default()
        .manage(requests)
        .plugin(tauri_plugin_single_instance::init(files::handle_launch))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Resolve beside the actual executable, never from the shell's cwd.
            let executable = std::env::current_exe()?;
            let directory = executable
                .parent()
                .ok_or("Cannot resolve the application directory")?;
            app.manage(EngineManager::new(directory.join("lilypond")));
            app.manage(RenderManager::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            prepare_engine,
            render_score,
            cancel_render,
            files::open_score,
            files::open_score_path,
            files::take_open_requests,
            files::save_score,
            files::save_export,
            files::import_musicxml,
            associations::file_association_status,
            associations::register_file_association,
            associations::unregister_file_association,
            associations::open_default_apps
        ])
        .build(tauri::generate_context!())
        .expect("error while building Hacklily")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let mut args = vec!["Hacklily".into()];
                args.extend(
                    urls.into_iter()
                        .filter_map(|url| url.to_file_path().ok())
                        .map(|path| path.to_string_lossy().into_owned()),
                );
                files::handle_launch(_app, args, String::new());
            }
        });
}
