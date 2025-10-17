'use client';

import { useEffect, useMemo, useState } from 'react';

type Article = {
  url: string;
  source: string;
  title: string;
  published: string;
  body: string;
  fake_prob: number;
  flags: string[];
  word_count: number;
  // optional ML-enriched fields (present if you've run batch_infer)
  ml_prob?: number | null;
  final_prob?: number | null;
};

type ArticlesResponse = {
  items: Article[];
  total: number;
  page: number;
  page_size: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

export default function Home() {
  // query & filters
  const [query, setQuery] = useState('');
  const [minProb, setMinProb] = useState<number | null>(null);
  const [maxProb, setMaxProb] = useState<number | null>(null);

  // sorting / pagination
  const [sortBy, setSortBy] = useState<'fake_prob' | 'published' | 'title'>('fake_prob');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  // data
  const [items, setItems] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const buildUrl = () => {
    const u = new URL(`${API_BASE}/articles`);
    u.searchParams.set('page', String(page));
    u.searchParams.set('page_size', String(pageSize));
    u.searchParams.set('sort_by', sortBy);
    u.searchParams.set('order', order);
    if (query.trim()) u.searchParams.set('q', query.trim());
    if (minProb !== null) u.searchParams.set('min_prob', String(minProb));
    if (maxProb !== null) u.searchParams.set('max_prob', String(maxProb));
    return u.toString();
  };

  const fetchArticles = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(buildUrl());
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data: ArticlesResponse = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load';
      setErr(msg);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  // Fetch on sort/pagination change
  useEffect(() => {
    fetchArticles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sortBy, order]);

  // Live update on query/min/max (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      fetchArticles();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, minProb, maxProb]);

  const handleReset = () => {
    setQuery('');
    setMinProb(null);
    setMaxProb(null);
    setSortBy('fake_prob');
    setOrder('desc');
    setPageSize(20);
    setPage(1);
    fetchArticles();
  };

  return (
    <main className="relative min-h-screen text-white overflow-x-hidden">
      {/* dark gradient base */}
      <div className="absolute inset-0 -z-20 bg-gradient-to-b from-[#0b0f19] via-[#0a0a12] to-[#0b0f19]" />

      {/* smoother ripples */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* base glow */}
        <div
          className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[140vmax] h-[140vmax] rounded-full blur-3xl opacity-45 will-change-transform"
          style={{
            background:
              'radial-gradient(closest-side, rgba(90,130,255,0.22), rgba(90,130,255,0.10) 42%, rgba(90,130,255,0.0) 70%)',
            transform: 'translate3d(-50%,-50%,0) scale(1)',
          }}
        />
        {/* ripple 1 */}
        <div
          className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[155vmax] h-[155vmax] rounded-full blur-2xl opacity-55 animate-ripple will-change-transform"
          style={{
            background:
              'radial-gradient(closest-side, rgba(20,69,185,0.35) 0%, rgba(56,0,151,0.14) 46%, rgba(134,0,0,0.0) 72%)',
            transform: 'translate3d(-50%,-50%,0)',
          }}
        />
        {/* ripple 2 */}
        <div
          className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-[170vmax] h-[170vmax] rounded-full blur-2xl opacity-45 animate-ripple-slow will-change-transform"
          style={{
            background:
              'radial-gradient(closest-side, rgba(0,73,175,0.28) 0%, rgba(56,0,151,0.14) 50%, rgba(134,0,0,0.0) 75%)',
            transform: 'translate3d(-50%,-50%,0)',
          }}
        />
      </div>

      {/* top nav */}
      <div className="sticky top-0 z-20 bg-black/30 backdrop-blur border-b border-white/10">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center">
          <div className="font-semibold tracking-tight">Bias Detector</div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12 grid gap-8">
        {/* HERO / CONTROLS BOX */}
        <section className="relative rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur p-6 md:p-8 shadow-lg">
          <div className="mx-auto max-w-3xl">
            <div className="flex flex-col items-center text-center">
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Find bias in text using Machine Learning
              </h1>
              <p className="mt-2 text-sm md:text-base text-[--muted-foreground]">
                Scores text based on bias signals and cues.  Use this as a tool, not to determine surefire truth.
              </p>
            </div>
          </div>

          {/* search row */}
          <div className="mx-auto mt-6 w-full max-w-2xl flex items-center justify-center gap-2">
            <input
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              placeholder="Search headlines or text…"
              className="flex-1 min-w-0 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/55 focus:outline-none focus:ring-2 focus:ring-[--brand]"
            />
          </div>

          {/* reset + filters */}
          <div className="mx-auto mt-4 w-full max-w-2xl flex items-center justify-center gap-3 flex-wrap md:flex-nowrap">
            <button
              onClick={handleReset}
              className="rounded-lg px-3 py-2 border border-white/10 text-white/90 hover:bg-white/5 transition-transform hover:scale-105 active:scale-95 shrink-0"
            >
              Reset
            </button>

            <div className="flex items-center gap-2 shrink-0">
              <label className="text-white/70 text-sm">Min score</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={minProb ?? ''}
                placeholder="e.g., 0.20"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMinProb(e.target.value === '' ? null : Number(e.target.value))
                }
                className="w-36 md:w-40 rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/50 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label className="text-white/70 text-sm">Max score</label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={maxProb ?? ''}
                placeholder="e.g., 0.80"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMaxProb(e.target.value === '' ? null : Number(e.target.value))
                }
                className="w-36 md:w-40 rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/50 focus:outline-none"
              />
            </div>
          </div>
        </section>

        {/* RESULTS */}
        <section className="grid gap-4">
          {/* status row */}
          <div className="flex items-center justify-between text-sm text-white/80">
            <div>{loading ? 'Loading…' : err ? `Error: ${err}` : `Showing ${items.length} of ${total}`}</div>
            <div className="hidden md:flex items-center gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg px-2 py-1 border border-white/10 hover:bg-white/5 disabled:opacity-40 transition"
              >
                Prev
              </button>
              <span className="tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg px-2 py-1 border border-white/10 hover:bg-white/5 disabled:opacity-40 transition"
              >
                Next
              </button>
            </div>
          </div>

          {/* cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((a) => {
              const overall = a.final_prob ?? a.fake_prob; // prefer ML-blended if available
              const scoreClass =
                overall >= 0.6
                  ? 'bg-red-500/20 text-red-300'
                  : overall >= 0.35
                  ? 'bg-yellow-500/20 text-yellow-200'
                  : 'bg-emerald-500/20 text-emerald-200';

              return (
                <a
                  key={a.url}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.06] transition-all hover:scale-[1.01] active:scale-[0.99] shadow-sm"
                >
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-white/70">
                        {a.published ? new Date(a.published).toLocaleString() : '—'}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* ML badge if this card has ML scores */}
                        {typeof a.ml_prob === 'number' && (
                          <span
                            title="Includes ML score"
                            className="px-2 py-1 rounded-md text-[10px] font-semibold bg-indigo-500/20 text-indigo-200 border border-indigo-400/30"
                          >
                            ML
                          </span>
                        )}
                        <div
                          title={`score: ${overall.toFixed(3)}`}
                          className={`px-2 py-1 rounded-md text-xs font-semibold ${scoreClass}`}
                        >
                          {overall.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <h3 className="mt-2 text-lg font-semibold line-clamp-2">{a.title || '(no title)'}</h3>
                    <p className="mt-2 text-white/80 text-sm line-clamp-3">{a.body}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {a.flags?.slice(0, 3).map((f, i) => (
                        <span
                          key={i}
                          className="text-[10px] uppercase tracking-wide rounded bg-white/5 px-2 py-1 text-white/70"
                        >
                          {f}
                        </span>
                      ))}
                      <span className="ml-auto text-xs text-white/60">{a.source || '—'}</span>
                    </div>
                  </div>
                </a>
              );
            })}

            {!loading && !err && items.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6 text-center text-white/75">
                No results. Try clearing filters or searching a different term.
              </div>
            )}
          </div>

          {/* mobile pager */}
          <div className="md:hidden flex items-center justify-center gap-3">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/5 disabled:opacity-40 transition"
            >
              Prev
            </button>
            <span className="tabular-nums text-white/80">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg px-3 py-2 border border-white/10 hover:bg-white/5 disabled:opacity-40 transition"
            >
              Next
            </button>
          </div>
        </section>
      </div>

      {/* sticky sort/order/page-size controls (bottom-right) */}
      <aside className="fixed bottom-4 right-4 z-30">
        <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur p-3 shadow-xl flex flex-col gap-2 w-[230px]">
          <div className="text-xs font-semibold text-white/80">Display</div>

          <label className="text-xs text-white/70">Sort by</label>
          <select
            value={sortBy}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setSortBy(e.target.value as 'fake_prob' | 'published' | 'title')
            }
            className="rounded-md bg-white/5 border border-white/10 px-2 py-2 text-sm focus:outline-none"
          >
            <option value="fake_prob">Score</option>
            <option value="published">Date</option>
            <option value="title">Title</option>
          </select>

          <label className="text-xs text-white/70">Order</label>
          <select
            value={order}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setOrder(e.target.value as 'asc' | 'desc')
            }
            className="rounded-md bg-white/5 border border-white/10 px-2 py-2 text-sm focus:outline-none"
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>

          <label className="text-xs text-white/70">Page size</label>
          <select
            value={pageSize}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              const n = Number(e.target.value);
              setPageSize(n);
              setPage(1);
            }}
            className="rounded-md bg-white/5 border border-white/10 px-2 py-2 text-sm focus:outline-none"
          >
            {[10, 20, 30, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </aside>

      {/* smoother keyframes */}
      <style jsx global>{`
        :root {
          --brand: rgb(66, 96, 136);
          --brand-foreground: #0b1220;
          --muted-foreground: rgba(51, 0, 162, 0.78);
        }
        @keyframes ripple {
          0% {
            transform: translate(-50%, -50%) scale(1.18);
            opacity: 0.55;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.75);
            opacity: 0.72;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.18);
            opacity: 0.55;
          }
        }
        @keyframes ripple-slow {
          0% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 0.5;
          }
          50% {
            transform: translate(-50%, -50%) scale(2);
            opacity: 0.68;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 0.5;
          }
        }
        .animate-ripple {
          animation: ripple 5s cubic-bezier(0.25, 0.1, 0.25, 1) infinite;
        }
        .animate-ripple-slow {
          animation: ripple-slow 10s cubic-bezier(0.25, 0.1, 0.25, 1) infinite;
        }
      `}</style>
    </main>
  );
}
