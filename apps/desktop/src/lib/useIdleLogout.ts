import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { logout } from "@/lib/session";
import { toast } from "@/lib/toast";

/** Auto sign-out after a stretch of no user activity — a shared till left open
 * shouldn't stay authenticated. Any real interaction (move/click/key/scroll)
 * resets the countdown. */
const IDLE_MS = 20 * 60_000; // 20 minutes

export function useIdleLogout(): void {
  const navigate = useNavigate();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const reset = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        logout();
        toast("Signed out after 20 minutes of inactivity.", "info");
        navigate("/onboarding", { replace: true });
      }, IDLE_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset(); // arm on mount

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [navigate]);
}
