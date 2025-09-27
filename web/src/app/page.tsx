"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Article = {
  url: string;
  source: string;
  title: string;
  published: string;
  body: string;
  fake_prob: number;
  flags: string[];
  word_count: number;
};

type ApiResponse = {
  items: Article[];
  total: number;
  page: number;
  page_size: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

function classNames(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || "—";
  }
}

function scoreColor(p: number) {
  if (p >= 0.75) return "bg-red-600/10 text-red-700";
  if (p >= 0.5) return "bg-orange-500/10 text-orange-600";
  if (p >= 0.25) return "bg-yellow-500/10 text-yellow-700";
  return "bg-green-500/10 text-green-700";
}

export default function Home() {

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sortBy, setSortBy] = useState<"fake_prob" | "published" | "title">(
    "fake_prob"
  );
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [minProb, setMinProb] = useState<string>("");
  const [maxProb, setMaxProb] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);


  const [items, setItems] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);


  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    params.set("sort_by", sortBy);
    params.set("order", order);
    if (debouncedQ) params.set("q", debouncedQ);
    const min = Number(minProb);
    const max = Number(maxProb);
    if (!Number.isNaN(min) && minProb !== "") params.set("min_prob", String(min));
    if (!Number.isNaN(max) && maxProb !== "") params.set("max_prob", String(max));
    return params.toString();
  }, [page, pageSize, sortBy, order, debouncedQ, minProb, maxProb]);

  
  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`${API_BASE}/articles?${queryString}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const detail = await res.text();
          throw new Error(`API ${res.status}: ${detail}`);
        }
        const data: ApiResponse = await res.json();
        if (!cancelled) {
          setItems(data.items);
          setTotal(data.total);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e.message ?? "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [queryString]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(total, page * pageSize);

  function resetFilters() {
    setQ("");
    setDebouncedQ("");
    setMinProb("");
    setMaxProb("");
    setSortBy("fake_prob");
    setOrder("desc");
    setPage(1);
    setPageSize(10);
  }

  return (
    <div className="min-h-dvh bg-white text-gray-900">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-xl bg-[--brand]"></div>
            <h1 className="text-xl font-semibold">News Credibility Feed</h1>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/check"
              className="px-3 py-2 rounded-[--radius-xl] bg-[--brand] text-[--brand-foreground] hover:opacity-90 transition"
            >
              Check a URL
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="block text-sm font-medium mb-1">Search</label>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search title/body…"
              className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2 focus:ring-[--brand]"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Sort by</label>
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setPage(1);
              }}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="fake_prob">Score</option>
              <option value="published">Published</option>
              <option value="title">Title</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Order</label>
            <select
              value={order}
              onChange={(e) => {
                setOrder(e.target.value as any);
                setPage(1);
              }}
              className="w-full rounded-lg border px-3 py-2"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Min score</label>
            <input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={minProb}
              onChange={(e) => {
                setMinProb(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. 0.25"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Max score</label>
            <input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={maxProb}
              onChange={(e) => {
                setMaxProb(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. 0.75"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Page size</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="w-full rounded-lg border px-3 py-2"
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <button
              onClick={resetFilters}
              className="w-full mt-6 md:mt-0 px-3 py-2 rounded-[--radius-xl] border hover:bg-gray-50"
            >
              Reset
            </button>
          </div>
        </div>

        
        <div className="mt-4 text-sm text-gray-600 flex items-center justify-between">
          <div>
            {loading ? "Loading…" : `Showing ${showingFrom}–${showingTo} of ${total}`}
          </div>
          {err && <div className="text-red-600">{err}</div>}
        </div>

        
        <div className="mt-4 grid grid-cols-1 gap-4">
          {items.map((a) => (
            <article
              key={a.url}
              className="rounded-2xl border p-4 hover:shadow-sm transition"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-lg font-semibold leading-snug">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {a.title || new URL(a.url).hostname}
                  </a>
                </h2>

                <span
                  title={`score = ${(a.fake_prob * 100).toFixed(0)}%`}
                  className={classNames(
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
                    scoreColor(a.fake_prob)
                  )}
                >
                  {(a.fake_prob * 100).toFixed(0)}%
                </span>
              </div>

              <div className="mt-1 text-xs text-gray-500">
                <span className="uppercase tracking-wide">{a.source || "—"}</span>
                <span className="mx-2">•</span>
                <span>{formatDate(a.published)}</span>
                <span className="mx-2">•</span>
                <span>{a.word_count} words</span>
              </div>

              <p className="mt-3 text-sm line-clamp-3">{a.body}</p>

              {a.flags?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.flags.map((f, i) => (
                    <span
                      key={i}
                      className="text-xs rounded-full bg-gray-100 px-2 py-1"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}

          {!loading && items.length === 0 && (
            <div className="rounded-xl border p-8 text-center text-sm text-gray-500">
              No results. Try clearing filters or changing the search.
            </div>
          )}
        </div>

        
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="px-3 py-2 rounded-lg border disabled:opacity-50"
          >
            ← Prev
          </button>
          <div className="text-sm tabular-nums">
            Page {page} / {totalPages}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="px-3 py-2 rounded-lg border disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </main>
    </div>
  );
}
