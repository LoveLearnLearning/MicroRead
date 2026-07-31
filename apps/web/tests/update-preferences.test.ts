import { beforeEach, describe, expect, it } from "vitest";
import { loadUpdatePreferences, saveUpdatePreferences } from "@/lib/update-preferences";

describe("desktop update preferences", () => {
  beforeEach(() => window.localStorage.clear());

  it("checks automatically but never installs automatically by default", () => {
    expect(loadUpdatePreferences()).toEqual({ autoCheck: true, autoInstall: false });
  });

  it("persists an explicit automatic-install choice", () => {
    saveUpdatePreferences({ autoCheck: true, autoInstall: true });
    expect(loadUpdatePreferences()).toEqual({ autoCheck: true, autoInstall: true });
  });

  it("falls back safely when storage contains invalid data", () => {
    window.localStorage.setItem("microread:update-preferences:v1", "not-json");
    expect(loadUpdatePreferences()).toEqual({ autoCheck: true, autoInstall: false });
  });
});
