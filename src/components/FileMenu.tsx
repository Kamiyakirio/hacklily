// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2017-present Jocelyn Stericker <jocelyn@nettek.ca>

import {
  CirclePlus,
  Code,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Import,
  Music,
  Save,
} from "lucide-react";
import { memo } from "react";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "#/components/ui/dropdown-menu";
import { openExternal } from "#/lib/NativeRenderer";

interface Props {
  canSave: boolean;
  canExport: boolean;
  midiAvailable: boolean;
  onShowNew(): void;
  onShowOpen(): void;
  onSave(): void;
  onSaveAs(): void;
  onImportMusicXML(): void;
  onExportLy(): void;
  onExportPDF(): void;
  onExportMIDI(): void;
  onShowAbout(): void;
  onShowFileAssociations(): void;
}

export default memo(function FileMenu(props: Props) {
  return (
    <>
      <DropdownMenuItem onClick={props.onShowNew} disabled={!props.canSave}>
        <CirclePlus size="1em" /> New song
      </DropdownMenuItem>
      <DropdownMenuItem onClick={props.onShowOpen} disabled={!props.canSave}>
        <FolderOpen size="1em" /> Open…
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={props.onImportMusicXML}
        disabled={!props.canSave || !props.canExport}
      >
        <Import size="1em" /> Import MusicXML…
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={props.onSave} disabled={!props.canSave}>
        <Save size="1em" /> Save
      </DropdownMenuItem>
      <DropdownMenuItem onClick={props.onSaveAs} disabled={!props.canSave}>
        <Copy size="1em" /> Save as…
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Download size="1em" /> Export
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem
            onClick={props.onExportLy}
            disabled={!props.canSave}
          >
            <Code size="1em" /> LilyPond source
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={props.onExportPDF}
            disabled={!props.canExport}
          >
            <FileText size="1em" /> PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={props.onExportMIDI}
            disabled={!props.canExport || !props.midiAvailable}
          >
            <Music size="1em" /> MIDI
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={props.onShowFileAssociations}>
        <FileText size="1em" /> .ly file association…
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() =>
          openExternal(
            "https://lilypond.org/doc/v2.26/Documentation/learning/index",
          )
        }
      >
        LilyPond manual…
      </DropdownMenuItem>
      <DropdownMenuItem onClick={props.onShowAbout}>
        About Hacklily
      </DropdownMenuItem>
    </>
  );
});
