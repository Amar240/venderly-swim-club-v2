import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";

type UiPrefs = {
  darkMode: boolean;
  toggleDarkMode: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  playChime: () => void;
};

const KEYS = { dark: "venderly.darkMode", sound: "venderly.sound" };

const UiPrefsContext = createContext<UiPrefs | null>(null);

const readStoredBoolean = (key: string): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(key) === "true";
};

export const UiPrefsProvider = ({ children }: PropsWithChildren) => {
  const [darkMode, setDarkMode] = useState(() => readStoredBoolean(KEYS.dark));
  const [soundEnabled, setSoundEnabled] = useState(() => readStoredBoolean(KEYS.sound));
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    window.localStorage.setItem(KEYS.dark, String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    window.localStorage.setItem(KEYS.sound, String(soundEnabled));
  }, [soundEnabled]);

  const value = useMemo<UiPrefs>(
    () => ({
      darkMode,
      toggleDarkMode: () => setDarkMode((current) => !current),
      soundEnabled,
      toggleSound: () => setSoundEnabled((current) => !current),
      playChime: () => {
        if (!soundEnabled) {
          return;
        }

        try {
          const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
          if (!AudioContextConstructor) {
            return;
          }

          const context = audioContextRef.current ?? new AudioContextConstructor();
          audioContextRef.current = context;

          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const now = context.currentTime;

          oscillator.frequency.value = 440;
          oscillator.type = "sine";
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(now);
          oscillator.stop(now + 0.11);
        } catch {
          // Audio feedback is optional and may be blocked by the browser.
        }
      }
    }),
    [darkMode, soundEnabled]
  );

  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>;
};

export const useUiPrefs = (): UiPrefs => {
  const context = useContext(UiPrefsContext);

  if (!context) {
    throw new Error("useUiPrefs must be used within UiPrefsProvider");
  }

  return context;
};
