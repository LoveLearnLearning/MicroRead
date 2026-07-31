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
import { platformHealth } from "@/lib/platform";

interface Health {
  ok: boolean;
  ai: { provider: string; model: string; configured: boolean };
  storage: string;
  sync: string;
  timestamp: string;
}

const defaultFlags: FeatureFlags = { aiEnabled: true, webImportEnabled: true, pdfImportEnabled: true };

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
            <div className="settings-section-title"><span><Sparkles size={18} /></span><div><h2>AI 服务</h2><p>凭据只存在于服务端环境变量，浏览器不会读取或保存密钥。</p></div><button className="icon-button" onClick={() => void loadHealth()} aria-label="刷新状态"><RefreshCw size={16} /></button></div>
            <div className="settings-card provider-card">
              <div className="provider-mark">DS</div>
              <div><strong>{health?.ai.provider || "DeepSeek"}</strong><small>{health?.ai.model || "正在读取模型…"}</small></div>
              <span className={`status-pill ${health?.ai.configured ? "success" : "warning"}`}>{health === null ? <LoaderCircle className="spin" size={12} /> : health.ai.configured ? <Check size={12} /> : <AlertTriangle size={12} />}{health === null ? "检查中" : health.ai.configured ? "已配置" : "缺少凭据"}</span>
            </div>
            {healthError && <p className="settings-warning">{healthError}</p>}
            <div className="usage-grid">
              <div><span><Gauge size={16} /></span><small>输入 Token</small><strong>{totals.input.toLocaleString()}</strong></div>
              <div><span><Activity size={16} /></span><small>输出 Token</small><strong>{totals.output.toLocaleString()}</strong></div>
              <div><span><KeyRound size={16} /></span><small>预估 API 成本</small><strong>${totals.cost.toFixed(4)}</strong></div>
            </div>
            <p className="settings-footnote">成本按项目基线中的 DeepSeek V4 Flash 公价估算，仅用于测试观察；实际账单以供应商为准。</p>
          </section>

          <section className="settings-section">
            <div className="settings-section-title"><span><HardDrive size={18} /></span><div><h2>本地数据</h2><p>文档和用户写入保存在当前浏览器的 IndexedDB。</p></div></div>
            <div className="local-data-stats"><div><strong>{sourceCount}</strong><small>资料</small></div><div><strong>{annotationCount}</strong><small>标注</small></div><div><strong>{cardCount}</strong><small>知识卡</small></div><div><strong>{formatFileSize(storageUsage)}</strong><small>站点已用空间</small></div></div>
            {storageQuota > 0 && <div className="storage-meter"><div><span>浏览器存储</span><small>{formatFileSize(storageUsage)} / {formatFileSize(storageQuota)}</small></div><span><i style={{ width: `${Math.min(100, storageUsage / storageQuota * 100)}%` }} /></span></div>}
            <div className="settings-action-row"><span><Download size={17} /><span><strong>导出完整备份</strong><small>包含来源、锚点、标注、卡片、AI 记录、设置和 PDF 原件。</small></span></span><button className="secondary-button" disabled={backupBusy} onClick={() => void downloadBackup()}>{backupBusy ? "处理中…" : "导出备份"}</button></div>
            <div className="settings-action-row"><span><Upload size={17} /><span><strong>恢复完整备份</strong><small>校验备份版本与引用关系后，替换当前本地工作区。</small></span></span><button className="secondary-button" disabled={backupBusy} onClick={() => restoreInput.current?.click()}>选择备份</button><input ref={restoreInput} className="visually-hidden" type="file" accept=".anr-backup,application/zip,application/vnd.ai-native-reader.backup+zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreBackup(file); }} /></div>
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
