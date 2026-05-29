import { useEffect } from "react";

export const useWakeLock = (active = true): void => {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) {
      return undefined;
    }

    let lock: WakeLockSentinel | null = null;
    let mounted = true;

    const acquire = async () => {
      try {
        const nextLock = await navigator.wakeLock.request("screen");
        if (mounted && nextLock) {
          lock = nextLock;
        }
      } catch {
        // User-agent rejected the request. This is optional polish, so noop.
      }
    };

    void acquire();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
};
