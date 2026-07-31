"use client";

import { useEffect } from "react";
import { shouldRegisterServiceWorker } from "@/lib/service-worker-policy";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (window.location.hostname === "tauri.localhost") {
      void navigator.serviceWorker?.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
      void caches?.keys()
        .then((cacheNames) => Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith("micro-read-"))
            .map((cacheName) => caches.delete(cacheName)),
        ))
        .catch(() => undefined);
      return;
    }
    if ("serviceWorker" in navigator && shouldRegisterServiceWorker(window.location, process.env.NODE_ENV)) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);
  return null;
}
