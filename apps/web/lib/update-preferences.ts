export interface UpdatePreferences {
  autoCheck: boolean;
  autoInstall: boolean;
}

const STORAGE_KEY = "microread:update-preferences:v1";
const defaults: UpdatePreferences = { autoCheck: true, autoInstall: false };

export function loadUpdatePreferences(): UpdatePreferences {
  if (typeof window === "undefined") return defaults;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as Partial<UpdatePreferences> | null;
    return {
      autoCheck: typeof stored?.autoCheck === "boolean" ? stored.autoCheck : defaults.autoCheck,
      autoInstall: typeof stored?.autoInstall === "boolean" ? stored.autoInstall : defaults.autoInstall,
    };
  } catch {
    return defaults;
  }
}

export function saveUpdatePreferences(preferences: UpdatePreferences): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
