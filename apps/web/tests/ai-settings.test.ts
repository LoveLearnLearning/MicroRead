import { describe, expect, it } from "vitest";
import { prepareAiSettingsSave, savedAiSettingsState } from "@/lib/ai-settings";

describe("AI settings state", () => {
  it("trims saved values and removes the API key from renderer state", () => {
    const update = prepareAiSettingsSave({
      apiKey: "  sk-replacement  ",
      hasApiKey: false,
      baseUrl: "  https://api.deepseek.com/  ",
      model: "  deepseek-v4-flash  ",
      requestsPerHour: 29.6,
    });

    expect(update).toEqual({
      apiKey: "sk-replacement",
      clearApiKey: false,
      baseUrl: "https://api.deepseek.com/",
      model: "deepseek-v4-flash",
      requestsPerHour: 30,
    });
    expect(savedAiSettingsState(update, false)).toEqual({
      apiKey: "",
      hasApiKey: true,
      baseUrl: "https://api.deepseek.com/",
      model: "deepseek-v4-flash",
      requestsPerHour: 30,
    });
  });

  it("preserves an existing key when the replacement field is blank", () => {
    const update = prepareAiSettingsSave({
      apiKey: "   ",
      hasApiKey: true,
      baseUrl: "",
      model: "",
      requestsPerHour: 30,
    });

    expect(update.apiKey).toBeNull();
    expect(savedAiSettingsState(update, true).hasApiKey).toBe(true);
  });
});
