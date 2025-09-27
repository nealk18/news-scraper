'use client';

import { useState } from 'react';

type ArticleOut = {
  url: string; source: string; title: string; published: string;
  body: string; fake_prob: number; flags: string[]; word_count: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

export default function CheckPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<ArticleOut | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setErr(null); setRes(null);
    try {
      const r = await fetch(`${API_BASE}/score-url`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!r.ok) { setErr(`${r.status} ${r.statusText}: ${await r.text()}`); return; }
      setRes(await r.json());
    } catch (e: any) { setErr(e?.message ?? String(e));
    } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-semibold mb-4">Check a URL</h1>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input className="border rounded px-3 py-2 flex-1" placeholder="https://example.com/article"
                 value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
                  disabled={loading || !url} type="submit">{loading ? 'Scoring…' : 'Score'}</button>
        </form>

        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

        {res && (
          <div className="mt-6 bg-white border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <a href={res.url} target="_blank" className="text-lg font-medium hover:underline">
                {res.title || '(no title)'}
              </a>
              <span className="text-sm font-mono bg-gray-100 rounded px-2 py-1">{res.fake_prob.toFixed(3)}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {res.source} • {res.published ? new Date(res.published).toLocaleString() : '—'}
            </p>
            <p className="mt-3 text-sm whitespace-pre-line">
              {res.body.slice(0, 800)}{res.body.length > 800 ? '…' : ''}
            </p>
            {res.flags?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {res.flags.map((f, i) => <span key={i} className="text-xs bg-gray-100 rounded px-2 py-1">{f}</span>)}
              </div>
            )}
          </div>
        )}

        <div className="mt-8">
          <a href="/" className="text-sm underline">← Back to feed</a>
        </div>
      </div>
    </main>
  );
}
