import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import type { AiMode, Passage } from "@reader/domain";
import type { ImportedWebArticle } from "@/lib/db";
import type {
  AiSettings,
  AiSettingsUpdate,
  DesktopUpdateInfo,
  PlatformAiResult,
  PlatformHealth,
  TranslationBatchResult,
  UpdateDownloadProgress,
} from "../../web/lib/platform";

export type {
  TranslationBatchResult,
  AiSettings,
  AiSettingsUpdate,
  DesktopUpdateInfo,
  UpdateDownloadProgress,
} from "../../web/lib/platform";

let pendingUpdate: Update | null = null;

function asError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (typeof reason === "string") return new Error(reason);
  return new Error("桌面运行时请求失败。");
}

export async function platformRequestAi(
  request: { sourceId: string; mode: AiMode; query: string; passages: Passage[]; locale: string },
): Promise<PlatformAiResult> {
  try {
    return await invoke<PlatformAiResult>("request_ai", { request });
  } catch (reason) {
    throw asError(reason);
  }
}

export async function platformImportWeb(url: string): Promise<ImportedWebArticle> {
  try {
    return await invoke<ImportedWebArticle>("import_web", { url });
  } catch (reason) {
    throw asError(reason);
  }
}

export async function platformHealth(): Promise<PlatformHealth> {
  try {
    return await invoke<PlatformHealth>("runtime_health");
  } catch (reason) {
    throw asError(reason);
  }
}

export async function platformTranslateBatch(request: {
  sourceId: string;
  targetLocale: string;
  chunks: Array<{ id: string; text: string }>;
}): Promise<TranslationBatchResult> {
  try {
    return await invoke<TranslationBatchResult>("translate_chunks", { request });
  } catch (reason) {
    throw asError(reason);
  }
}

export async function platformLoadAiSettings(): Promise<AiSettings> {
  try {
    return await invoke<AiSettings>("load_ai_settings");
  } catch (reason) {
    throw asError(reason);
  }
}

export async function platformSaveAiSettings(settings: AiSettingsUpdate): Promise<void> {
  try {
    await invoke("save_ai_settings", { settings });
  } catch (reason) {
    throw asError(reason);
  }
}

export function platformSupportsAiSettings(): boolean {
  return true;
}

export function platformSupportsUpdates(): boolean {
  return isTauri();
}

export async function platformGetAppVersion(): Promise<string | null> {
  if (!isTauri()) return null;
  return getVersion();
}

export async function platformCheckForUpdate(): Promise<DesktopUpdateInfo | null> {
  if (!isTauri()) return null;
  try {
    if (pendingUpdate) {
      await pendingUpdate.close();
      pendingUpdate = null;
    }
    pendingUpdate = await check({ timeout: 12_000 });
    if (!pendingUpdate) return null;
    return {
      currentVersion: pendingUpdate.currentVersion,
      version: pendingUpdate.version,
      date: pendingUpdate.date,
      body: pendingUpdate.body,
    };
  } catch (reason) {
    throw asError(reason);
  }
}

export async function platformInstallUpdate(
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<void> {
  if (!isTauri()) throw new Error("当前不是可安装更新的桌面运行时。");
  try {
    pendingUpdate ??= await check({ timeout: 12_000 });
    if (!pendingUpdate) throw new Error("没有可安装的新版本。");
    let downloaded = 0;
    let total: number | undefined;
    await pendingUpdate.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength;
        onProgress?.({ downloaded, total });
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, total });
      } else {
        onProgress?.({ downloaded: total ?? downloaded, total });
      }
    });
    await relaunch();
  } catch (reason) {
    throw asError(reason);
  }
}
