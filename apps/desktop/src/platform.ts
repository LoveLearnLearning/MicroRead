import { invoke } from "@tauri-apps/api/core";
import type { AiMode, Passage } from "@reader/domain";
import type { ImportedWebArticle } from "@/lib/db";
import type { AiSettings, PlatformAiResult, PlatformHealth, TranslationBatchResult } from "../../web/lib/platform";

export type { TranslationBatchResult, AiSettings } from "../../web/lib/platform";

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

export async function platformLoadAiSettings(): Promise<AiSettings | null> {
  try {
    return await invoke<AiSettings | null>("load_ai_settings");
  } catch {
    return null;
  }
}

export async function platformSaveAiSettings(settings: AiSettings): Promise<void> {
  try {
    await invoke("save_ai_settings", { settings });
  } catch (reason) {
    throw asError(reason);
  }
}
