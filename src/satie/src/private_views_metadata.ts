// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import invariant from "invariant";
import { sortedIndex, indexOf } from "lodash";
import { useLayoutEffect } from "react";

import type { ILayout } from "./document";

export interface IBaseProps {
  layout: ILayout;
  originX: number;
}

export interface ILookup {
  x: number;
  y: number;
}

export interface IRecord {
  key: string;
  obj: any;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  originY: number;
}

/** Register committed score elements for mouse hit testing. */
export function useTargetable(props: IBaseProps, originY: number) {
  useLayoutEffect(() => {
    const { layout, originX } = props;
    if (isNaN(layout.renderedWidth)) {
      console.warn("Missing rendered width in", layout.key);
      return;
    }
    const record: IRecord = {
      key: layout.key,
      obj: { props },
      x1: originX + layout.x - 2,
      x2: originX + layout.x + layout.renderedWidth,
      y1: originY - 60,
      y2: originY + 60,
      originY,
    };
    set(record);
    return () => clear(record);
  }, [props, originY]);
}

const _sorted: IRecord[] = [];
const _weights: number[] = [];

function set(record: IRecord) {
  const weight = weightForRecord(record);
  const idx = sortedIndex(_weights, weight);
  _sorted.splice(idx, 0, record);
  _weights.splice(idx, 0, weight);
}

function clear(record: IRecord) {
  const weight = weightForRecord(record);
  const firstPossibleIdx = sortedIndex(_weights, weight);
  const idx = indexOf(_sorted, record, firstPossibleIdx);

  invariant(idx >= 0, `${record.key} not currently in array.`);
  _sorted.splice(idx, 1);
  _weights.splice(idx, 1);
}

export function get(lookup: ILookup): IRecord {
  const { x, y } = lookup;
  const weight = weightForLookup(lookup);
  const firstPossibleIdx = sortedIndex(_weights, weight);
  for (let i = firstPossibleIdx; i < _sorted.length; ++i) {
    const record = _sorted[i];
    if (
      _sorted[i].x1 <= x &&
      _sorted[i].x2 >= x &&
      _sorted[i].y1 <= y &&
      _sorted[i].y2 >= y
    ) {
      return record;
    }
  }
  return null;
}

function weightForRecord(record: IRecord) {
  // In the future we should seperate by line.
  return record.x2;
}

function weightForLookup(lookup: ILookup) {
  return lookup.x;
}
