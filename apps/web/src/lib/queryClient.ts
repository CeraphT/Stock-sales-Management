import { QueryClient } from "@tanstack/react-query";

// Reads go through TanStack Query; after every local write and after each
// syncNow() we invalidate — this is the desktop replacement for mobile's
// drizzle useLiveQuery reactivity (see docs/desktop-rebuild.md §4).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
