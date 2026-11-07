import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import {
  fileAssociationStatus,
  openDefaultApps,
  registerFileAssociation,
  unregisterFileAssociation,
} from "#/lib/fileAssociations";
import type { AssociationStatus } from "#/lib/fileAssociations";

export default function ModalFileAssociations({ onHide }: { onHide(): void }) {
  const [status, setStatus] = useState<AssociationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(false);

  const applyStatus = useEffectEvent(async (initial: AssociationStatus) => {
    if (operation.current) return;
    operation.current = true;
    try {
      let next = initial;
      if (restoring && !next.isDefault) {
        operation.current = true;
        setBusy(true);
        next = await unregisterFileAssociation();
        setRestoring(false);
        setMessage(
          "Hacklily's association has been removed. Your selected default app is preserved.",
        );
      }
      setStatus(next);
      setError(null);
    } catch (cause) {
      setError(String(cause));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  });

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void fileAssociationStatus()
        .then((next) => {
          if (active) void applyStatus(next);
        })
        .catch((cause) => {
          if (active) setError(String(cause));
        });
    };
    refresh();
    const focus = () => {
      refresh();
    };
    const visibility = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  async function change(register: boolean) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const current = await fileAssociationStatus();
      if (register) {
        const next = await registerFileAssociation();
        setStatus(next);
        setRestoring(false);
        if (next.platform === "windows") {
          setMessage(
            "In Windows Settings, choose Hacklily as the default app for .ly files.",
          );
          await openDefaultApps(true);
        } else {
          setMessage("Hacklily is now the default app for .ly files.");
        }
      } else if (current.platform === "windows" && current.isDefault) {
        setStatus(current);
        setRestoring(true);
        await openDefaultApps(false);
      } else {
        setStatus(await unregisterFileAssociation());
        setRestoring(false);
        setMessage(
          "Association cancelled. The previous default is restored unless you selected another app.",
        );
      }
    } catch (cause) {
      setError(String(cause));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onHide()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>.ly file association</DialogTitle>
        </DialogHeader>
        <p>Open LilyPond scores with Hacklily by double-clicking a .ly file.</p>
        {status ? (
          <>
            <p>
              Default app:{" "}
              <strong>
                {status.isDefault
                  ? "Hacklily"
                  : status.currentDefault || "No default app"}
              </strong>
            </p>
            <p>
              {status.registered
                ? "Hacklily is registered for .ly files."
                : "No association has been registered from this app."}
            </p>
            {status.previousDefault && (
              <p>Previous default: {status.previousDefault}</p>
            )}
            {status.platform === "windows" && (
              <p className="text-sm text-muted-foreground">
                Windows requires you to confirm default app changes in system
                Settings.
              </p>
            )}
            {status.platform === "macos" && (
              <p className="text-sm text-muted-foreground">
                Cancelling restores the previous default app. Hacklily remains
                available in Finder’s Open With menu while installed. If .ly had
                no default, the default text editor is used.
              </p>
            )}
            {restoring && (
              <p role="status">
                In Windows Settings, find .ly and choose{" "}
                {status.previousDefault || "another app"}. Return here to finish
                removing Hacklily’s registration.
              </p>
            )}
          </>
        ) : (
          <p role="status">Checking file association…</p>
        )}
        {message && <p role="status">{message}</p>}
        {error && (
          <p role="alert" className="text-destructive whitespace-pre-wrap">
            {error}
          </p>
        )}
        <DialogFooter className="flex-wrap">
          <Button variant="outline" onClick={onHide}>
            Close
          </Button>
          {status?.supported && (
            <>
              <Button
                variant="outline"
                disabled={busy || !status.registered}
                onClick={() => void change(false)}
              >
                {restoring
                  ? "Finish cancelling association"
                  : "Cancel association"}
              </Button>
              <Button disabled={busy} onClick={() => void change(true)}>
                {status.platform === "windows"
                  ? "Register and choose default"
                  : "Set as default for .ly"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
