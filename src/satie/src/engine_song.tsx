// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import type { Ref } from "react";
import {
  useEffect,
  useImperativeHandle,
  useState,
  useSyncExternalStore,
} from "react";

import type { IProps, ISong } from "./document";
import SongImpl from "./engine_songImpl";

export default function Song({ ref, ...props }: IProps & { ref?: Ref<ISong> }) {
  const [controller] = useState(() => new SongImpl(props));
  useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    controller.update(props);
  }, [controller, props]);

  useEffect(() => () => controller.dispose(), [controller]);

  const scoreDocument = controller.state.document;
  useImperativeHandle(
    ref,
    () =>
      scoreDocument
        ? {
            get props() {
              return controller.props;
            },
            get header() {
              return controller.header;
            },
            getDocument: controller.getDocument,
            createCanonicalPatch: controller.createCanonicalPatch,
            createPreviewPatch: controller.createPreviewPatch,
            toSVG: controller.toSVG,
            toMusicXML: controller.toMusicXML,
          }
        : null,
    [controller, scoreDocument],
  );

  return (
    <div
      onMouseMove={props.onMouseMove ? controller.handleMouseMove : undefined}
      onClick={props.onMouseClick ? controller.handleClick : undefined}
    >
      {controller.getPage()}
    </div>
  );
}
