# Hacklily Desktop

Hacklily is a desktop sheet music editor built with React, Monaco, and Tauri 2. Write LilyPond source, preview SVG pages, listen to MIDI, and export PDF locally.

## Development

Install Node.js (see `engines` in `package.json`), Rust, and [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/). Windows requires the MSVC Rust toolchain, the Visual Studio Desktop development with C++ workload, and WebView2. Check that `cargo --version` works in the terminal before starting.

```bash
npm install
npm run tauri dev
```

`npm run desktop:dev` is an alias. Tauri starts Vite on port 1420 and opens the editor. `npm start` runs just the frontend for UI work; native rendering and file dialogs require the desktop window.

## Local LilyPond engine

On first launch, the app downloads the official LilyPond 2.26.0 distribution for the current platform, verifies its pinned SHA-256 checksum, and extracts it into `./lilypond/` **next to the application executable**. The complete directory layout, fonts, Scheme files, and helper programs are retained. No global LilyPond installation or PATH changes are needed. The executable's directory must be writable.

For example, when `Hacklily` is installed in `C:\Apps\Hacklily`, its Windows engine is stored in:

```text
C:\Apps\Hacklily\
  hacklily-desktop.exe
  lilypond\
    2.26.0-windows-x86_64\
      bin\lilypond.exe
      bin\python.exe
      bin\musicxml2ly.py
      libexec\
      share\
```

During development, the executable lives in `src-tauri/target/debug/`, so the engine is downloaded into `src-tauri/target/debug/lilypond/`. Release builds use `src-tauri/target/release/lilypond/`. The shell's current working directory does not determine the engine location.

After installation, previewing and exporting work offline. React calls narrow Tauri commands; Rust writes a temporary `.ly` file, launches local LilyPond, collects SVG/PDF/MIDI and diagnostics, and removes temporary output. Preview work is serialized, stale requests are cancelled, and compilation has a 60-second timeout. SVG point-and-click links return to the original source line without the old server's injected-line offset.

The official packages configured here support Windows x86_64, Linux x86_64, and macOS x86_64/arm64. Download URLs and checksums are recorded in `src-tauri/src/engine.rs`; package metadata comes from [LilyPond's official GitLab release](https://gitlab.com/lilypond/lilypond/-/releases/v2.26.0).

## Files and export

- Preview zoom supports 25%–400% with the toolbar or Ctrl/Cmd + mouse wheel over the score. Click the percentage to reset to 100%; the zoom level is kept when the preview updates.
- Drag the preview with the left or middle mouse button to pan horizontally or vertically. A click on a note still jumps to its source; dragging does not activate note links.
- Open and save `.ly` files using native file dialogs. Save as creates a copy.
- `Ctrl/Cmd+S` saves, `Ctrl/Cmd+Shift+S` saves as, `Ctrl/Cmd+O` opens, and `Ctrl/Cmd+N` creates a score.
- Import MusicXML using the `musicxml2ly` included in the downloaded distribution.
- PDF export compiles the current source locally; MIDI export uses the current preview's MIDI data.
- Unsaved changes are kept as a browser-storage draft and checked before replacing a document or closing the window.

GitHub login, publishing, and the online file library have been removed. The desktop app does not use the former renderer server or the WebAssembly renderer; LilyPond WASM assets are not included in its bundle. Historical server and WASM build sources remain in the repository, independent of the desktop app.

LilyPond can execute Scheme embedded in scores. Compile only scores you trust; local compilation runs with the desktop user's permissions.

## Build and validation

```bash
npm test
npm run desktop:build
```

Installers are generated under `src-tauri/target/release/bundle/`. The downloaded engine is not embedded in the installer; each installation prepares its own engine on first launch.

Native tests:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

The real-engine smoke test checks SVG, source links, PDF, MIDI, and compilation errors. Set `HACKLILY_TEST_ENGINE` to an extracted official `lilypond` executable and run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib -- --include-ignored
```

## License

Hacklily is copyright © 2017–present Jocelyn Stericker and licensed under GNU AGPLv3-or-later. LilyPond is separate GNU GPL software; its downloaded distribution retains its license and notices. The upstream project is hosted at <https://slop.nettek.ca/jocelyn-stericker/hacklily>.
