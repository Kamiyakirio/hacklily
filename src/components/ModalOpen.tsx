// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2019-present Jocelyn Stericker <jocelyn@nettek.ca>

import { Ellipsis, File as FileIcon, Loader2, Trash } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useReducer } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "#/components/ui/tabs.tsx";
import type { Auth } from "#/lib/auth";
import type { File } from "#/lib/gitfs";
import { ls } from "#/lib/gitfs";
import { mergeState } from "#/lib/state";
import { cn } from "#/lib/utils";

interface Props {
  auth: Auth | null;
  onHide(): void;
  onSignIn(): void;
  onDeleteSong(song: string): void;
  onLoadSong(song: string): void;
}

interface GitHubState {
  repoError: ReactNode | null;
  repoTree: File[] | null;
}

function GitHubOpen(props: Props) {
  const [state, updateState] = useReducer(
    mergeState<GitHubState>,
    undefined,
    (): GitHubState => ({
      repoError: null,
      repoTree: null,
    }),
  );
  useEffect(() => {
    let active = true;
    async function load() {
      if (!props.auth) {
        updateState({ repoError: null, repoTree: null });
        return;
      }
      try {
        const repoTree = await ls(props.auth.accessToken, props.auth.repo);
        if (active) updateState({ repoTree, repoError: null });
      } catch {
        if (active)
          updateState({ repoError: "Could not retrieve your songs." });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [props.auth]);

  function handleSongDeleteClick(ev: MouseEvent<HTMLElement>): void {
    let target: HTMLElement | null = ev.currentTarget;
    while (target) {
      const song: string | undefined = target.dataset.song;
      if (song) {
        if (confirm(`Really delete ${song}?`)) {
          props.onDeleteSong(song);
        }
        return;
      }
      target = target.parentElement;
    }

    throw new Error("No song defined on element.");
  }

  function handleSongLiClick(ev: MouseEvent<HTMLElement>): void {
    let target: HTMLElement | null = ev.currentTarget;
    while (target) {
      const song: string | undefined = target.dataset.song;
      if (song) {
        props.onLoadSong(song);
        return;
      }
      target = target.parentElement;
    }

    throw new Error("No song defined on element.");
  }

  const { auth, onSignIn } = props;
  const { repoTree, repoError } = state;

  let songs: ReactNode;

  if (auth) {
    if (repoError) {
      songs = <div className={cn(styles.placeholder)}>{repoError}</div>;
    } else if (!repoTree) {
      songs = (
        <div className={cn(styles.placeholder)}>
          <Loader2 className="animate-spin size-6" />
        </div>
      );
    } else {
      // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
      const lilySongs: File[] = repoTree
        .filter((song: File) => song.path.endsWith(".ly"))
        .sort();
      if (!lilySongs.length) {
        songs = (
          <div className={cn(styles.placeholder)}>
            Save a song to see it here.
          </div>
        );
      } else {
        const eachSong: ReactNode[] = lilySongs.map((song: File) => {
          const menu = (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" />}
              >
                <Ellipsis size="1em" className="inline" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  data-song={`${auth.repo}/${song.path}`}
                  onClick={handleSongDeleteClick}
                >
                  <Trash size="1em" className="inline" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
          return (
            <tr key={song.path} data-song={`${auth.repo}/${song.path}`}>
              <td
                className="truncate"
                onClick={handleSongLiClick}
                title={song.path}
              >
                <FileIcon size="1em" className="mr-2 align-middle inline" />
                {song.path}
              </td>
              <td className={cn(styles.tableIcon)}>{menu}</td>
            </tr>
          );
        });
        songs = (
          <table className="table-fixed w-full overflow-y-auto text-sm [&_tr]:hover:bg-muted [&_tr]:cursor-pointer [&_tr:nth-child(even)]:bg-muted/50">
            <tbody>{eachSong}</tbody>
          </table>
        );
      }
    }
  } else {
    songs = (
      <div
        className={cn(
          "flex-1 flex flex-row items-center justify-center",
          "text-lg",
        )}
      >
        <div>
          <a
            className="underline cursor-pointer text-blue-500"
            onClick={onSignIn}
          >
            Sign in
          </a>{" "}
          to see your songs.
        </div>
      </div>
    );
  }

  return songs;
}

/**
 * This is the modal you see when you try to save an untitled file.
 * It asks you for a name.
 */
function ModalOpen(props: Props) {
  const { onHide } = props;

  return (
    <Dialog open onOpenChange={(open) => !open && onHide()}>
      <DialogContent className="sm:max-w-[565px]">
        <DialogHeader>
          <DialogTitle>Open song</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="github" orientation="vertical">
          <TabsList className="flex-col w-fit">
            <TabsTrigger value="github">GitHub</TabsTrigger>
            <TabsTrigger value="more-soon" disabled>
              More soon&hellip;
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="github"
            className="flex-1 h-[300px] overflow-y-auto"
          >
            <GitHubOpen {...props} />
          </TabsContent>
          <TabsContent value="more-soon" />
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
export default ModalOpen;

const styles = {
  placeholder: "flex-1 flex flex-row items-center justify-center",
  tableIcon: "w-[38px]",
} as const;
