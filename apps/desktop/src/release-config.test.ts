import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("desktop release updater contract", () => {
  const rootPackage = JSON.parse(read("../../../package.json")) as { packageManager: string };
  const tauriConfig = JSON.parse(read("../src-tauri/tauri.conf.json")) as {
    bundle: { createUpdaterArtifacts?: boolean };
    plugins?: { updater?: { pubkey?: string; endpoints?: string[] } };
  };
  const workflow = read("../../../.github/workflows/release.yml");
  const cargo = read("../src-tauri/Cargo.toml");

  it("uses the repository pnpm version and syncs the tag into the desktop version", () => {
    const pnpmVersion = rootPackage.packageManager.replace(/^pnpm@/, "");
    expect(workflow).toContain(`version: ${pnpmVersion}`);
    expect(workflow).toContain("Sync release version from tag");
    expect(workflow).toContain("tauri.conf.json");
  });

  it("publishes signed updater metadata through the official Tauri action", () => {
    expect(workflow).toContain("tauri-apps/tauri-action@v1");
    expect(workflow).toContain("TAURI_SIGNING_PRIVATE_KEY");
    expect(workflow).toContain("uploadUpdaterJson: true");
    expect(workflow).toContain("updaterJsonPreferNsis: true");
    expect(workflow).not.toContain("portable.exe");
  });

  it("configures a signed GitHub Release endpoint in the desktop bundle", () => {
    expect(tauriConfig.bundle.createUpdaterArtifacts).toBe(true);
    expect(tauriConfig.plugins?.updater?.pubkey).toMatch(/^dW50cnVzdGVkIGNvbW1lbnQ6/);
    expect(tauriConfig.plugins?.updater?.endpoints).toEqual([
      "https://github.com/LoveLearnLearning/MicroRead/releases/latest/download/latest.json",
    ]);
    expect(cargo).toContain("tauri-plugin-updater");
  });
});
