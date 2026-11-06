// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import { useEffect, useState } from "react";

import type { Status as ServerStatus } from "#/lib/RPCClient";
import { useRpcConnection } from "#/lib/useRpcConnection";

export default function Status() {
  const { rpc, connecting, wsError, reconnectTimeout } = useRpcConnection(
    process.env.REACT_APP_BACKEND_WS_URL,
  );
  const [status, setStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    if (!rpc) return;
    let active = true;
    async function poll() {
      try {
        const result = (await rpc.call("get_status", {})).result;
        if (active) setStatus(result);
      } catch {
        // Socket failures are handled by the connection hook.
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [rpc]);

  if (wsError)
    return <div>Could not connect to server. ({reconnectTimeout || 0})</div>;
  if (connecting) return <div>Connecting...</div>;
  if (!status) return <div>No status returned.</div>;
  return (
    <div>
      <h1>Status</h1>
      <pre>{JSON.stringify(status, null, 2)}</pre>
    </div>
  );
}
