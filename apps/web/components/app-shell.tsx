"use client";

import {
  Archive,
  BookOpen,
  BookMarked,
  CloudOff,
  Command,
  HardDrive,
  Inbox,
  Library,
  Menu,
  Search,
  Settings,
  Sparkles,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ensureSeedData } from "@/lib/db";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

const navItems = [
  { href: "/library?state=INBOX", label: "收集箱", icon: Inbox, exactPath: "/library", search: "INBOX" },
  { href: "/library", label: "资料库", icon: Library, exactPath: "/library", search: "" },
  { href: "/topics", label: "专题", icon: Tags, exactPath: "/topics", search: "" },
  { href: "/cards", label: "知识卡", icon: BookMarked, exactPath: "/cards", search: "" },
];

function subscribeToLocation(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function readSearch(): string {
  const hashRoute = window.location.hash.slice(1);
  return hashRoute.startsWith("/")
    ? new URL(hashRoute, "http://reader.local").search
    : window.location.search;
}

export function AppShell({ children, readerMode = false }: { children: React.ReactNode; readerMode?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const routeSearch = useSyncExternalStore(subscribeToLocation, readSearch, () => "");
  const activeLibraryState = new URLSearchParams(routeSearch).get("state");
  const [initializationError, setInitializationError] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.readerReady = "true";
    return () => { delete document.documentElement.dataset.readerReady; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void ensureSeedData().catch(() => {
        if (!cancelled) setInitializationError(true);
    });
    return () => { cancelled = true; };
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
      event.preventDefault();
      setCommandOpen((value) => !value);
    }
    if (event.key === "Escape") setCommandOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (initializationError) {
    return (
      <main className="boot-screen" role="alert">
        <div className="brand-mark large"><BookOpen size={24} /></div>
        <strong>无法打开本地阅读空间</strong>
        <span>请确认浏览器允许此站点使用本地存储，然后重试。</span>
        <button className="primary-button" onClick={() => window.location.reload()}>重新加载</button>
      </main>
    );
  }

  return (
    <div className={`app-frame ${readerMode ? "app-frame-reader" : ""}`}>
      <ServiceWorkerRegistration />
      <button className="mobile-menu-button" aria-label="打开导航" onClick={() => setMobileOpen(true)}>
        <Menu size={20} />
      </button>
      {mobileOpen && <button className="nav-backdrop" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}
      <aside className={`app-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="sidebar-top">
          <Link href="/library" className="brand-lockup" onClick={() => setMobileOpen(false)}>
            <span className="brand-mark"><BookOpen size={19} /></span>
            <span>
              <strong>Native Reader</strong>
              <small>循迹而读</small>
            </span>
          </Link>
          <button className="icon-button sidebar-close" aria-label="关闭导航" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="workspace-switcher static-workspace">
          <span className="workspace-avatar">本</span>
          <span className="workspace-copy">
            <strong>我的阅读空间</strong>
            <small>开源 · 设备本地</small>
          </span>
        </div>

        <button className="command-trigger" onClick={() => setCommandOpen(true)}>
          <Search size={16} />
          <span>搜索或跳转</span>
          <kbd>⌘ K</kbd>
        </button>

        <nav className="main-nav" aria-label="主导航">
          <span className="nav-eyebrow">阅读空间</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.exactPath &&
              activeLibraryState === (item.search || null);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={active ? "active" : ""}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <span className="nav-eyebrow nav-eyebrow-secondary">管理</span>
          <Link href="/library?state=ARCHIVED" onClick={() => setMobileOpen(false)}>
            <Archive size={18} strokeWidth={1.8} />
            <span>已归档</span>
          </Link>
          <Link href="/library?state=TRASHED" onClick={() => setMobileOpen(false)}>
            <Trash2 size={18} strokeWidth={1.8} />
            <span>回收站</span>
          </Link>
          <Link href="/settings" className={pathname === "/settings" ? "active" : ""} onClick={() => setMobileOpen(false)}>
            <Settings size={18} strokeWidth={1.8} />
            <span>设置与用量</span>
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="local-status" title="文档和写入保存在本设备 IndexedDB">
            <CloudOff size={15} />
            <span>已保存在本设备</span>
          </div>
          <div className="profile-row local-profile-row">
            <span className="profile-avatar"><HardDrive size={14} /></span>
            <span className="profile-copy">
              <strong>Local Reader</strong>
              <small>数据由你掌控</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="app-content">{children}</main>

      {commandOpen && (
        <div className="modal-layer command-layer" role="dialog" aria-modal="true" aria-label="命令菜单">
          <button className="modal-backdrop" aria-label="关闭" onClick={() => setCommandOpen(false)} />
          <div className="command-panel">
            <div className="command-input-row">
              <Command size={18} />
              <input autoFocus placeholder="输入页面名称…" aria-label="搜索命令" />
              <kbd>Esc</kbd>
            </div>
            <div className="command-results">
              <span className="nav-eyebrow">快速前往</span>
              {[...navItems, { href: "/settings", label: "设置与用量", icon: Settings }].map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.label} onClick={() => { router.push(item.href); setCommandOpen(false); }}>
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <span className="nav-eyebrow">提示</span>
              <div className="command-tip">
                <Sparkles size={18} />
                <span>打开英文资料可进行全文翻译；选择文字可让 AI 解释当前语境。</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
