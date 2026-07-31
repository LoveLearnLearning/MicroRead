import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface RouteState {
  pathname: string;
  searchParams: URLSearchParams;
  params: Record<string, string>;
  push: (href: string) => void;
  replace: (href: string) => void;
  refresh: () => void;
}

const RouterContext = createContext<RouteState | null>(null);

function readLocation(): Pick<RouteState, "pathname" | "searchParams" | "params"> {
  const raw = window.location.hash.slice(1) || "/library";
  const url = new URL(raw, "http://reader.local");
  const readerMatch = url.pathname.match(/^\/reader\/([^/]+)$/);
  return {
    pathname: url.pathname === "/" || url.pathname === "/sign-in" ? "/library" : url.pathname,
    searchParams: url.searchParams,
    params: readerMatch ? { id: decodeURIComponent(readerMatch[1]!) } : {},
  };
}

export function DesktopRouter({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(readLocation);

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, "", "#/library");
    const onChange = () => setLocation(readLocation());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const value = useMemo<RouteState>(() => ({
    ...location,
    push: (href) => { window.location.hash = normalizeHref(href); },
    replace: (href) => {
      window.history.replaceState(null, "", `#${normalizeHref(href)}`);
      setLocation(readLocation());
    },
    refresh: () => setLocation(readLocation()),
  }), [location]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useDesktopRouter(): RouteState {
  const value = useContext(RouterContext);
  if (!value) throw new Error("DesktopRouter is missing.");
  return value;
}

export function normalizeHref(href: string): string {
  return href.startsWith("/") ? href : `/${href}`;
}
