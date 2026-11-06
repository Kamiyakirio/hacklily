// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import type { IAttributesLayout } from "./implAttributes_attributesModel";
import BarNumber from "./implAttributes_barNumberView";
import Clef from "./implAttributes_clefView";
import KeySignature from "./implAttributes_keySignatureView";
import PartSymbol from "./implAttributes_partSymbolView";
import StaffLines from "./implAttributes_staffLinesView";
import TimeSignature from "./implAttributes_timeSignatureView";

export default function AttributesView(props: { layout: IAttributesLayout }) {
  const layout = props.layout;
  const children: any[] = [];

  // Staff lines go first, because they are underneath other attributes
  const staffWidth = (layout as any).staffWidth;
  const staffLinesOffsetX = (layout as any).staffLinesOffsetX;
  if (staffWidth) {
    children.push(
      <StaffLines
        key="staffLines"
        width={staffWidth}
        defaultX={props.layout.overrideX - staffLinesOffsetX}
        defaultY={0}
        staffDetails={layout.staffDetails}
      />,
    );
  }

  if (layout.clef) {
    children.push(<Clef key="clef" spec={layout.clef} />);
  }
  if (layout.keySignature) {
    children.push(
      <KeySignature
        clef={layout.snapshotClef}
        key={"ks"}
        spec={layout.keySignature}
      />,
    );
  }
  if (layout.time) {
    children.push(<TimeSignature key="ts" spec={layout.time} />);
  }
  if (layout.measureNumberVisible) {
    children.push(
      <BarNumber
        barNumber={layout.measureNumberVisible}
        key={"measure"}
        spec={{
          defaultX: 0,
          defaultY: 30,
        }}
      />,
    );
  }
  if (layout.partSymbol) {
    children.push(<PartSymbol key="partSymbol" spec={layout.partSymbol} />);
  }

  return <g>{children}</g>;
}
