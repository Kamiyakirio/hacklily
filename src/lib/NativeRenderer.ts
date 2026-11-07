import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

import type { RenderResult, SvgRenderer } from "./SvgRenderer";

export interface EngineProgress {
  stage: "downloading" | "extracting" | "ready";
  downloaded: number;
  total: number | null;
}

export interface ScoreFile {
  path: string;
  src: string;
}

export async function prepareEngine(
  onProgress: (progress: EngineProgress) => void,
) {
  if (!isTauri())
    throw new Error("Open Hacklily in the desktop app to use local LilyPond.");
  const channel = new Channel<EngineProgress>();
  channel.onmessage = onProgress;
  return invoke<{ version: string }>("prepare_engine", { onProgress: channel });
}

export function openExternal(url: string) {
  if (isTauri()) void openUrl(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default class NativeRenderer implements SvgRenderer {
  private requests = new Map<string, "svg" | "pdf">();
  private disposed = false;

  constructor(private readonly includeDir: string | null = null) {}

  async renderSvg(
    src: string,
    _version: "stable" | "unstable",
  ): Promise<RenderResult> {
    return this.render(src, "svg");
  }

  async renderPdf(src: string): Promise<string> {
    const result = await this.render(src, "pdf");
    if (!result.files[0])
      throw new Error(result.logs || "LilyPond did not produce a PDF");
    return result.files[0];
  }

  private async render(src: string, format: "svg" | "pdf") {
    if (this.disposed) throw new Error("Renderer is closed");
    const requestId = crypto.randomUUID();
    this.requests.set(requestId, format);
    try {
      return await invoke<RenderResult>("render_score", {
        requestId,
        src,
        format,
        includeDir: this.includeDir,
      });
    } catch (cause) {
      throw cause instanceof Error ? cause : new Error(String(cause));
    } finally {
      this.requests.delete(requestId);
    }
  }

  cancel(all = false) {
    for (const [requestId, format] of this.requests) {
      if (!all && format !== "svg") continue;
      void invoke("cancel_render", { requestId }).catch(() => {});
    }
  }

  destroy() {
    this.disposed = true;
    this.cancel(true);
  }
}

export const openScore = () => invoke<ScoreFile | null>("open_score");
export const openScorePath = (path: string) =>
  invoke<ScoreFile>("open_score_path", { path });

export function watchOpenRequests(
  onPaths: (paths: string[]) => void,
  onError: (error: unknown) => void,
) {
  if (!isTauri()) return () => {};
  let disposed = false;
  let unlisten: (() => void) | undefined;
  const collect = () => {
    void invoke<string[]>("take_open_requests")
      .then((paths) => {
        if (!disposed && paths.length) onPaths(paths);
      })
      .catch((error) => {
        if (!disposed) onError(error);
      });
  };
  void listen("score-open-requested", collect)
    .then((stop) => {
      if (disposed) {
        stop();
        return;
      }
      unlisten = stop;
      collect();
    })
    .catch((error) => {
      if (!disposed) onError(error);
    });
  return () => {
    disposed = true;
    unlisten?.();
  };
}
export const importMusicXML = () => invoke<ScoreFile | null>("import_musicxml");
export const saveScore = (src: string, path: string | null) =>
  invoke<string | null>("save_score", { src, path });
export const saveExport = (
  content: string,
  format: "pdf" | "midi" | "ly",
  name: string,
) => invoke<string | null>("save_export", { content, format, name });

export function encodeBytes(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length; start += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(start, start + 32768)));
  }
  return btoa(chunks.join(""));
}
