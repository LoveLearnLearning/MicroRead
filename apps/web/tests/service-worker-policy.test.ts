import { describe, expect, it } from "vitest";
import { shouldRegisterServiceWorker } from "@/lib/service-worker-policy";

describe("service worker policy", () => {
  it("never registers the web PWA worker inside the Tauri desktop origin", () => {
    expect(shouldRegisterServiceWorker(
      { hostname: "tauri.localhost", protocol: "http:" } as Location,
      "production",
    )).toBe(false);
  });

  it("keeps offline support for the production web app", () => {
    expect(shouldRegisterServiceWorker(
      { hostname: "localhost", protocol: "http:" } as Location,
      "production",
    )).toBe(true);
    expect(shouldRegisterServiceWorker(
      { hostname: "reader.example", protocol: "https:" } as Location,
      "production",
    )).toBe(true);
  });

  it("does not register during development", () => {
    expect(shouldRegisterServiceWorker(
      { hostname: "localhost", protocol: "http:" } as Location,
      "development",
    )).toBe(false);
  });
});
