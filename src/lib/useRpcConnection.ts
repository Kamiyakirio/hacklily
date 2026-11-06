import { useEffect, useReducer } from "react";

import RPCClient from "./RPCClient";
import { mergeState } from "./state";

interface ConnectionState {
  url: string | undefined;
  rpc: RPCClient | null;
  wsError: boolean;
  reconnectTimeout: number;
}

/** Own the socket, RPC client and retry timer as one effect lifetime. */
export function useRpcConnection(url: string | undefined, initialCooloff = 1) {
  const [state, update] = useReducer(mergeState<ConnectionState>, {
    url,
    rpc: null,
    wsError: false,
    reconnectTimeout: 0,
  });

  useEffect(() => {
    if (!url) return;

    let disposed = false;
    let releaseSocket: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout>;
    let cooloff = initialCooloff;

    function connect() {
      if (disposed) return;
      const socket = new WebSocket(url);
      let rpc: RPCClient | null = null;
      let released = false;

      function release() {
        if (released) return;
        released = true;
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("error", handleFailure);
        socket.removeEventListener("close", handleFailure);
        rpc?.destroy();
        socket.close();
      }

      function handleOpen() {
        if (disposed || released) return;
        rpc = new RPCClient(socket);
        cooloff = initialCooloff;
        update({ url, rpc, wsError: false, reconnectTimeout: 0 });
      }

      function handleFailure() {
        if (disposed || released) return;
        release();
        let remaining = cooloff;
        cooloff *= 2;
        update({ url, rpc: null, wsError: true, reconnectTimeout: remaining });

        function tick() {
          if (disposed) return;
          remaining -= 1;
          if (remaining > 0) {
            update({ reconnectTimeout: remaining });
            retryTimer = setTimeout(tick, 1000);
          } else {
            update({ wsError: false, reconnectTimeout: 0 });
            connect();
          }
        }
        retryTimer = setTimeout(tick, 1000);
      }

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("error", handleFailure);
      socket.addEventListener("close", handleFailure);
      releaseSocket = release;
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      releaseSocket?.();
    };
  }, [url, initialCooloff]);

  const current =
    state.url === url
      ? state
      : {
          url,
          rpc: null,
          wsError: false,
          reconnectTimeout: 0,
        };
  return {
    ...current,
    wsError: !url || current.wsError,
    connecting: !!url && !current.rpc && !current.wsError,
  };
}
