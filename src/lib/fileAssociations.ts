import { invoke } from "@tauri-apps/api/core";

export interface AssociationStatus {
  supported: boolean;
  platform: "windows" | "macos" | "linux" | "unsupported";
  registered: boolean;
  isDefault: boolean;
  currentDefault: string | null;
  previousDefault: string | null;
}

export const fileAssociationStatus = () =>
  invoke<AssociationStatus>("file_association_status");
export const registerFileAssociation = () =>
  invoke<AssociationStatus>("register_file_association");
export const unregisterFileAssociation = () =>
  invoke<AssociationStatus>("unregister_file_association");
export const openDefaultApps = (forHacklily: boolean) =>
  invoke<void>("open_default_apps", { forHacklily });
