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
- The preview opens with **Pan score** active. Drag with the left or middle mouse button to move the score. Switch to the **Select notes** tool beside the zoom controls to drag-select notes; the middle button still pans in either tool.
- Click a note or chord to highlight it in the preview and select its complete source in Monaco. In **Select notes**, drag across systems or pages to select a musical passage, including right-to-left line wraps; the view scrolls at the edges. Selections in different staves remain separate in the source. `Shift` extends a selection and `Ctrl/Cmd` adds or removes notes. Source selections also highlight the preview, including after zooming or recompiling the score.
- Open and save `.ly` files using native file dialogs. Save as creates a copy.
- `Ctrl/Cmd+S` saves, `Ctrl/Cmd+Shift+S` saves as, `Ctrl/Cmd+O` opens, and `Ctrl/Cmd+N` creates a score.
- `Alt/Option+1–8` stacks a diatonic interval above each selected note or chord; without a text selection, it uses the note or chord at the cursor. Add `Shift` to stack below. Both directions use the highest pitch of an existing chord. `1` adds a unison and `8` adds an octave; other intervals follow the current key signature. For example, in C major, adding a third to C–E–G adds B. The number row and numeric keypad are supported, including macOS Option layouts. Original pitches, durations, and markings are retained, the edited notes stay selected for another interval, and one undo restores the entire operation.
- **View → Music symbol panel** shows or hides the toolbar below the main menu; the visibility preference is remembered. Its 139 symbols are organized into 11 categories, with the same controls and light/dark colors as the main toolbar. Select notes in the source editor and click a symbol to apply it; without a note selection, clicking inserts its code at the cursor. Notes stay selected for further markings, and `Ctrl/Cmd+Z` undoes each operation. Articulations and ornaments apply to each note or chord; dynamics begin on the first note; slurs, hairpins, and pedals span the selection. Tempo and structure commands preserve the selected notes.
- **Ornaments** includes ordinary trills and continuous trill extensions. **Tremolos** provides single-note repetitions and two-note alternating tremolos at eighth, sixteenth, thirty-second, and sixty-fourth subdivisions. Select exactly two adjacent notes or chords for an alternating tremolo; the repeat count is calculated from their combined duration, including inherited and dotted values. Choose a subdivision shorter than the written note value for single-note repetitions.
- Import MusicXML using the `musicxml2ly` included in the downloaded distribution.
- PDF export compiles the current source locally; MIDI export uses the current preview's MIDI data.
- Unsaved changes are kept as a browser-storage draft and checked before replacing a document or closing the window.

GitHub login, publishing, and the online file library have been removed. The desktop app does not use the former renderer server or the WebAssembly renderer; LilyPond WASM assets are not included in its bundle. Historical server and WASM build sources remain in the repository, independent of the desktop app.

LilyPond can execute Scheme embedded in scores. Compile only scores you trust; local compilation runs with the desktop user's permissions.

## File associations

Use **File → .ly file association…** to set Hacklily as the default LilyPond editor or cancel the association. Double-clicking a score opens it in the existing window; unsaved changes are checked before replacing the current document. Paths containing spaces and Unicode are supported.

- **Windows:** registers Hacklily for the current user without changing another application's defaults. Windows requires confirmation in its Default Apps settings. When cancelling, select the previous application in Settings; returning to Hacklily finishes removing its registration. The previous application's name is shown in the dialog. The uninstaller cleans up this installation's optional registration.
- **macOS:** the installed `.app` declares `.ly` document support. Registering selects it through Launch Services; cancelling restores the previous application, or the default text editor if `.ly` had no handler. Finder's Open With menu continues to list the installed app. Run the packaged `.app`, rather than a development executable, to manage associations.
- **Linux:** creates per-user XDG desktop and MIME entries, records the previous `text/x-lilypond` handler, and selects Hacklily with `xdg-mime`. Cancelling removes these entries and restores the previous handler, preserving a different app chosen since registration. Requires `xdg-utils`, `shared-mime-info`, and `desktop-file-utils`; XDG directory overrides and AppImage paths are supported.

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
