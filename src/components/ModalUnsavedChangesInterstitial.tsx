// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import { Save, Trash } from "lucide-react";
import { memo } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";

interface Props {
  cancel(): void;
  discardChanges(): void;
  save(): void;
}

/**
 * This is the "Do you want to save your changes" modal you get when you load a song
 * while the current one has unsaved changes in the current song.
 *
 * Runs before replacing the current local document or closing its window.
 *
 * This modal requests to be closed by calling one of the three callbacks.
 */
const ModalUnsavedChangesInterstitial = memo(
  function ModalUnsavedChangesInterstitial(props: Props) {
    return (
      <Dialog open onOpenChange={(open) => !open && props.cancel()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
          </DialogHeader>
          <div>
            <p className="text-lg">Your changes have not been saved.</p>
            <p>
              If you do not save your changes, they will be{" "}
              <strong>permanently lost</strong>!
            </p>
          </div>
          <DialogFooter>
            <div className="flex gap-2">
              <Button onClick={props.cancel} variant="outline">
                Cancel
              </Button>
              <Button variant="destructive" onClick={props.discardChanges}>
                <Trash size="1em" className="inline" />
                Discard changes
              </Button>
              <Button variant="default" onClick={props.save}>
                <Save size="1em" className="inline" />
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);

export default ModalUnsavedChangesInterstitial;
