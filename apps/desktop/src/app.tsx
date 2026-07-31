import { lazy, Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ReaderWorkspace } from "@/components/reader-workspace";
import { useDesktopRouter } from "./router";

const LibraryPage = lazy(() => import("@/app/library/page"));
const TopicsPage = lazy(() => import("@/app/topics/page"));
const CardsPage = lazy(() => import("@/app/cards/page"));
const SettingsPage = lazy(() => import("@/app/settings/page"));

export function DesktopApp() {
  const { pathname, params } = useDesktopRouter();

  let content;
  if (pathname.startsWith("/reader/") && params.id) {
    content = <AppShell readerMode><ReaderWorkspace sourceId={params.id} /></AppShell>;
  } else if (pathname === "/topics") {
    content = <TopicsPage />;
  } else if (pathname === "/cards") {
    content = <CardsPage />;
  } else if (pathname === "/settings") {
    content = <SettingsPage />;
  } else {
    content = <LibraryPage />;
  }

  return <Suspense fallback={<main className="route-loading" aria-label="正在加载页面" />}>{content}</Suspense>;
}
