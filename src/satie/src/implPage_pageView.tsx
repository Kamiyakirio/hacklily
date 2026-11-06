// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import invariant from "invariant";
import { filter, last, map } from "lodash";
import { useContext, useEffect } from "react";

import type { Print, ScoreHeader } from "#/musicxml-interfaces";

import MeasureView from "./implMeasure_measureView";
import CreditView from "./implPage_creditView";
import type { IMeasureLayout } from "./private_measureLayout";
import { getPageMargins } from "./private_print";
import { RenderContext } from "./private_renderContext";
import { tenthsToMM } from "./private_renderUtil";

export interface IProps {
  scoreHeader: ScoreHeader;
  print: Print;
  lineLayouts: IMeasureLayout[][];
  renderTarget: "svg-web" | "svg-export";
  className: string;
  singleLineMode?: boolean;
  onPageHeightChanged?: (pageHeight: number) => void;
  svgRef?: (svg: SVGSVGElement) => void;
}

export default function Page({
  svgRef,
  onPageHeightChanged,
  ...props
}: IProps) {
  const renderContext = useContext(RenderContext);

  /*--- Staves ----------------------------------------------*/

  const lineLayouts = props.lineLayouts;

  /*--- General ---------------------------------------------*/

  const print = props.print;
  const pageNum = parseInt(print.pageNumber, 10);
  invariant(
    pageNum >= 1,
    "Page %s isn't a valid page number.",
    print.pageNumber,
  );
  const defaults = props.scoreHeader.defaults;
  const credits = filter(
    props.scoreHeader.credits,
    (cr) => cr.page === pageNum,
  );
  const scale40 = (defaults.scaling.millimeters / defaults.scaling.tenths) * 40;
  const pageLayout = print.pageLayout;
  const widthMM =
    props.renderTarget === "svg-export"
      ? tenthsToMM(scale40, pageLayout.pageWidth) + "mm"
      : "100%";
  const heightMM =
    props.renderTarget === "svg-export"
      ? tenthsToMM(scale40, pageLayout.pageHeight) + "mm"
      : "100%";

  const pageWidth = props.singleLineMode
    ? last(lineLayouts[0]).originX +
      last(lineLayouts[0]).width +
      getPageMargins(pageLayout.pageMargins, 0).rightMargin
    : pageLayout.pageWidth;

  const pageHeight = pageLayout.pageHeight;
  const contextValue = {
    ...renderContext,
    originY: pageHeight,
    renderTarget: props.renderTarget,
    scale40,
  };

  useEffect(() => {
    onPageHeightChanged?.(pageHeight);
  }, [pageHeight, onPageHeightChanged]);

  /*--- Credits ---------------------------------------------*/

  /*--- Render ----------------------------------------------*/

  return (
    <RenderContext value={contextValue}>
      <svg
        className={props.className}
        style={
          props.renderTarget === "svg-export"
            ? undefined
            : {
                width: "auto",
              }
        }
        data-page={
          props.renderTarget === "svg-export" ? undefined : print.pageNumber
        }
        height={heightMM}
        ref={svgRef}
        viewBox={`0 0 ${pageWidth} ${pageHeight}`}
        width={widthMM}
      >
        {!props.singleLineMode &&
          map(credits, (c, i) => <CreditView key={i} {...c} />)}
        {map(lineLayouts, (lineLayout) =>
          map(lineLayout, (measureLayout) => (
            <MeasureView
              key={measureLayout.uuid}
              layout={measureLayout}
              version={measureLayout.getVersion()}
            />
          )),
        )}
      </svg>
    </RenderContext>
  );
}
