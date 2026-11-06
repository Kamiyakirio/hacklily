// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

/* eslint-disable no-shadow */

import invariant from "invariant";
import { find, forEach, isEqual, throttle } from "lodash";
import type { ReactElement, SyntheticEvent } from "react";

import type { Pitch, ScoreHeader } from "#/musicxml-interfaces";
import type { IAny } from "#/musicxml-interfaces/operations";
import { invert } from "#/musicxml-interfaces/operations";

import type {
  Document,
  IMouseEvent,
  IPatchSpec,
  IProps,
  ISong,
} from "./document";
import { specIsDocBuilder, specIsPartBuilder, specIsRaw } from "./document";
import applyOp from "./engine_applyOp";
import createPatch from "./engine_createPatch";
import { exportXML } from "./engine_export";
import { importXML } from "./engine_import";
import { pitchForClef } from "./private_chordUtil";
import type { IFactory } from "./private_factory";
import PatchImpl from "./private_patchImpl";
import { get as getByPosition } from "./private_views_metadata";

export type Handler = (ev: IMouseEvent) => void;

const NOT_READY_ERROR = "The document is not yet initialized.";
const SATIE_ELEMENT_RX = /SATIE([0-9]*)_(\w*)_(\w*)_(\w*)_(\w*)_(\w*)/;

export interface IState {
  document?: Document;
  factory?: IFactory;
}

/** MusicXML document controller, usable by both React views and headless exports. */
export default class SongImpl implements ISong {
  constructor(public props: IProps) {}

  private previousProps: IProps | null = null;
  private listeners = new Set<() => void>();
  private revision = 0;
  private loadGeneration = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.revision;
  getPage = () => this._page1;

  private notify() {
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }

  update(props: IProps) {
    const previous = this.previousProps;
    this.props = props;
    this.previousProps = props;
    if (!previous || previous.baseSrc !== props.baseSrc) {
      this._loadXML(props.baseSrc);
    } else if (
      this.state.document &&
      (previous.patches !== props.patches ||
        previous.pageClassName !== props.pageClassName ||
        previous.fixedMeasureWidth !== props.fixedMeasureWidth ||
        previous.singleLineMode !== props.singleLineMode)
    ) {
      this._preRender(props);
    }
  }

  run() {
    this.update(this.props);
  }

  dispose() {
    this.loadGeneration += 1;
    this.previousProps = null;
    this._handleCursorPosition.cancel();
  }

  state: IState = {
    document: null,
    factory: null,
  };

  private _docPatches: IAny[] = [];

  private _page1: ReactElement<any> = null;
  private _pt: SVGPoint;
  private _svg: SVGSVGElement;

  /**
   * Returns the document represented by the song. The document represents the
   * current state of the song.
   *
   *  - The returned document is constant (i.e., do not modify the document)
   *  - The returned document is NOT immutable (i.e., the document may change
   *    after patches are applied), or the song is re-rendered.
   *  - The song may load a new document without warning after any operation.
   *    As such, do not cache the document.
   *  - The document's API is not finalized. If you depend on this function call,
   *    expect breakages.
   *  - This API call will eventually be removed and replaced with higher-level
   *    functions.
   */
  getDocument = (operations: { isPatches: boolean }): Document => {
    if (!this.state.document) {
      throw new Error(NOT_READY_ERROR);
    }
    if (operations instanceof PatchImpl) {
      this._rectify$(
        operations.content,
        operations.isPreview,
        () => (operations.isPreview = false),
      );
      return this.state.document;
    } else if (!operations) {
      this._rectify$([], false, () => void 0);
      return this.state.document;
    }
    throw new Error("Invalid operations element");
  };

  get header(): ScoreHeader {
    if (this.state && this.state.document) {
      return this.state.document.header;
    }
    return null;
  }

  set header(_header: ScoreHeader) {
    if (this.state) {
      throw new Error("Cannot set header. Use patches.");
    }
    // Do nothing -- makeExportsHot is running, probably.
  }

  /**
   * Given a set of OT diffs, returns something the "patches" prop can be set to.
   */
  createCanonicalPatch = (
    ...patchSpecs: IPatchSpec[]
  ): { isPatches: boolean } => {
    return this._createPatch(false, patchSpecs);
  };

  /**
   * Given a set of operations, returns a set of operations that the "preview" prop can
   * be set to.
   */
  createPreviewPatch = (
    ...patchSpecs: IPatchSpec[]
  ): { isPatches: boolean } => {
    return this._createPatch(true, patchSpecs);
  };

  toSVG = (): string => {
    const patches: {} = this.props.patches;
    if (patches instanceof PatchImpl) {
      invariant(
        patches.isPreview === false,
        "Cannot render an SVG with a previewed patch",
      );
      this._rectify$(patches.content, patches.isPreview, () => {
        (patches as any).isPreview = false;
      });
    } else if (!patches) {
      this._rectify$([], false, () => void 0);
    } else {
      throw new Error(
        "Song.props.patches was not created through createPreviewPatch or createCanonicalPatch",
      );
    }
    return this.state.document.renderToStaticMarkup(0);
  };

  toMusicXML = (): string => {
    const patches: {} = this.props.patches;
    if (patches instanceof PatchImpl) {
      invariant(
        patches.isPreview === false,
        "Cannot render MusicXML with a previewed patch",
      );
      this._rectify$(
        patches.content,
        patches.isPreview,
        () => ((patches as any).preview = false),
      );
    } else if (!patches) {
      this._rectify$([], false, () => void 0);
    } else {
      throw new Error(
        "Song.props.patches was not created through createPreviewPatch or createCanonicalPatch",
      );
    }
    return exportXML(this.state.document);
  };

  private _createPatch(isPreview: boolean, patchSpecs: IPatchSpec[]) {
    const patches: IAny[] = patchSpecs.reduce((array, spec) => {
      if (specIsRaw(spec)) {
        return array.concat(spec.raw);
      } else if (specIsDocBuilder(spec)) {
        return array.concat(
          createPatch(isPreview, this.state.document, spec.documentBuilder),
        );
      } else if (specIsPartBuilder(spec)) {
        return array.concat(
          createPatch(
            isPreview,
            this.state.document,
            spec.measure,
            spec.part,
            spec.partBuilder,
          ),
        );
      } else if (spec instanceof PatchImpl) {
        return array.concat(spec.content);
      } else if (!spec) {
        return array;
      }
      throw new Error("Invalid patch spec.");
    }, []);

    this._update$(patches, isPreview);

    return new PatchImpl(this._docPatches.slice(), isPreview);
  }

  private _rectify$(
    newPatches: IAny[],
    preview: boolean,
    notEligableForPreview: () => void,
  ) {
    const docPatches = this._docPatches;
    const factory = this.state.factory;

    const commonVersion = () => {
      const maxPossibleCommonVersion = Math.min(
        docPatches.length,
        newPatches.length,
      );

      for (let i = 0; i < maxPossibleCommonVersion; ++i) {
        if (!isEqual(docPatches[i], newPatches[i])) {
          return i;
        }
      }
      return maxPossibleCommonVersion;
    };

    const initialCommon = commonVersion();

    // Undo actions not in common
    forEach(invert(docPatches.slice(initialCommon)), (op) => {
      applyOp(
        preview,
        this.state.document.measures,
        factory,
        op,
        this.state.document,
        notEligableForPreview,
      );
      docPatches.pop();
    });

    // Perform actions that are expected.
    forEach(newPatches.slice(this._docPatches.length), (op) => {
      applyOp(
        preview,
        this.state.document.measures,
        factory,
        op,
        this.state.document,
        notEligableForPreview,
      );
      docPatches.push(op);
    });

    invariant(
      docPatches.length === newPatches.length,
      "Something went wrong in _rectify. The current state is now invalid.",
    );
  }
  private _rectifyAppendCanonical = (ops: IAny[]): void => {
    // Get the correct state without creating patches.
    // The next `validate` pass will re-create any needed fixup.
    forEach(ops, (op) => {
      applyOp(
        false,
        this.state.document.measures,
        this.state.factory,
        op,
        this.state.document,
        () => void 0,
      );
    });
  };
  private _rectifyAppendPreview = (ops: IAny[]): void => {
    this._rectify$(this._docPatches.concat(ops), true, () => void 0);
  };
  private _update$(
    patches: IAny[],
    isPreview: boolean,
    props: IProps = this.props,
  ) {
    this._rectify$(patches, isPreview, () => (isPreview = false));

    this._page1 = this.state.document.__getPage(
      0,
      isPreview,
      "svg-web",
      props.pageClassName || "",
      props.singleLineMode,
      props.fixedMeasureWidth,
      isPreview ? this._rectifyAppendPreview : this._rectifyAppendCanonical,
      this._syncSVG,
      props.onPageHeightChanged,
    );
    this.notify();
  }

  private _preRender = (props: IProps = this.props) => {
    const patches = this.props.patches as {};
    if (patches instanceof PatchImpl) {
      this._update$(patches.content, patches.isPreview, props);
    } else if (!patches) {
      this._update$([], false, props);
    } else {
      throw new Error(
        "Internal error: preRender called, but the state is invalid.",
      );
    }
  };

  private _syncSVG = (svg: SVGSVGElement) => {
    this._svg = svg;
    this._pt = svg ? svg.createSVGPoint() : null;
  };

  private _getPos(ev: SyntheticEvent<Node>) {
    if (!this._svg || !this._pt || !this._svg.contains(ev.target as Node)) {
      return null;
    }

    // Get point in global SVG space
    this._pt.x = (ev as any).clientX;
    this._pt.y = (ev as any).clientY;

    return this._pt.matrixTransform(this._svg.getScreenCTM().inverse());
  }

  private _handleCursorPosition = throttle(
    (p: { x: number; y: number }, handler: Handler) => {
      const match = getByPosition(p);

      let path = match && match.key.match(SATIE_ELEMENT_RX).slice();
      if (!path) {
        handler({
          path: [],
          pitch: null,
          pos: p,
          matchedOriginY: null,
          _private: null,
        });
        return;
      }

      path = path.slice(1);
      const measure: any = find(
        this.state.document.measures,
        (measure) => 1 * measure.uuid === parseInt(path[0], 10),
      );

      const el = measure[path[1]][path[2]][path[3]][path[4]][path[5]];
      if (el) {
        const originY = match.originY;
        const clef = el._clef;
        let pitch: Pitch;
        if (clef && originY) {
          pitch = pitchForClef(originY - p.y, clef);
        }
        handler({
          path,
          pitch,
          pos: p,
          matchedOriginY: originY,
          _private: match.obj,
        });
      }
    },
    18,
  );

  handleMouseMove = (ev: SyntheticEvent<Node>) => {
    const p = this._getPos(ev);
    if (p) {
      this._handleCursorPosition(p, this.props.onMouseMove);
    }
  };

  handleClick = (ev: any) => {
    const p = this._getPos(ev);
    if (p) {
      this._handleCursorPosition(p, this.props.onMouseClick);
    }
  };

  private _loadXML(xml: string) {
    const generation = ++this.loadGeneration;
    this.state = { document: null, factory: null };
    this.notify();
    importXML(xml, (error, loadedDocument, loadedFactory) => {
      if (generation !== this.loadGeneration) return;
      if (error) {
        this.props.onError(error);
        return;
      }
      this.state = { document: loadedDocument, factory: loadedFactory };
      this._preRender();
      invariant(
        !this.props.patches,
        "Expected patches to be empty on document load.",
      );
      this.props.onLoaded?.();
    });
  }
}
