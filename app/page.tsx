"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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

const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;

export default function Home() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLElement>(null);
  const online = useOnline();
  useServiceWorker();

  const applyManifest = useCallback((data: Manifest) => {
    setManifest(data);
    setError(null);
    precacheDiagrams(data.diagrams.map((d) => d.src));
    setSelectedId((cur) =>
      cur && data.diagrams.some((d) => d.id === cur) ? cur : (data.diagrams[0]?.id ?? null),
    );
  }, []);

  const loadManifest = useCallback(async () => {
    try {
      const res = await fetch(`/diagrams/diagrams.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("diagrams.json not found. Tap Sync to generate it.");
      applyManifest(await res.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [applyManifest]);

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
      applyManifest(data);
      setToast(`Synced ${data.count} diagram${data.count === 1 ? "" : "s"}`);
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  // Deferred query keeps typing responsive; the list catches up a frame later.
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;
  const terms = useMemo(
    () => deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [deferredQuery],
  );

  const filtered = useMemo(() => {
    const list = manifest?.diagrams ?? [];
    if (!terms.length) return list;
    return list.filter((d) => {
      const hay = `${d.title} ${d.file}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [manifest, terms]);

  const active = Math.min(activeIndex, Math.max(filtered.length - 1, 0));

  // Keep the keyboard-highlighted result in view.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const focusSearch = useCallback(() => {
    if (!isDesktop()) setDrawerOpen(true);
    requestAnimationFrame(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    });
  }, []);

  // Ctrl/Cmd+K or "/" focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement).tagName === "INPUT";
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !inInput)) {
        e.preventDefault();
        focusSearch();
      } else if (e.key === "Escape" && !inInput) {
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusSearch]);

  const choose = (id: string) => {
    setSelectedId(id);
    if (!isDesktop()) {
      searchRef.current?.blur();
      setDrawerOpen(false);
    }
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(Math.min(active + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(Math.max(active - 1, 0));
    } else if (e.key === "Enter") {
      const d = filtered[active];
      if (d) choose(d.id);
    } else if (e.key === "Escape") {
      if (query) setQuery("");
      else {
        searchRef.current?.blur();
        setDrawerOpen(false);
      }
    }
  };

  const selected = manifest?.diagrams.find((d) => d.id === selectedId) ?? null;
  const searching = terms.length > 0;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#0b0d12] text-slate-200">
      {/* Mobile backdrop */}
      <div
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 md:hidden ${
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Sidebar / drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[86vw] max-w-80 flex-col border-r border-white/[0.06] bg-[#0f1218] pt-[env(safe-area-inset-top)] shadow-2xl shadow-black/60 transition-transform duration-300 ease-out md:static md:z-auto md:w-72 md:translate-x-0 md:shadow-none ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
          <div className="min-w-0">
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
          <div className="ml-auto flex items-center gap-1.5">
            <InstallButton />
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/[0.06] hover:text-white md:hidden"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-2 px-4 pb-3">
          <button
            onClick={sync}
            disabled={syncing || !online}
            title={online ? "Rescan public/diagrams" : "Sync needs a connection"}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-60 md:py-2"
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
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onSearchKey}
              placeholder="Search diagrams…"
              className="w-full appearance-none rounded-md border border-white/[0.08] bg-white/[0.03] py-2.5 pr-14 pl-8 text-base transition-colors placeholder:text-slate-500 focus:border-indigo-500/60 focus:bg-white/[0.05] focus:outline-none md:py-2 md:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                aria-label="Clear search"
                title="Clear (Esc)"
                className="absolute top-1/2 right-1.5 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-white/[0.08] hover:text-white"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            ) : (
              <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-white/[0.1] px-1.5 py-0.5 font-mono text-[10px] text-slate-500 md:block">
                Ctrl K
              </kbd>
            )}
          </div>
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-200 ${
              searching ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <p className="overflow-hidden px-1 text-[11px] text-slate-500">
              {filtered.length} of {manifest?.count ?? 0} results
              <span className="hidden md:inline"> · ↑↓ to navigate, Enter to open</span>
            </p>
          </div>
        </div>

        <nav
          ref={listRef}
          className={`flex-1 overflow-y-auto overscroll-contain px-2 pb-4 transition-opacity duration-150 ${
            isStale ? "opacity-60" : "opacity-100"
          }`}
        >
          {filtered.map((d, i) => (
            <button
              key={d.id}
              data-index={i}
              onClick={() => choose(d.id)}
              onMouseEnter={() => searching && setActiveIndex(i)}
              style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
              className={`animate-fade-in-up mb-1 flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors duration-150 md:py-2 ${
                d.id === selectedId
                  ? "bg-indigo-500/15 text-white ring-1 ring-indigo-500/30"
                  : searching && i === active
                    ? "bg-white/[0.06] text-white"
                    : "text-slate-300 hover:bg-white/[0.04] active:bg-white/[0.06]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={d.src}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-11 w-16 shrink-0 rounded border border-white/[0.06] bg-white object-cover md:h-10 md:w-14"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium md:text-[13px]">
                  <Highlight text={d.title} terms={terms} />
                </div>
                <div className="text-[11px] text-slate-500">{formatSize(d.size)}</div>
              </div>
            </button>
          ))}
          {manifest && filtered.length === 0 && (
            <div className="animate-fade-in-up px-3 py-10 text-center">
              <p className="text-sm text-slate-400">No matches</p>
              <p className="mt-1 text-xs text-slate-500">
                Nothing found for &ldquo;{deferredQuery.trim()}&rdquo;
              </p>
            </div>
          )}
        </nav>

        {manifest && (
          <div className="border-t border-white/[0.06] px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[11px] text-slate-500">
            Last sync: {new Date(manifest.generatedAt).toLocaleString()}
          </div>
        )}
      </aside>

      {/* Main viewer */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {selected ? (
          <Viewer key={selected.id} diagram={selected} onMenu={() => setDrawerOpen(true)} onSearch={focusSearch} />
        ) : (
          <>
            <TopBar onMenu={() => setDrawerOpen(true)} onSearch={focusSearch} />
            <div className="grid flex-1 place-items-center px-6 text-center text-sm text-slate-500">
              {error ?? "Loading…"}
            </div>
          </>
        )}
        {error && selected && (
          <div className="absolute top-[calc(4rem+env(safe-area-inset-top))] left-1/2 w-max max-w-[90%] -translate-x-1/2 rounded-md bg-red-500/15 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30">
            {error}
          </div>
        )}
        {toast && (
          <div className="animate-fade-in-up absolute top-[calc(4rem+env(safe-area-inset-top))] right-4 rounded-md bg-emerald-500/15 px-3 py-2 text-xs text-emerald-300 ring-1 ring-emerald-500/30 md:top-auto md:right-5 md:bottom-5">
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}

function TopBar({
  onMenu,
  onSearch,
  children,
}: {
  onMenu: () => void;
  onSearch: () => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#0f1218]/80 px-3 pt-[env(safe-area-inset-top)] backdrop-blur md:px-5">
      <div className="flex h-14 min-w-0 flex-1 items-center gap-2">
        <IconButton label="Open menu" onClick={onMenu} className="md:hidden">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </IconButton>
        {children}
        <IconButton label="Search" onClick={onSearch} className="ml-auto md:hidden">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </IconButton>
      </div>
    </header>
  );
}

type Pt = { x: number; y: number };

function Viewer({
  diagram,
  onMenu,
  onSearch,
}: {
  diagram: Diagram;
  onMenu: () => void;
  onSearch: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const [animate, setAnimate] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Gesture state.
  const pointers = useRef(new Map<number, Pt>());
  const drag = useRef<{ start: Pt; origin: Pt } | null>(null);
  const pinch = useRef<{ dist: number; mid: Pt; view: typeof view } | null>(null);
  const lastTap = useRef<{ t: number; p: Pt } | null>(null);
  const moved = useRef(false);

  const commit = useCallback((v: typeof view, animated: boolean) => {
    viewRef.current = v;
    setAnimate(animated);
    setView(v);
  }, []);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const fit = useCallback(
    (animated = true) => {
      const c = containerRef.current;
      const img = imgRef.current;
      if (!c || !img || !img.naturalWidth) return;
      const pad = c.clientWidth < 640 ? 16 : 48;
      const s = clamp(
        Math.min((c.clientWidth - pad) / img.naturalWidth, (c.clientHeight - pad) / img.naturalHeight),
      );
      commit(
        {
          scale: s,
          x: (c.clientWidth - img.naturalWidth * s) / 2,
          y: (c.clientHeight - img.naturalHeight * s) / 2,
        },
        animated,
      );
    },
    [commit],
  );

  // Zoom keeping point p (container coords) fixed.
  const zoomAt = useCallback(
    (factor: number, p?: Pt, animated = true) => {
      const c = containerRef.current;
      if (!c) return;
      const px = p?.x ?? c.clientWidth / 2;
      const py = p?.y ?? c.clientHeight / 2;
      const v = viewRef.current;
      const next = clamp(v.scale * factor);
      const ratio = next / v.scale;
      commit({ scale: next, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio }, animated);
    },
    [commit],
  );

  const actualSize = useCallback(() => {
    const c = containerRef.current;
    const img = imgRef.current;
    if (!c || !img) return;
    commit(
      { scale: 1, x: (c.clientWidth - img.naturalWidth) / 2, y: (c.clientHeight - img.naturalHeight) / 2 },
      true,
    );
  }, [commit]);

  // Wheel / trackpad zoom.
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - rect.left, y: e.clientY - rect.top }, false);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || e.ctrlKey || e.metaKey) return;
      if (e.key === "+" || e.key === "=") zoomAt(1.25);
      else if (e.key === "-") zoomAt(1 / 1.25);
      else if (e.key === "0") fit();
      else if (e.key === "1") actualSize();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomAt, fit, actualSize]);

  // Refit when the viewport changes size (rotation, window resize).
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => fit(false));
    ro.observe(c);
    return () => ro.disconnect();
  }, [fit]);

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    pinch.current = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      view: viewRef.current,
    };
    drag.current = null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      moved.current = false;
      drag.current = { start: p, origin: { x: viewRef.current.x, y: viewRef.current.y } };
      setDragging(true);
    } else if (pointers.current.size === 2) {
      moved.current = true;
      startPinch();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s0 = pinch.current.view;
      const scale = clamp(s0.scale * (dist / pinch.current.dist));
      // Keep the content point under the initial midpoint under the current midpoint.
      const cx = (pinch.current.mid.x - s0.x) / s0.scale;
      const cy = (pinch.current.mid.y - s0.y) / s0.scale;
      commit({ scale, x: mid.x - cx * scale, y: mid.y - cy * scale }, false);
      return;
    }

    const d = drag.current;
    if (!d) return;
    if (Math.hypot(p.x - d.start.x, p.y - d.start.y) > 6) moved.current = true;
    commit(
      { ...viewRef.current, x: d.origin.x + p.x - d.start.x, y: d.origin.y + p.y - d.start.y },
      false,
    );
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = local(e);
    pointers.current.delete(e.pointerId);

    if (pointers.current.size === 1) {
      // Pinch ended with one finger still down: continue as a drag.
      pinch.current = null;
      const [rest] = [...pointers.current.values()];
      drag.current = { start: rest, origin: { x: viewRef.current.x, y: viewRef.current.y } };
      return;
    }
    if (pointers.current.size === 0) {
      pinch.current = null;
      drag.current = null;
      setDragging(false);

      // Double-tap / double-click to zoom in.
      if (!moved.current && e.type === "pointerup") {
        const now = performance.now();
        const lt = lastTap.current;
        if (lt && now - lt.t < 300 && Math.hypot(p.x - lt.p.x, p.y - lt.p.y) < 30) {
          zoomAt(2, p);
          lastTap.current = null;
        } else {
          lastTap.current = { t: now, p };
        }
      }
    }
  };

  return (
    <>
      <TopBar onMenu={onMenu} onSearch={onSearch}>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-white">{diagram.title}</h2>
          <p className="hidden truncate text-[11px] text-slate-500 sm:block">{diagram.file}</p>
        </div>
        <a
          href={diagram.src}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open original"
          title="Open original"
          className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.05] md:flex"
        >
          Open original
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
          </svg>
        </a>
      </TopBar>

      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative flex-1 touch-none overflow-hidden select-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        {!loaded && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-indigo-400" />
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={diagram.src}
          alt={diagram.title}
          draggable={false}
          onLoad={() => {
            fit(false);
            setLoaded(true);
          }}
          className={`absolute top-0 left-0 max-w-none origin-top-left rounded-sm bg-white shadow-2xl shadow-black/50 will-change-transform ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          style={{
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            transition: animate
              ? "transform 220ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms"
              : "opacity 200ms",
          }}
        />
      </div>

      {/* Zoom toolbar */}
      <div className="absolute bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-white/[0.08] bg-[#151922]/95 p-1 shadow-xl shadow-black/40 backdrop-blur md:gap-1 md:rounded-lg">
        <ToolButton title="Zoom out (-)" onClick={() => zoomAt(1 / 1.25)}>
          <path d="M5 12h14" />
        </ToolButton>
        <button
          onClick={actualSize}
          title="Actual size (1)"
          className="h-10 w-16 rounded-md text-center text-xs font-medium tabular-nums text-slate-200 hover:bg-white/[0.06] active:bg-white/[0.1] md:h-8"
        >
          {Math.round(view.scale * 100)}%
        </button>
        <ToolButton title="Zoom in (+)" onClick={() => zoomAt(1.25)}>
          <path d="M12 5v14M5 12h14" />
        </ToolButton>
        <div className="mx-1 h-5 w-px bg-white/[0.08]" />
        <ToolButton title="Fit to screen (0)" onClick={() => fit()}>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </ToolButton>
        <a
          href={diagram.src}
          target="_blank"
          rel="noopener noreferrer"
          title="Open original"
          className="grid h-10 w-10 place-items-center rounded-md text-slate-300 hover:bg-white/[0.06] active:bg-white/[0.1] md:hidden"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
          </svg>
        </a>
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

function IconButton({
  label,
  onClick,
  className = "",
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-md text-slate-300 transition hover:bg-white/[0.06] hover:text-white active:bg-white/[0.1] ${className}`}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {children}
      </svg>
    </button>
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
      aria-label={title}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-md text-slate-300 transition hover:bg-white/[0.06] hover:text-white active:bg-white/[0.1] md:h-8 md:w-8"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {children}
      </svg>
    </button>
  );
}
