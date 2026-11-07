// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { openExternal } from "#/lib/NativeRenderer";

export default function ModalAbout({ onHide }: { onHide(): void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onHide()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hacklily</DialogTitle>
        </DialogHeader>
        <p>A desktop sheet music editor powered by LilyPond.</p>
        <p>
          Edit LilyPond source, preview your score, and export PDF or MIDI
          locally. Your scores can be opened and saved as files on your
          computer.
        </p>
        <p>LilyPond engine: 2.26.0</p>
        <p className="text-sm text-muted-foreground">
          Copyright © 2017–present Jocelyn Stericker. Hacklily is free software
          licensed under the GNU Affero General Public License, version 3 or
          later.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onHide}>
            Close
          </Button>
          <Button
            onClick={() =>
              openExternal(
                "https://lilypond.org/doc/v2.26/Documentation/learning/tutorial",
              )
            }
          >
            Start tutorial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
