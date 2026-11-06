// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { memo, useContext } from "react";

import type { ILayout } from "./document";
import { Type } from "./document";
import AttributesView from "./implAttributes_attributesView";
import BarlineView from "./implBarline_barlineView";
import ChordView from "./implChord_chordView";
import DirectionView from "./implDirection_directionView";
import VisualCursorView from "./implVisualCursor_visualCursorView";
import type { RenderContextValue } from "./private_renderContext";
import { RenderContext } from "./private_renderContext";
import { useTargetable } from "./private_views_metadata";

export interface IProps {
  layout: ILayout;
  version: number;
  key?: string | number;
  originX: number;
}

export interface IState {}

function ModelView(props: IProps) {
  const renderContext = useContext(RenderContext);
  useTargetable(
    props,
    renderContext.originYByPartAndStaff[props.layout.part][
      props.layout.model.staffIdx || 1
    ] || 0,
  );
  function renderModel() {
    const layout = props.layout as any; // Sigh...
    switch (layout.renderClass) {
      case Type.Attributes:
        return <AttributesView layout={layout} />;
      case Type.Barline:
        return <BarlineView layout={layout} />;
      case Type.Chord:
        return <ChordView layout={layout} />;
      case Type.Direction:
        return <DirectionView layout={layout} />;
      case Type.VisualCursor:
        return <VisualCursorView layout={layout} />;
      default:
        return null;
    }
  }

  function getRenderContext(): RenderContextValue {
    const layout = props.layout;
    return {
      ...renderContext,
      originY:
        renderContext.originYByPartAndStaff[layout.part][
          layout.model.staffIdx || 1
        ] || 0,
    };
  }

  return (
    <RenderContext value={getRenderContext()}>{renderModel()}</RenderContext>
  );
}

export default memo(ModelView, (previous, next) => {
  if (previous.version !== next.version) return false;
  return (
    previous.layout.renderClass !== Type.Attributes ||
    (previous.layout as any).staffWidth === (next.layout as any).staffWidth
  );
});
