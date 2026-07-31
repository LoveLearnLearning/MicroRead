import { useEffect, useState } from "react";
import type { DesktopUpdateInfo, UpdateDownloadProgress } from "../../web/lib/platform";
import { loadUpdatePreferences } from "../../web/lib/update-preferences";
import {
  platformCheckForUpdate,
  platformInstallUpdate,
  platformSupportsUpdates,
} from "./platform";

let automaticCheckStarted = false;

export function DesktopUpdateManager() {
  const [update, setUpdate] = useState<DesktopUpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateDownloadProgress | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!platformSupportsUpdates() || automaticCheckStarted) return;
    const preferences = loadUpdatePreferences();
    if (!preferences.autoCheck) return;
    automaticCheckStarted = true;
    const timer = window.setTimeout(() => {
      void platformCheckForUpdate()
        .then(async (available) => {
          if (!available) return;
          setUpdate(available);
          if (preferences.autoInstall) await install(available);
        })
        .catch(() => {
          // Automatic checks stay silent while offline. Manual checks surface errors in Settings.
        });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, []);

  async function install(available: DesktopUpdateInfo) {
    setUpdate(available);
    setInstalling(true);
    setError("");
    try {
      await platformInstallUpdate(setProgress);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "更新安装失败，请稍后重试。");
      setInstalling(false);
    }
  }

  if (!update) return null;
  const percent = progress?.total
    ? Math.min(100, Math.round(progress.downloaded / progress.total * 100))
    : null;

  return (
    <aside className="desktop-update-notice" aria-live="polite" aria-label="软件更新">
      <div>
        <strong>{installing ? `正在安装 MicroRead ${update.version}` : `MicroRead ${update.version} 可以更新`}</strong>
        <p>{error || (installing ? (percent === null ? "正在下载安装包…" : `已下载 ${percent}%`) : update.body || "包含功能改进与问题修复。")}</p>
        {installing && <span className="desktop-update-progress"><i style={{ width: `${percent ?? 12}%` }} /></span>}
      </div>
      {!installing && <button className="primary-button compact" onClick={() => void install(update)}>立即更新</button>}
      {!installing && <button className="ghost-button" onClick={() => setUpdate(null)}>稍后</button>}
    </aside>
  );
}
