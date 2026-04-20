import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { StrictMode } from "react";
import * as ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter } from "@/lib/router";
import { App } from "./App";
import { applyAccentColor, isCompactMode, loadAccentColor } from "./components/PersonalPreferences";
import { PowerModeProvider } from "./components/ProgressiveDisclosure";
import { BreadcrumbProvider } from "./context/BreadcrumbContext";
import { CompanyProvider } from "./context/CompanyContext";
import { DialogProvider } from "./context/DialogContext";
import { LiveUpdatesProvider } from "./context/LiveUpdatesProvider";
import { PanelProvider } from "./context/PanelContext";
import { SidebarProvider } from "./context/SidebarContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { initPluginBridge } from "./plugins/bridge-init";
import { PluginLauncherProvider } from "./plugins/launchers";
import "@mdxeditor/editor/style.css";
import "./index.css";

initPluginBridge(React, ReactDOM);

// Apply compact mode if saved
if (isCompactMode()) {
  document.documentElement.classList.add("compact");
}

// Apply saved accent color
const savedAccent = loadAccentColor();
if (savedAccent) {
  applyAccentColor(savedAccent);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 600_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <CompanyProvider>
            <ToastProvider>
              <LiveUpdatesProvider>
                <TooltipProvider>
                  <BreadcrumbProvider>
                    <SidebarProvider>
                      <PanelProvider>
                        <PluginLauncherProvider>
                          <PowerModeProvider>
                            <DialogProvider>
                              <App />
                            </DialogProvider>
                          </PowerModeProvider>
                        </PluginLauncherProvider>
                      </PanelProvider>
                    </SidebarProvider>
                  </BreadcrumbProvider>
                </TooltipProvider>
              </LiveUpdatesProvider>
            </ToastProvider>
          </CompanyProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
