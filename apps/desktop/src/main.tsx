import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import { DesktopApp } from "./app";
import { DesktopRouter } from "./router";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesktopRouter>
      <DesktopApp />
    </DesktopRouter>
  </StrictMode>,
);
