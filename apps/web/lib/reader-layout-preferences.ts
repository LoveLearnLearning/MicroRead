const READER_SIDEBAR_KEY = "micro-read:reader-main-sidebar:v1";
const READER_SIDEBAR_EVENT = "micro-read:reader-main-sidebar-change";

export function subscribeReaderSidebarCollapsed(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (event.key === READER_SIDEBAR_KEY) onChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(READER_SIDEBAR_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(READER_SIDEBAR_EVENT, onChange);
  };
}

export function loadReaderSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(READER_SIDEBAR_KEY) === "collapsed";
}

export function saveReaderSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(READER_SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  window.dispatchEvent(new Event(READER_SIDEBAR_EVENT));
}
