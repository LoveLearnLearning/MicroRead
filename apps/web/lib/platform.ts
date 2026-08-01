import type { AiMode, Citation, Claim, Passage, Usage, WebResearchResult } from "@reader/domain";
import type { ImportedWebArticle } from "@/lib/db";

export interface PlatformAiResult {
  id: string;
  answerMarkdown: string;
  claims: Claim[];
  citations: Citation[];
  limitations: string[];
  usage: Usage;
}

export interface PlatformHealth {
  ok: boolean;
  ai: { provider: string; model: string; configured: boolean };
  storage: string;
  sync: string;
  timestamp: string;
}

export interface TranslationBatchResult {
  translations: Array<{ id: string; text: string }>;
  usage: Usage;
}

export interface AiSettings {
  apiKey: string;
  hasApiKey: boolean;
  baseUrl: string;
  model: string;
  requestsPerHour: number;
}

export interface AiSettingsUpdate {
  apiKey: string | null;
  clearApiKey: boolean;
  baseUrl: string;
  model: string;
  requestsPerHour: number;
}

export interface DesktopUpdateInfo {
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
}

export interface UpdateDownloadProgress {
  downloaded: number;
  total?: number;
}

export async function platformRequestAi(
  request: { sourceId: string; mode: AiMode; query: string; passages: Passage[]; locale: string; parentContext?: { query: string; answerMarkdown: string } },
): Promise<PlatformAiResult | null> {
  void request;
  return null;
}

export async function platformResearchWeb(query: string): Promise<WebResearchResult[] | null> {
  void query;
  return null;
}

export async function platformImportWeb(url: string): Promise<ImportedWebArticle | null> {
  void url;
  return null;
}

export async function platformHealth(): Promise<PlatformHealth | null> {
  return null;
}

export async function platformTranslateBatch(request: {
  sourceId: string;
  targetLocale: string;
  chunks: Array<{ id: string; text: string }>;
}): Promise<TranslationBatchResult | null> {
  void request;
  return null;
}

export async function platformLoadAiSettings(): Promise<AiSettings | null> {
  return null;
}

export async function platformSaveAiSettings(settings: AiSettingsUpdate): Promise<void> {
  void settings;
}

export function platformSupportsAiSettings(): boolean {
  return false;
}

export function platformSupportsUpdates(): boolean {
  return false;
}

export async function platformGetAppVersion(): Promise<string | null> {
  return null;
}

export async function platformCheckForUpdate(): Promise<DesktopUpdateInfo | null> {
  return null;
}

export async function platformInstallUpdate(
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<void> {
  void onProgress;
  throw new Error("Web 版本由浏览器刷新更新，无需安装桌面更新包。");
}
