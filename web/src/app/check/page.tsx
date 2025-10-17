'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import BiasHeatmap from '../components/BiasHeatmap'; // keep this path if your components folder is at src/app/components

// Sentence shape returned by /score-text (ML + heuristic)
type Sentence = {
  text: string;
  final_prob?: number | null;
  bias_prob?: number | null;   // compatible with older API variants
  ml_prob?: number | null;
  heur_prob?: number | null;
};

// API response shape from /score-text
type Scored = {
  url?: string | null;
  source?: string | null;
  title?: string | null;
  published?: string | null;
  body: string;

  // overall scores
  fake_prob: number;           // we treat this as the overall score coming back
  final_prob?: number | null;  // if present, prefer this
  ml_prob?: number | null;
  heur_prob?: number | null;

  flags: string[];
  word_count: number;
  sentences?: Sentence[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

function scoreTone(prob: number) {
  if (prob < 0.3) {
    return 'bg-green-500/20 text-green-300 border-green-400/30';
  }
  if (prob < 0.6) {
    return 'bg-amber-500/20 text-amber-300 border-amber-400/30';
  }
  return 'bg-rose-500/20 text-rose-300 border-rose-400/30';
}

export default function CheckPage() {
  // inputs
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');

  // result state
  const [result, setResult] = useState<Scored | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const textTooShort = useMemo(() => (text.trim().length < 120), [text]);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/score-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, title: title || undefined, author: author || undefined }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Scored;
      setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to analyze text';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setTitle('');
    setAuthor('');
    setText('');
    setResult(null);
    setError(null);
  }

  // Prefer ML-blended final probability if present; fallback to fake_prob
  const displayProb = result?.final_prob ?? result?.fake_prob ?? 0;

  return (
    <main className="relative min-h-dvh text-white selection:bg-white/20">
      {/* gradient base */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(55% 55% at 50% 20%, rgba(21,25,42,1) 10%, rgba(12,18,34,1) 42%, rgba(10,12,18,1) 75%), linear-gradient(180deg, rgba(12,18,34,1) 0%, rgba(12,18,34,1) 100%)',
        }}
      />
      {/* ripple 1 */}
      <div
        className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[155vmax] h-[155vmax] rounded-full blur-2xl opacity-55 animate-ripple"
        style={{
          background:
            'radial-gradient(closest-side, rgba(20, 69, 185, 0.35), rgba(134, 0, 0, 0.14) 46%, transparent 72%)',
        }}
      />
      {/* ripple 2 */}
      <div
        className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-[170vmax] h-[170vmax] rounded-full blur-2xl opacity-45 animate-ripple-slow"
        style={{
          background:
            'radial-gradient(closest-side, rgba(0, 73, 175, 0.28), rgba(134, 0, 0, 0.14) 50%, transparent 75%)',
        }}
      />

      {/* page content */}
      <div className="relative mx-auto max-w-5xl px-4 py-10">
        {/* top nav */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 border border-white/10 bg-white/5 text-white/90 transition-transform hover:scale-105 active:scale-95"
          >
            ← Back to Feed
          </Link>
        </div>

        <header className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Analyze Text
          </h1>
          <p className="mt-2 text-white/70">
            Paste the article’s text (120+ characters). We’ll run ML signals and show a per-sentence heatmap.
          </p>
        </header>

        {/* controls (centered column) */}
        <div className="mx-auto max-w-3xl">
          <div className="grid gap-3">
            <input
              type="text"
              placeholder="(optional) Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/50 focus:outline-none"
            />
            <input
              type="text"
              placeholder="(optional) Author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/50 focus:outline-none"
            />
            <textarea
              placeholder="Paste article text here…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/50 focus:outline-none"
            />
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleAnalyze}
                disabled={textTooShort || loading}
                className="rounded-lg px-4 py-3 border border-white/10 bg-white/5 text-white/90 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
                title={textTooShort ? 'Enter at least ~120 characters' : 'Analyze'}
              >
                {loading ? 'Analyzing…' : 'Analyze Text'}
              </button>
              <button
                onClick={handleReset}
                className="rounded-lg px-4 py-3 border border-white/10 bg-white/5 text-white/90 transition-transform hover:scale-105 active:scale-95"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* result / error */}
        <div className="mt-8 mx-auto max-w-3xl">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0.01)_100%)] p-4 md:p-5 mt-2">
              {/* header with score on the top-right */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold line-clamp-2">
                    {result.title || '(no title)'}
                  </h3>
                  <div className="mt-1 text-sm text-white/70">
                    {result.source || (author ? `by ${author}` : '—')}
                  </div>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${scoreTone(
                    displayProb
                  )}`}
                  title="Bias score (ML-weighted)"
                >
                  <span className="opacity-80">score</span>
                  <strong className="tracking-tight">{displayProb.toFixed(3)}</strong>
                </span>
              </div>

              {/* tiny metrics row (final/ml/heur if present) */}
              {(result.final_prob ?? result.ml_prob ?? result.heur_prob) !== undefined && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/80">
                  {result.final_prob != null && (
                    <span className="rounded border border-white/10 bg-white/5 px-2 py-1">
                      final: <b>{result.final_prob.toFixed(3)}</b>
                    </span>
                  )}
                  {result.ml_prob != null && (
                    <span className="rounded border border-white/10 bg-white/5 px-2 py-1">
                      ml: <b>{result.ml_prob.toFixed(3)}</b>
                    </span>
                  )}
                  {typeof result.heur_prob === 'number' && (
                    <span className="rounded border border-white/10 bg-white/5 px-2 py-1">
                      heur: <b>{result.heur_prob.toFixed(3)}</b>
                    </span>
                  )}
                  <span className="rounded border border-white/10 bg-white/5 px-2 py-1">
                    words: <b>{result.word_count}</b>
                  </span>
                </div>
              )}

              {/* sentence heatmap */}
              {result.sentences?.length ? (
                <BiasHeatmap sentences={result.sentences} />
              ) : (
                <div className="mt-4 text-sm text-white/70">No sentence-level annotations returned.</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ripple keyframes */}
      <style jsx global>{`
        :root {
          --brand: rgb(66, 96, 136);
          --brand-foreground: #0b1220;
          --muted-foreground: rgba(51, 0, 162, 0.78);
        }
        @keyframes ripple {
          0% {
            transform: translate(-50%, -50%) scale(1.12);
            opacity: 0.6;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 0.75;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.12);
            opacity: 0.6;
          }
        }
        @keyframes ripple-slow {
          0% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 0.65;
          }
          50% {
            transform: translate(-50%, -50%) scale(2);
            opacity: 0.85;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 0.65;
          }
        }
        .animate-ripple {
          animation: ripple 5s ease-in-out infinite;
          will-change: transform, opacity;
        }
        .animate-ripple-slow {
          animation: ripple-slow 10s ease-in-out infinite;
          will-change: transform, opacity;
        }
      `}</style>
    </main>
  );
}
