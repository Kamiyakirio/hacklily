// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { useContext } from "react";

import type { IVisualCursorLayout } from "./implVisualCursor_visualCursorModel";
import { RenderContext } from "./private_renderContext";
import Line from "./private_views_line";

export interface IProps {
  layout: IVisualCursorLayout;
}

export default function VisualCursorView(props: IProps) {
  const renderContext = useContext(RenderContext);

  const layout = props.layout;
  const x = layout.x;

  const yTop = renderContext.systemTop;
  const yBottom = renderContext.systemBottom;
  const height = yTop - yBottom;

  return (
    <Line
      stroke="#428bca"
      strokeWidth={2}
      x1={x - 4}
      x2={x - 4}
      y1={yTop + height * 0.5}
      y2={yBottom - height * 0.5}
    />
  );
}
