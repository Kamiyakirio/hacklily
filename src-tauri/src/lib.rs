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
    tauri::Builder::default()
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
            files::save_score,
            files::save_export,
            files::import_musicxml
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hacklily");
}
