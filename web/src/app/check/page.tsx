'use client';

import Link from 'next/link';
import { useState } from 'react';
import BiasHeatmap from '../components/BiasHeatmap';

type Sentence = {
  text: string;
  final_prob?: number | null;
  bias_prob?: number | null;
  ml_prob?: number | null;
  heur_prob?: number | null;
};

type Article = {
  url: string;
  source: string;
  title: string;
  author?: string | null;
  published?: string | null;
  body: string;
  fake_prob: number;
  heur_prob?: number | null;
  ml_prob?: number | null;
  final_prob?: number | null;
  flags: string[];
  word_count: number;
  sentences?: Sentence[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

function scoreTone(prob: number) {
  if (prob < 0.3) return 'bg-green-500/20 text-green-300 border-green-400/30';
  if (prob < 0.6) return 'bg-amber-500/20 text-amber-300 border-amber-400/30';
  return 'bg-rose-500/20 text-rose-300 border-rose-400/30';
}

export default function CheckPage() {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState<Article | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const payload: Record<string, unknown> = { text };
      if (title.trim()) payload.title = title.trim();
      if (author.trim()) payload.author = author.trim();

      const res = await fetch(`${API_BASE}/score-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Article;
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

  const displayProb = result?.final_prob ?? result?.fake_prob ?? 0;

  return (
    <main className="relative min-h-dvh text-white selection:bg-white/20">
      {/* background */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(55% 55% at 50% 20%, rgba(21,25,42,1) 10%, rgba(12,18,34,1) 42%, rgba(10,12,18,1) 75%), linear-gradient(180deg, rgba(12,18,34,1) 0%, rgba(12,18,34,1) 100%)',
        }}
      />
      <div
        className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[155vmax] h-[155vmax] rounded-full blur-2xl opacity-55 animate-ripple"
        style={{
          background:
            'radial-gradient(closest-side, rgba(20, 69, 185, 0.35), rgba(134, 0, 0, 0.14) 46%, transparent 72%)',
        }}
      />
      <div
        className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-[170vmax] h-[170vmax] rounded-full blur-2xl opacity-45 animate-ripple-slow"
        style={{
          background:
            'radial-gradient(closest-side, rgba(0, 73, 175, 0.28), rgba(134, 0, 0, 0.14) 50%, transparent 75%)',
        }}
      />

      <div className="relative mx-auto max-w-3xl px-4 py-10">
        {/* nav */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 border border-white/10 bg-white/5 text-white/90 transition-transform hover:scale-105 active:scale-95"
          >
            ← Back to Feed
          </Link>
        </div>

        <header className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Analyze Text</h1>
          <p className="mt-2 text-white/70">
            Paste the text below (120+ characters). Optionally include title and author — it may help the model.
          </p>
        </header>

        {/* Title & Author side-by-side */}
        <div className="mx-auto w-full">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Title (optional)"
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/50 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Author (optional)"
              value={author}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAuthor(e.target.value)}
              className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/50 focus:outline-none"
            />
          </div>

          {/* Textarea */}
          <div className="mt-3">
            <textarea
              placeholder="Paste article text (at least ~120 characters)…"
              value={text}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
              rows={12}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/50 focus:outline-none"
            />
          </div>

          {/* Buttons centered */}
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={handleAnalyze}
              disabled={!text.trim() || loading}
              className="rounded-lg px-4 py-3 border border-white/10 bg-white/5 text-white/90 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
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

        {/* Output */}
        <div className="mt-6">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0.01)_100%)] p-4 md:p-5 mt-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold line-clamp-2">
                    {result.title || title || '(no title)'}
                  </h3>
                  <div className="mt-1 text-sm text-white/70">
                    {result.author || author || result.source || '—'}
                  </div>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${scoreTone(
                    displayProb
                  )}`}
                  title="Bias score"
                >
                  <span className="opacity-80">score</span>
                  <strong className="tracking-tight">{displayProb.toFixed(3)}</strong>
                </span>
              </div>

              <div className="mt-3 text-sm text-white/80 whitespace-pre-wrap">{result.body || text}</div>

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
                </div>
              )}

              {result.sentences?.length ? <BiasHeatmap sentences={result.sentences} /> : null}
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
