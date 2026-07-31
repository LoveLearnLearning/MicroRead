"use client";

import {
  Activity,
  AlertTriangle,
  Check,
  CloudOff,
  Database,
  Download,
  FileArchive,
  Gauge,
  HardDrive,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureFlags } from "@reader/domain";
import { AppShell } from "@/components/app-shell";
import { db, deleteAllLocalData, ensureSeedData } from "@/lib/db";
import { exportFullBackup, restoreFullBackup } from "@/lib/export";
import { formatFileSize } from "@/lib/format";
import { prepareAiSettingsSave, savedAiSettingsState } from "@/lib/ai-settings";
import {
  platformCheckForUpdate,
  platformGetAppVersion,
  platformHealth,
  platformInstallUpdate,
  platformLoadAiSettings,
  platformSaveAiSettings,
  platformSupportsAiSettings,
  platformSupportsUpdates,
} from "@/lib/platform";
import type { AiSettings, AiSettingsUpdate, DesktopUpdateInfo, UpdateDownloadProgress } from "@/lib/platform";
import { loadUpdatePreferences, saveUpdatePreferences, type UpdatePreferences } from "@/lib/update-preferences";

interface Health {
  ok: boolean;
  ai: { provider: string; model: string; configured: boolean };
  storage: string;
  sync: string;
  timestamp: string;
}

const defaultFlags: FeatureFlags = { aiEnabled: true, webImportEnabled: true, pdfImportEnabled: true };

const emptyAiSettings: AiSettings = { apiKey: "", hasApiKey: false, baseUrl: "", model: "", requestsPerHour: 30 };

export default function SettingsPage() {
  const router = useRouter();
  const usage = useLiveQuery(() => db.usageEntries.toArray(), [], []);
  const localOperations = useLiveQuery(() => db.syncOperations.toArray(), [], []);
  const sourceCount = useLiveQuery(() => db.sources.count(), [], 0);
  const annotationCount = useLiveQuery(() => db.annotations.count(), [], 0);
  const cardCount = useLiveQuery(() => db.cards.count(), [], 0);
  const setting = useLiveQuery(() => db.settings.get("featureFlags"), [], undefined);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState("");
  const [storageUsage, setStorageUsage] = useState(0);
  const [storageQuota, setStorageQuota] = useState(0);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupError, setBackupError] = useState("");
  const [desktopAiSettings, setDesktopAiSettings] = useState<AiSettings | null>(null);
  const [aiDraft, setAiDraft] = useState<AiSettings>(emptyAiSettings);
  const [aiSaveStatus, setAiSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const desktopAiSupported = platformSupportsAiSettings();
  const [aiSettingsError, setAiSettingsError] = useState("");
  const updatesSupported = platformSupportsUpdates();
  const [appVersion, setAppVersion] = useState("");
  const [availableUpdate, setAvailableUpdate] = useState<DesktopUpdateInfo | null>(null);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "installing">("idle");
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [updateProgress, setUpdateProgress] = useState<UpdateDownloadProgress | null>(null);
  const [updatePreferences, setUpdatePreferences] = useState<UpdatePreferences>(loadUpdatePreferences);
  const restoreInput = useRef<HTMLInputElement>(null);

  async function loadHealth() {
    setHealthError("");
    try {
      const localHealth = await platformHealth();
      if (localHealth) {
        setHealth(localHealth);
        return;
      }
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setHealth(await response.json() as Health);
    } catch {
      setHealthError("无法读取服务状态，AI 功能可能暂不可用。 ");
    }
  }

  useEffect(() => {
    if (!desktopAiSupported) return;
    void (async () => {
      try {
        const loaded = await platformLoadAiSettings();
        if (loaded === null) throw new Error("桌面运行时未返回 AI 配置。");
        setDesktopAiSettings(loaded);
        setAiDraft({ ...loaded, apiKey: "" });
      } catch (reason) {
        setAiSettingsError(reason instanceof Error ? reason.message : "无法读取桌面 AI 配置。");
      }
    })();
  }, [desktopAiSupported]);

  useEffect(() => {
    if (!updatesSupported) return;
    void platformGetAppVersion().then((version) => setAppVersion(version || ""));
  }, [updatesSupported]);

  async function checkForUpdates() {
    setUpdateStatus("checking");
    setUpdateError("");
    setUpdateMessage("");
    try {
      const available = await platformCheckForUpdate();
      setAvailableUpdate(available);
      setUpdateMessage(available ? `发现新版本 ${available.version}` : "当前已经是最新版本。");
    } catch (reason) {
      setUpdateError(reason instanceof Error ? reason.message : "无法读取更新信息，请检查网络后重试。");
    } finally {
      setUpdateStatus("idle");
    }
  }

  async function installAvailableUpdate() {
    if (!availableUpdate || !window.confirm(`将更新到 MicroRead ${availableUpdate.version}，安装完成后软件会自动重启。继续吗？`)) return;
    setUpdateStatus("installing");
    setUpdateError("");
    setUpdateProgress(null);
    try {
      await platformInstallUpdate(setUpdateProgress);
    } catch (reason) {
      setUpdateError(reason instanceof Error ? reason.message : "更新安装失败，请稍后重试。");
      setUpdateStatus("idle");
    }
  }

  function changeUpdatePreference(next: UpdatePreferences) {
    const normalized = next.autoInstall ? { ...next, autoCheck: true } : next;
    setUpdatePreferences(normalized);
    saveUpdatePreferences(normalized);
  }

  async function saveAiDraft() {
    setAiSaveStatus("saving");
    setAiSettingsError("");
    try {
      const update = prepareAiSettingsSave(aiDraft);
      await platformSaveAiSettings(update);
      const saved = savedAiSettingsState(update, aiDraft.hasApiKey);
      setAiDraft(saved);
      setDesktopAiSettings(saved);
      setAiSaveStatus("saved");
      await loadHealth();
      window.setTimeout(() => setAiSaveStatus("idle"), 1600);
    } catch (reason) {
      setAiSettingsError(reason instanceof Error ? reason.message : "保存失败，请重试。");
      setAiSaveStatus("idle");
    }
  }

  async function clearSavedApiKey() {
    if (!window.confirm("确定从系统凭据库中删除已保存的 API Key 吗？")) return;
    setAiSaveStatus("saving");
    setAiSettingsError("");
    try {
      const update: AiSettingsUpdate = {
        ...prepareAiSettingsSave(aiDraft),
        apiKey: null,
        clearApiKey: true,
      };
      await platformSaveAiSettings(update);
      const saved = savedAiSettingsState(update, aiDraft.hasApiKey);
      setAiDraft(saved);
      setDesktopAiSettings(saved);
      setAiSaveStatus("saved");
      await loadHealth();
      window.setTimeout(() => setAiSaveStatus("idle"), 1600);
    } catch (reason) {
      setAiSettingsError(reason instanceof Error ? reason.message : "无法清除 API Key。");
      setAiSaveStatus("idle");
    }
  }

  useEffect(() => {
    const healthTimer = window.setTimeout(() => void loadHealth(), 0);
    void navigator.storage?.estimate().then((estimate) => {
      setStorageUsage(estimate.usage || 0);
      setStorageQuota(estimate.quota || 0);
    });
    return () => window.clearTimeout(healthTimer);
  }, []);

  const totals = useMemo(() => ({
    input: usage.filter((entry) => entry.category === "LLM_INPUT").reduce((sum, entry) => sum + entry.quantity, 0),
    output: usage.filter((entry) => entry.category === "LLM_OUTPUT").reduce((sum, entry) => sum + entry.quantity, 0),
    cost: usage.reduce((sum, entry) => sum + entry.providerCostUsd, 0),
  }), [usage]);

  const flags = (setting?.value as FeatureFlags | undefined) || defaultFlags;
  async function toggleFlag(key: keyof FeatureFlags) {
    await db.settings.put({ key: "featureFlags", value: { ...flags, [key]: !flags[key] } });
  }

  async function removeLocalData() {
    if (!window.confirm("这会永久删除当前浏览器中的 PDF、标注、知识卡和 AI 记录。建议先导出完整备份。继续吗？")) return;
    if (!window.confirm("再次确认：删除后无法撤销。")) return;
    await deleteAllLocalData();
    await ensureSeedData();
    router.replace("/library");
  }

  async function downloadBackup() {
    setBackupBusy(true);
    setBackupError("");
    setBackupMessage("");
    try {
      await exportFullBackup();
      setBackupMessage("完整备份已生成，请妥善保存下载的 .anr-backup 文件。");
    } catch (reason) {
      setBackupError(reason instanceof Error ? reason.message : "无法生成完整备份。");
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreBackup(file: File) {
    if (!window.confirm("恢复会用备份内容替换当前本地工作区。尚未备份的现有数据将被移除，继续吗？")) return;
    setBackupBusy(true);
    setBackupError("");
    setBackupMessage("");
    try {
      const summary = await restoreFullBackup(file);
      setBackupMessage(`恢复完成：${summary.sources} 份资料、${summary.pdfFiles} 个 PDF 原件、${summary.annotations} 条标注、${summary.knowledgeCards} 张知识卡。`);
    } catch (reason) {
      setBackupError(reason instanceof Error ? reason.message : "无法恢复此备份。");
    } finally {
      setBackupBusy(false);
      if (restoreInput.current) restoreInput.current.value = "";
    }
  }

  return (
    <AppShell>
      <div className="page settings-page">
        <div className="page-inner narrow">
          <header className="page-header"><div className="page-heading"><span className="eyebrow">SETTINGS & OPERATIONS</span><h1>设置与用量</h1><p>管理本地数据、AI 服务和开源 Reader 的运行状态。</p></div></header>

          <section className="settings-section">
            <div className="settings-section-title"><span><Sparkles size={18} /></span><div><h2>AI 服务</h2><p>{desktopAiSupported === false ? "Web 端凭据从服务端环境变量读取。" : "桌面端凭据保存在操作系统凭据库中，页面不会读取已存密钥。"}</p></div><button className="icon-button" onClick={() => void loadHealth()} aria-label="刷新状态"><RefreshCw size={16} /></button></div>
            <div className="settings-card provider-card">
              <div className="provider-mark">DS</div>
              <div><strong>{health?.ai.provider || "DeepSeek"}</strong><small>{health?.ai.model || "正在读取模型…"}</small></div>
              <span className={`status-pill ${health?.ai.configured ? "success" : "warning"}`}>{health === null ? <LoaderCircle className="spin" size={12} /> : health.ai.configured ? <Check size={12} /> : <AlertTriangle size={12} />}{health === null ? "检查中" : health.ai.configured ? "已配置" : "缺少凭据"}</span>
            </div>
            {healthError && <p className="settings-warning">{healthError}</p>}
            {aiSettingsError && <p className="settings-warning">{aiSettingsError}</p>}
            {desktopAiSupported && (
              <div className="ai-config-form">
                <label className="ai-field"><span><KeyRound size={14} /> API Key</span><input type="password" autoComplete="new-password" placeholder={aiDraft.hasApiKey ? "已安全保存；输入新密钥以替换" : "sk-..."} value={aiDraft.apiKey} onChange={(event) => setAiDraft((current) => ({ ...current, apiKey: event.target.value }))} /></label>
                <label className="ai-field"><span>Base URL</span><input type="text" placeholder="https://api.deepseek.com" value={aiDraft.baseUrl} onChange={(event) => setAiDraft((current) => ({ ...current, baseUrl: event.target.value }))} /></label>
                <label className="ai-field"><span>Model</span><input type="text" placeholder="deepseek-v4-flash" value={aiDraft.model} onChange={(event) => setAiDraft((current) => ({ ...current, model: event.target.value }))} /></label>
                <label className="ai-field"><span>每小时请求数</span><input type="number" min={1} max={1000} value={aiDraft.requestsPerHour} onChange={(event) => setAiDraft((current) => ({ ...current, requestsPerHour: Number(event.target.value) || 30 }))} /></label>
                <div className="ai-config-actions">
                  <button className="secondary-button" disabled={aiSaveStatus === "saving"} onClick={() => void saveAiDraft()}>
                    {aiSaveStatus === "saving" ? "保存中…" : <><Save size={14} /> 保存配置</>}
                  </button>
                  {aiDraft.hasApiKey && <button className="secondary-button" disabled={aiSaveStatus === "saving"} onClick={() => void clearSavedApiKey()}><Trash2 size={14} /> 清除密钥</button>}
                  {aiSaveStatus === "saved" && <span className="settings-success"><Check size={14} /> 已保存,刷新状态中</span>}
                  {desktopAiSettings?.hasApiKey && !aiDraft.apiKey && <span className="settings-success"><ShieldCheck size={14} /> 已保存的密钥保持不变</span>}
                </div>
                <p className="settings-footnote">密钥保存在操作系统凭据库中，不会写入应用配置、浏览器存储或备份文件，也不会回传到页面。</p>
              </div>
            )}
            {desktopAiSupported === false && (
              <p className="settings-footnote">在 Web 模式下,请通过 <code>.env.local</code> 配置 <code>OPENAI_API_KEY</code>;桌面版支持在此直接填写。</p>
            )}
            <div className="usage-grid">
              <div><span><Gauge size={16} /></span><small>输入 Token</small><strong>{totals.input.toLocaleString()}</strong></div>
              <div><span><Activity size={16} /></span><small>输出 Token</small><strong>{totals.output.toLocaleString()}</strong></div>
              <div><span><KeyRound size={16} /></span><small>预估 API 成本</small><strong>${totals.cost.toFixed(4)}</strong></div>
            </div>
            <p className="settings-footnote">成本按项目基线中的 DeepSeek V4 Flash 公价估算，仅用于测试观察；实际账单以供应商为准。</p>
          </section>

          {updatesSupported && (
            <section className="settings-section">
              <div className="settings-section-title"><span><RefreshCw size={18} /></span><div><h2>软件更新</h2><p>通过带签名的 GitHub Release 安全更新桌面版。</p></div><span className="status-pill success">{appVersion ? `v${appVersion}` : "DESKTOP"}</span></div>
              <div className="settings-action-row"><span><Download size={17} /><span><strong>手动检查更新</strong><small>{availableUpdate ? `可安装 v${availableUpdate.version}` : "检查是否有新的稳定版本"}</small></span></span><button className="secondary-button" disabled={updateStatus !== "idle"} onClick={() => void checkForUpdates()}>{updateStatus === "checking" ? "检查中…" : "检查更新"}</button></div>
              {availableUpdate && <div className="settings-action-row"><span><RefreshCw size={17} /><span><strong>安装 v{availableUpdate.version}</strong><small>{availableUpdate.body || "下载、验签、安装并重新启动软件"}</small></span></span><button className="primary-button" disabled={updateStatus !== "idle"} onClick={() => void installAvailableUpdate()}>{updateStatus === "installing" ? "安装中…" : "立即更新"}</button></div>}
              {updateStatus === "installing" && <div className="storage-meter"><div><span>正在下载并验签</span><small>{updateProgress?.total ? `${Math.round(updateProgress.downloaded / updateProgress.total * 100)}%` : "准备中…"}</small></div><span><i style={{ width: `${updateProgress?.total ? Math.min(100, updateProgress.downloaded / updateProgress.total * 100) : 8}%` }} /></span></div>}
              {updateMessage && <p className="settings-success"><Check size={14} /> {updateMessage}</p>}
              {updateError && <p className="settings-warning"><AlertTriangle size={14} /> {updateError}</p>}
              <div className="flag-list update-preference-list">
                <label><span><strong>启动后自动检查</strong><small>启动约两秒后静默检查；离线时不打扰阅读。</small></span><input type="checkbox" checked={updatePreferences.autoCheck} onChange={(event) => changeUpdatePreference({ ...updatePreferences, autoCheck: event.target.checked, autoInstall: event.target.checked ? updatePreferences.autoInstall : false })} /><i /></label>
                <label><span><strong>自动安装并重启</strong><small>发现新版本后自动下载、验签和安装；默认关闭。</small></span><input type="checkbox" checked={updatePreferences.autoInstall} onChange={(event) => changeUpdatePreference({ ...updatePreferences, autoInstall: event.target.checked })} /><i /></label>
              </div>
              <p className="settings-footnote">更新包必须通过内置公钥验签。关闭自动安装后，软件只提示新版本，不会自行重启。</p>
            </section>
          )}

          <section className="settings-section">
            <div className="settings-section-title"><span><HardDrive size={18} /></span><div><h2>本地数据</h2><p>文档和用户写入保存在当前浏览器的 IndexedDB。</p></div></div>
            <div className="local-data-stats"><div><strong>{sourceCount}</strong><small>资料</small></div><div><strong>{annotationCount}</strong><small>标注</small></div><div><strong>{cardCount}</strong><small>知识卡</small></div><div><strong>{formatFileSize(storageUsage)}</strong><small>站点已用空间</small></div></div>
            {storageQuota > 0 && <div className="storage-meter"><div><span>浏览器存储</span><small>{formatFileSize(storageUsage)} / {formatFileSize(storageQuota)}</small></div><span><i style={{ width: `${Math.min(100, storageUsage / storageQuota * 100)}%` }} /></span></div>}
            <div className="settings-action-row"><span><Download size={17} /><span><strong>导出完整备份</strong><small>包含来源、锚点、标注、卡片、AI 记录、设置和 PDF 原件。</small></span></span><button className="secondary-button" disabled={backupBusy} onClick={() => void downloadBackup()}>{backupBusy ? "处理中…" : "导出备份"}</button></div>
            <div className="settings-action-row"><span><Upload size={17} /><span><strong>恢复完整备份</strong><small>校验备份版本与引用关系后，替换当前本地工作区。</small></span></span><button className="secondary-button" disabled={backupBusy} onClick={() => restoreInput.current?.click()}>选择备份</button><input ref={restoreInput} className="visually-hidden" type="file" accept=".anr-backup,application/zip,application/vnd.micro-read.backup+zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreBackup(file); }} /></div>
            {backupMessage && <p className="settings-success"><FileArchive size={14} /> {backupMessage}</p>}
            {backupError && <p className="settings-warning"><AlertTriangle size={14} /> {backupError}</p>}
            <div className="settings-action-row danger-row"><span><Trash2 size={17} /><span><strong>清空本设备数据</strong><small>永久移除原件与全部本地记录，然后恢复初始示例资料。</small></span></span><button className="danger-button" onClick={() => void removeLocalData()}>清空数据</button></div>
          </section>

          <section className="settings-section">
            <div className="settings-section-title"><span><Server size={18} /></span><div><h2>本地运行状态</h2><p>Reader 以本地数据为正式边界，不依赖云同步。</p></div></div>
            <div className="ops-status-grid">
              <div><CloudOff size={18} /><span><strong>设备本地</strong><small>{localOperations.length} 项写入保留在操作日志中</small></span><span className="status-pill success">LOCAL</span></div>
              <div><Database size={18} /><span><strong>IndexedDB</strong><small>刷新、重启和断网后仍可读取</small></span><span className="status-pill success">健康</span></div>
              <div><ShieldCheck size={18} /><span><strong>隐私边界</strong><small>AI 请求只发送检索命中的文本片段</small></span><span className="status-pill success">启用</span></div>
            </div>
            <p className="settings-warning"><AlertTriangle size={14} /> 浏览器站点数据可能被手动清除；请定期导出完整备份并保存在其他目录。</p>
          </section>

          <section className="settings-section">
            <div className="settings-section-title"><span><Activity size={18} /></span><div><h2>功能开关</h2><p>用于控制本地能力与验证降级路径；关闭 AI 不影响阅读和标注。</p></div></div>
            <div className="flag-list">
              {([
                ["aiEnabled", "AI 阅读辅助", "选区解释、文档问答与全文翻译"],
                ["pdfImportEnabled", "PDF 导入", "保存并渐进式解析本地 PDF"],
                ["webImportEnabled", "网页导入", "提取公开网页正文"],
              ] as Array<[keyof FeatureFlags, string, string]>).map(([key, label, detail]) => <label key={key}><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={flags[key]} onChange={() => void toggleFlag(key)} /><i /></label>)}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
