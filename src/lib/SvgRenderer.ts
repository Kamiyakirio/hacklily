// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

/**
 * The result of engraving a LilyPond source to SVG.
 *
 * `files` is one string per engraved page. `logs` is the full LilyPond log
 * output for the render. `midi`, when present, is the base64-encoded MIDI
 * produced alongside the SVG; not every renderer can produce it.
 */
export interface RenderResult {
  files: string[];
  logs: string;
  midi?: string;
  /**
   * Diagnostics counted by the renderer, when available. Lets the caller
   * tell a clean render from "success-with-warnings" / "success-with-errors"
   * without re-parsing the logs.
   */
  warnings?: number;
  errors?: number;
}

/**
 * The preview rendering contract, implemented by the native desktop engine.
 */
export interface SvgRenderer {
  /**
   * Engrave `src` to SVG.
   *
   * `version` is the LilyPond version hint ("stable" | "unstable"), derived
   * from the `\version` in the source. The native renderer uses its managed
   * LilyPond version and lets the compiler report incompatible source versions.
   */
  renderSvg(src: string, version: "stable" | "unstable"): Promise<RenderResult>;

  /**
   * Release any resources (worker, etc.). Safe to call multiple times.
   */
  destroy(): void;
  /** Cancel stale preview work when the score changes. */
  cancel?(): void;
}
