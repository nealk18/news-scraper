# ml/batch_infer.py
from __future__ import annotations

import os, json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.infer import load_model, annotate_sentences
from scraper_step3_score import score_article  # fallback heuristic if needed

USE_ML_ONLY = os.getenv("USE_ML_ONLY", "true").lower() in {"1", "true", "yes"}
MIN_SENT_FOR_ML = int(os.getenv("MIN_SENT_FOR_ML", "3"))

DATA = ROOT / "data" / "articles_step3_scored.json"

def main():
    if not DATA.exists():
        raise SystemExit(f"[batch_infer] missing {DATA}")
    try:
        ok = load_model(None)
    except Exception as e:
        raise SystemExit(f"[batch_infer] model load failed: {e}")
    if not ok:
        raise SystemExit("[batch_infer] model not ready")

    items = json.loads(DATA.read_text(encoding="utf-8"))
    updated = 0

    for it in items:
        body = (it.get("body") or "").strip()
        if not body:
            continue

        # sentences (ml)
        sents = annotate_sentences(body) or []
        if not sents:
            # fallback: leave heuristics as-is
            it["ml_prob"] = None
            it["final_prob"] = it.get("fake_prob", 0.0)
            continue

        ml_vals = [float(s.get("bias_prob", 0.0)) for s in sents if s.get("bias_prob") is not None]
        ml_prob = float(sum(ml_vals) / len(ml_vals)) if ml_vals else None

        heur_prob = float(it.get("fake_prob", 0.0))
        sent_ok = len(sents) >= MIN_SENT_FOR_ML
        if ml_prob is not None and sent_ok:
            final_prob = float(ml_prob) if USE_ML_ONLY else float(0.8 * ml_prob + 0.2 * heur_prob)
        else:
            final_prob = heur_prob

        it["ml_prob"] = ml_prob
        it["final_prob"] = final_prob
        updated += 1

    DATA.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[batch_infer] updated {updated} articles → {DATA}")
    # quick sample
    if items:
        s = items[0]
        print("[batch_infer] sample:", json.dumps({
            "title": s.get("title"),
            "fake_prob": round(s.get("fake_prob", 0.0), 3),
            "ml_prob": s.get("ml_prob"),
            "final_prob": s.get("final_prob"),
        }, indent=2))

if __name__ == "__main__":
    main()
