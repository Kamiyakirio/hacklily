// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { chain, flatten, forEach, map, mapValues } from "lodash";
/* eslint-disable no-shadow */
import { memo, useContext } from "react";

import type { ILayout } from "./document";
import ModelView from "./implSegment_modelView";
import type { IMeasureLayout } from "./private_measureLayout";
import type { RenderContextValue } from "./private_renderContext";
import { RenderContext } from "./private_renderContext";
import { MAX_SAFE_INTEGER } from "./private_util";

export interface IProps {
  layout: IMeasureLayout;
  key?: string | number;
  version: number;
}

function MeasureView(props: IProps) {
  const renderContext = useContext(RenderContext);
  function getRenderContext(): RenderContextValue {
    const { layout } = props;
    const originYByPartAndStaff = mapValues(layout.originY, (layouts) =>
      extractOrigins(layouts),
    );
    let bottom = MAX_SAFE_INTEGER;
    let top = 0;
    forEach(layout.originY, (origins) => {
      forEach(origins, (origin, staff) => {
        if (!staff) {
          return;
        }
        bottom = Math.min(origin, bottom);
        top = Math.max(origin, top);
      });
    });

    // TODO 1: Fix stave height
    // TODO 2: Do not ignore top/bottom staff in staffGroup of attributes
    // TODO 3: A part can be in many groups.
    return {
      ...renderContext,
      originYByPartAndStaff: originYByPartAndStaff,
      systemBottom: renderContext.originY - bottom + 20.5,
      systemTop: renderContext.originY - top - 20.5,
    };
  }

  function extractOrigins(layouts: number[]) {
    return map(layouts, (layout) => invert(layout));
  }

  function invert(y: number) {
    return renderContext.originY - y;
  }

  const layout = props.layout;

  return (
    <RenderContext value={getRenderContext()}>
      <g transform={`translate(${layout.originX})`}>
        {chain(flatten(layout.elements))
          .filter((layout: ILayout) => !!layout.model) // Remove helpers.
          .map((layout: ILayout) => (
            <ModelView
              key={(layout as any).key}
              version={props.layout.getVersion()}
              layout={layout}
              originX={props.layout.originX}
            />
          ))
          .value()}
      </g>
    </RenderContext>
  );

  /* TODO: lyric boxes */
  /* TODO: free boxes */
  /* TODO: slurs and ties */
}

export default memo(
  MeasureView,
  (previous, next) =>
    previous.version === next.version &&
    previous.layout.originX === next.layout.originX &&
    previous.layout.width === next.layout.width,
);
