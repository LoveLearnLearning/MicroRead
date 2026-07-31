import type { AiMode, Citation, Claim, Passage, Usage } from "@reader/domain";
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
  baseUrl: string;
  model: string;
  requestsPerHour: number;
}

export async function platformRequestAi(
  request: { sourceId: string; mode: AiMode; query: string; passages: Passage[]; locale: string },
): Promise<PlatformAiResult | null> {
  void request;
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

export async function platformSaveAiSettings(settings: AiSettings): Promise<void> {
  void settings;
}
