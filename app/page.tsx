"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InstallButton, precacheDiagrams, useOnline, useServiceWorker } from "./pwa";

type Diagram = {
  id: string;
  title: string;
  file: string;
  src: string;
  size: number;
  updatedAt: string;
};

type Manifest = { generatedAt: string; count: number; diagrams: Diagram[] };

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const clamp = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Home() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const online = useOnline();
  useServiceWorker();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadManifest = useCallback(async () => {
    try {
      const res = await fetch(`/diagrams/diagrams.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("diagrams.json not found. Click Sync to generate it.");
      const data: Manifest = await res.json();
      setManifest(data);
      setError(null);
      precacheDiagrams(data.diagrams.map((d) => d.src));
      setSelectedId((cur) =>
        cur && data.diagrams.some((d) => d.id === cur) ? cur : (data.diagrams[0]?.id ?? null),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadManifest();
  }, [loadManifest]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) throw new Error(`Sync failed (${res.status})`);
      const data: Manifest = await res.json();
      setManifest(data);
      setError(null);
      precacheDiagrams(data.diagrams.map((d) => d.src));
      setSelectedId((cur) =>
        cur && data.diagrams.some((d) => d.id === cur) ? cur : (data.diagrams[0]?.id ?? null),
      );
      setToast(`Synced ${data.count} diagram${data.count === 1 ? "" : "s"}`);
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const terms = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter(Boolean), [query]);

  const filtered = useMemo(() => {
    const list = manifest?.diagrams ?? [];
    if (!terms.length) return list;
    return list.filter((d) => {
      const hay = `${d.title} ${d.file}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [manifest, terms]);

  // Ctrl/Cmd+K or "/" focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement).tagName === "INPUT";
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !inInput)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const d = filtered[activeIndex];
      if (d) setSelectedId(d.id);
    } else if (e.key === "Escape") {
      if (query) setQuery("");
      else searchRef.current?.blur();
    }
  };

  const selected = manifest?.diagrams.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#0b0d12] text-slate-200">
      {/* Sidebar */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-white/[0.06] bg-[#0f1218]">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 text-sm font-bold text-white">
            LD
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Learning Diagrams</h1>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              {manifest ? `${manifest.count} diagrams` : "—"}
              {!online && (
                <span className="rounded bg-amber-500/15 px-1.5 py-px text-[10px] font-medium text-amber-300">
                  Offline
                </span>
              )}
            </p>
          </div>
          <InstallButton />
        </div>

        <div className="space-y-2 px-4 pb-3">
          <button
            onClick={sync}
            disabled={syncing || !online}
            title={online ? "Rescan public/diagrams" : "Sync needs a connection"}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            <svg
              className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2" />
              <path d="M21 4v5h-5M3 20v-5h5" />
            </svg>
            {syncing ? "Syncing…" : "Sync diagrams"}
          </button>
          <div className="relative">
            <svg
              className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onSearchKey}
              placeholder="Search diagrams…"
              className="w-full rounded-md border border-white/[0.08] bg-white/[0.03] py-2 pr-14 pl-8 text-sm placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none"
            />
            {query ? (
              <button
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                title="Clear (Esc)"
                className="absolute top-1/2 right-2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-white/[0.08] hover:text-white"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            ) : (
              <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-white/[0.1] px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                Ctrl K
              </kbd>
            )}
          </div>
          {terms.length > 0 && (
            <p className="px-1 text-[11px] text-slate-500">
              {filtered.length} of {manifest?.count ?? 0} results · ↑↓ to navigate, Enter to open
            </p>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {filtered.map((d, i) => (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              onMouseEnter={() => terms.length && setActiveIndex(i)}
              className={`group mb-1 flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition ${
                d.id === selectedId
                  ? "bg-indigo-500/15 text-white ring-1 ring-indigo-500/30"
                  : terms.length > 0 && i === activeIndex
                    ? "bg-white/[0.06] text-white"
                    : "text-slate-300 hover:bg-white/[0.04]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={d.src}
                alt=""
                className="h-10 w-14 shrink-0 rounded border border-white/[0.06] bg-white object-cover"
              />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">
                  <Highlight text={d.title} terms={terms} />
                </div>
                <div className="text-[11px] text-slate-500">{formatSize(d.size)}</div>
              </div>
            </button>
          ))}
          {manifest && filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-500">No diagrams match &ldquo;{query.trim()}&rdquo;.</p>
          )}
        </nav>

        {manifest && (
          <div className="border-t border-white/[0.06] px-5 py-3 text-[11px] text-slate-500">
            Last sync: {new Date(manifest.generatedAt).toLocaleString()}
          </div>
        )}
      </aside>

      {/* Main viewer */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {selected ? (
          <Viewer key={selected.id} diagram={selected} />
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-slate-500">
            {error ?? "Loading…"}
          </div>
        )}
        {error && selected && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 rounded-md bg-red-500/15 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30">
            {error}
          </div>
        )}
        {toast && (
          <div className="absolute right-5 bottom-5 rounded-md bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300 ring-1 ring-emerald-500/30">
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}

function Viewer({ diagram }: { diagram: Diagram }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const { scale } = view;
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const fit = useCallback(() => {
    const c = containerRef.current;
    const img = imgRef.current;
    if (!c || !img || !img.naturalWidth) return;
    const pad = 48;
    const s = clamp(
      Math.min((c.clientWidth - pad) / img.naturalWidth, (c.clientHeight - pad) / img.naturalHeight),
    );
    setView({
      scale: s,
      x: (c.clientWidth - img.naturalWidth * s) / 2,
      y: (c.clientHeight - img.naturalHeight * s) / 2,
    });
  }, []);

  // Zoom keeping the point (cx, cy) in container coordinates fixed.
  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const c = containerRef.current;
    if (!c) return;
    const px = cx ?? c.clientWidth / 2;
    const py = cy ?? c.clientHeight / 2;
    setView((v) => {
      const next = clamp(v.scale * factor);
      const ratio = next / v.scale;
      return { scale: next, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
    });
  }, []);

  const actualSize = () => {
    const c = containerRef.current;
    const img = imgRef.current;
    if (!c || !img) return;
    setView({
      scale: 1,
      x: (c.clientWidth - img.naturalWidth) / 2,
      y: (c.clientHeight - img.naturalHeight) / 2,
    });
  };

  // Wheel zoom (non-passive so we can preventDefault).
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "+" || e.key === "=") zoomAt(1.2);
      else if (e.key === "-") zoomAt(1 / 1.2);
      else if (e.key === "0") fit();
      else if (e.key === "1") actualSize();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomAt, fit]);

  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: view.x, py: view.y };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }));
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#0f1218]/80 px-5 backdrop-blur">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-white">{diagram.title}</h2>
          <p className="truncate text-[11px] text-slate-500">{diagram.file}</p>
        </div>
        <a
          href={diagram.src}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.05]"
        >
          Open original
        </a>
      </header>

      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          const rect = containerRef.current!.getBoundingClientRect();
          zoomAt(2, e.clientX - rect.left, e.clientY - rect.top);
        }}
        className={`relative flex-1 touch-none overflow-hidden select-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={diagram.src}
          alt={diagram.title}
          draggable={false}
          onLoad={fit}
          className="absolute top-0 left-0 max-w-none origin-top-left rounded-sm bg-white shadow-2xl shadow-black/50"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${scale})` }}
        />
      </div>

      {/* Zoom toolbar */}
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-white/[0.08] bg-[#151922]/95 p-1 shadow-xl shadow-black/40 backdrop-blur">
        <ToolButton title="Zoom out (-)" onClick={() => zoomAt(1 / 1.2)}>
          <path d="M5 12h14" />
        </ToolButton>
        <button
          onClick={actualSize}
          title="Actual size (1)"
          className="w-16 rounded-md py-1.5 text-center text-xs font-medium tabular-nums text-slate-200 hover:bg-white/[0.06]"
        >
          {Math.round(scale * 100)}%
        </button>
        <ToolButton title="Zoom in (+)" onClick={() => zoomAt(1.2)}>
          <path d="M12 5v14M5 12h14" />
        </ToolButton>
        <div className="mx-1 h-5 w-px bg-white/[0.08]" />
        <ToolButton title="Fit to screen (0)" onClick={fit}>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </ToolButton>
      </div>
    </>
  );
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-indigo-500/30 px-0.5 text-white">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function ToolButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {children}
      </svg>
    </button>
  );
}
