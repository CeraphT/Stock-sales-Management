// Must be first: injects platform capabilities into @stockflow/core before
// any store/API/router code runs.
import "@/bootstrap";

// Tailwind base/components/utilities + the theme CSS variables. Without this
// the app renders as unstyled HTML.
import "@/index.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { ConfirmHost } from "@/components/ConfirmHost";
import { AppErrorBoundary } from "@/components/Errors";
import { ToastHost } from "@/components/ToastHost";
import { installGlobalErrorHandlers } from "@/lib/globalErrors";
import { queryClient } from "@/lib/queryClient";
import { router } from "@/router";

// Surface uncaught async errors (rejected promises, handler throws) that never
// reach a React error boundary — otherwise they die silently in the webview.
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ToastHost />
        <ConfirmHost />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
