import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { useRpcConnection } from "./useRpcConnection";

const { destroy } = vi.hoisted(() => ({ destroy: vi.fn() }));
vi.mock("./RPCClient", () => ({
  default: class {
    destroy = destroy;
  },
}));

class Socket extends EventTarget {
  static instances: Socket[] = [];
  close = vi.fn();
  constructor(readonly url: string) {
    super();
    Socket.instances.push(this);
  }
}

function Connection({ url }: { url?: string }) {
  const { rpc, wsError, connecting, reconnectTimeout } = useRpcConnection(url);
  return (
    <output
      data-online={!!rpc}
      data-error={wsError}
      data-connecting={connecting}
    >
      {reconnectTimeout}
    </output>
  );
}

describe("RPC connection lifetime", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("WebSocket", Socket);
    Socket.instances = [];
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("retries once for paired error/close events and cancels retries on unmount", async () => {
    await act(async () => root.render(<Connection url="ws://test" />));
    const socket = Socket.instances[0];
    await act(async () => socket.dispatchEvent(new Event("open")));
    expect(container.querySelector("output").dataset.online).toBe("true");

    await act(async () => {
      socket.dispatchEvent(new Event("error"));
      socket.dispatchEvent(new Event("close"));
    });
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(container.querySelector("output").dataset.error).toBe("true");
    expect(container.textContent).toBe("1");

    await act(async () => vi.advanceTimersByTime(1000));
    expect(Socket.instances).toHaveLength(2);
    const retry = Socket.instances[1];
    await act(async () => retry.dispatchEvent(new Event("close")));
    expect(container.textContent).toBe("2");
    await act(async () => root.render(null));
    await act(async () => vi.advanceTimersByTime(10000));
    expect(Socket.instances).toHaveLength(2);
  });

  it("clears the previous connection immediately when the URL changes", async () => {
    await act(async () => root.render(<Connection url="ws://first" />));
    const first = Socket.instances[0];
    await act(async () => first.dispatchEvent(new Event("open")));
    await act(async () => root.render(<Connection url="ws://second" />));
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(container.querySelector("output").dataset.online).toBe("false");
    expect(container.querySelector("output").dataset.connecting).toBe("true");
    await act(async () => first.dispatchEvent(new Event("open")));
    expect(container.querySelector("output").dataset.online).toBe("false");
  });

  it("releases discarded Strict Mode sockets and resets backoff after opening", async () => {
    await act(async () =>
      root.render(
        <StrictMode>
          <Connection url="ws://test" />
        </StrictMode>,
      ),
    );
    expect(Socket.instances).toHaveLength(2);
    expect(Socket.instances[0].close).toHaveBeenCalledTimes(1);
    const current = Socket.instances[1];
    await act(async () => current.dispatchEvent(new Event("close")));
    await act(async () => vi.advanceTimersByTime(1000));
    const retry = Socket.instances[2];
    await act(async () => {
      retry.dispatchEvent(new Event("open"));
      retry.dispatchEvent(new Event("close"));
    });
    expect(container.textContent).toBe("1");
  });

  it("does not open a socket when the backend is unconfigured", async () => {
    await act(async () => root.render(<Connection />));
    expect(Socket.instances).toHaveLength(0);
    expect(container.querySelector("output").dataset.error).toBe("true");
  });
});
