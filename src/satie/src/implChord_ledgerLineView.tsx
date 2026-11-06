// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { useContext } from "react";

import type { PrintStyle } from "#/musicxml-interfaces";

import { RenderContext } from "./private_renderContext";
import { bboxes } from "./private_smufl";
import Line from "./private_views_line";

export interface IProps {
  key?: string | number;
  spec: PrintStyle;
  notehead: string;
}

/**
 * Renders a ledger line at (x, y + line).
 */
export default function LedgerLine(props: IProps) {
  const renderContext = useContext(RenderContext);

  const spec = props.spec;
  const west = bboxes[props.notehead][3];
  const east = bboxes[props.notehead][0];
  const xOffset = (east - west) * 10;
  return (
    <Line
      stroke={spec.color}
      strokeWidth={2.2}
      // Ledger lines should be thicker than regular lines.
      x1={spec.defaultX + (spec.relativeX || 0) - 3.2}
      x2={spec.defaultX + (spec.relativeX || 0) + xOffset - 0.2}
      y1={renderContext.originY - spec.defaultY - (spec.relativeX || 0)}
      y2={renderContext.originY - spec.defaultY - (spec.relativeX || 0)}
    />
  );
}
