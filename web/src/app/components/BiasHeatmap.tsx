'use client';
import * as React from 'react';

/**
 * Accepts any of the sentence score fields returned by the API.
 * Prefers `final_prob`, then `bias_prob`, then `ml_prob`, then `heur_prob`.
 */
type Sentence = {
  text: string;
  final_prob?: number | null;
  bias_prob?: number | null;
  ml_prob?: number | null;
  heur_prob?: number | null;
};

function pickProb(s: Sentence) {
  return s.final_prob ?? s.bias_prob ?? s.ml_prob ?? s.heur_prob ?? 0;
}

// Discrete buckets read more clearly than a smooth gradient
function styleForProb(p: number): React.CSSProperties {
  // 4 bands: 0–0.25 (green), 0.25–0.5 (amber), 0.5–0.75 (orange), 0.75–1 (red)
  if (p < 0.25) {
    return { backgroundColor: 'hsl(120 60% 22% / 0.28)', color: 'hsl(120 40% 88% / 0.98)', border: '1px solid hsl(120 50% 40% / 0.35)' };
  }
  if (p < 0.5) {
    return { backgroundColor: 'hsl(60 70% 22% / 0.32)', color: 'hsl(60 40% 90% / 0.98)', border: '1px solid hsl(60 55% 45% / 0.35)' };
  }
  if (p < 0.75) {
    return { backgroundColor: 'hsl(30 70% 20% / 0.34)', color: 'hsl(30 50% 92% / 0.98)', border: '1px solid hsl(30 60% 45% / 0.35)' };
  }
  return { backgroundColor: 'hsl(0 75% 18% / 0.36)', color: 'hsl(0 55% 92% / 0.98)', border: '1px solid hsl(0 60% 45% / 0.35)' };
}

export default function BiasHeatmap({ sentences }: { sentences: Sentence[] }) {
  if (!sentences?.length) return null;

  return (
    <section className="mt-6 rounded-2xl p-4 ring-1 ring-white/10 bg-black/20">
      {/* legend */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/75">
        <span className="opacity-80 mr-1">Sentence heatmap</span>
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5" style={{ backgroundColor: 'hsl(120 60% 22% / 0.28)', border: '1px solid hsl(120 50% 40% / 0.35)' }}>≤ 0.25</span>
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5" style={{ backgroundColor: 'hsl(60 70% 22% / 0.32)', border: '1px solid hsl(60 55% 45% / 0.35)' }}>0.25–0.50</span>
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5" style={{ backgroundColor: 'hsl(30 70% 20% / 0.34)', border: '1px solid hsl(30 60% 45% / 0.35)' }}>0.50–0.75</span>
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5" style={{ backgroundColor: 'hsl(0 75% 18% / 0.36)', border: '1px solid hsl(0 60% 45% / 0.35)' }}>≥ 0.75</span>
      </div>

      <div className="leading-7 text-base">
        {sentences.map((s, i) => {
          const p = pickProb(s);
          return (
            <span
              key={i}
              className="rounded-md px-1 py-0.5 mr-1 mb-1 inline-block transition-transform hover:scale-[1.015]"
              style={styleForProb(p)}
              title={`bias ≈ ${p.toFixed(2)}`}
            >
              {s.text}
            </span>
          );
        })}
      </div>
    </section>
  );
}
