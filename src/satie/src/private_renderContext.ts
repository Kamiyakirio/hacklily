// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015-present Jocelyn Stericker <jocelyn@nettek.ca>

import { createContext } from "react";

export interface RenderContextValue {
  originY: number;
  originYByPartAndStaff: { [part: string]: number[] };
  systemBottom: number;
  systemTop: number;
  scale40: number;
  renderTarget: "svg-web" | "svg-export";
}

export const RenderContext = createContext<RenderContextValue>({
  originY: 0,
  originYByPartAndStaff: {},
  systemBottom: 0,
  systemTop: 0,
  scale40: 1,
  renderTarget: "svg-web",
});
