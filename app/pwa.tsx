"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Registers the service worker (production only, so it never fights dev HMR). */
export function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Clean up any worker left over from a previous production run on this origin.
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
}

/** Ask the service worker to cache all diagram images for offline use. */
export async function precacheDiagrams(urls: string[]) {
  if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage({ type: "CACHE_DIAGRAMS", urls });
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** "Install app" button — shown only when the browser offers installation. */
export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPromptEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!promptEvent) return null;

  return (
    <button
      onClick={async () => {
        await promptEvent.prompt();
        await promptEvent.userChoice;
        setPromptEvent(null);
      }}
      title="Install as app"
      className="ml-auto grid h-7 w-7 place-items-center rounded-md border border-white/[0.08] text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
      </svg>
    </button>
  );
}
