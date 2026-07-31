import type { AiSettings, AiSettingsUpdate } from "@/lib/platform";

export function prepareAiSettingsSave(settings: AiSettings): AiSettingsUpdate {
  const apiKey = settings.apiKey.trim();
  return {
    apiKey: apiKey || null,
    clearApiKey: false,
    baseUrl: settings.baseUrl.trim(),
    model: settings.model.trim(),
    requestsPerHour: Math.max(1, Math.round(settings.requestsPerHour) || 30),
  };
}

export function savedAiSettingsState(update: AiSettingsUpdate, previouslyHadApiKey: boolean): AiSettings {
  return {
    apiKey: "",
    hasApiKey: update.clearApiKey ? false : previouslyHadApiKey || Boolean(update.apiKey),
    baseUrl: update.baseUrl,
    model: update.model,
    requestsPerHour: update.requestsPerHour,
  };
}
