// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import { cn } from "../lib/utils";
import makelilyStyles from "./makelilyStyles";

/**
 * Placeholder for when a tool with an invalid name is requested.
 */
const ToolNotFound = () => {
  return <span className={cn(makelilyStyles.tool)}>Tool not found.</span>;
};

export default ToolNotFound;
