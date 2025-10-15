# ml/infer.py
from __future__ import annotations
import os, re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Optional

import joblib
from sentence_transformers import SentenceTransformer

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_PATH = ROOT / "models" / "bias_sentence_clf.joblib"

@dataclass
class _State:
    ok: bool = False
    clf: Optional[object] = None
    embedder: Optional[SentenceTransformer] = None
    model_name: str = "all-MiniLM-L6-v2"

STATE = _State()

# -------- sentence split + heuristic (matches trainer vibe) --------
_SENT_SPLIT = re.compile(r'(?:(?<=[\.\!\?])|(?<=[\.\!\?][\'")\]]))\s+')
_SENSATIONAL = {
    "shocking","explosive","furious","outrage","disaster","scandal","exposed","slams",
    "slammed","fake","hoax","you won’t believe","must see","unbelievable","miracle",
    "disgusting","corrupt","traitor","sellout","witch hunt","rigged","bloodbath",
}

def split_sentences(text: str) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    text = re.sub(r"\s+", " ", text)
    parts = _SENT_SPLIT.split(text)
    return [s.strip() for s in parts if 20 <= len(s.strip()) <= 600]

def heuristic_bias_prob(sent: str) -> float:
    s = sent or ""
    low = s.lower()
    words = s.split()
    excls = s.count("!")
    caps_words = sum(1 for w in words if len(w) >= 4 and w.isupper())
    sens_hits = sum(1 for t in _SENSATIONAL if t in low)
    quotes = s.count('"') + s.count("“") + s.count("”") + s.count("'")
    score = 0.0
    score += 0.25 if excls > 0 else 0.0
    score += min(0.35, 0.08 * caps_words)
    score += min(0.40, 0.20 * sens_hits)
    score -= 0.10 if quotes >= 2 else 0.0
    return float(max(0.0, min(1.0, score)))

# -------- model loading / inference --------
def load_model(path: str | os.PathLike | None = None) -> bool:
    """Load classifier + embedder. Returns True if ready."""
    model_path = Path(os.getenv("MODEL_PATH") or (path if path else DEFAULT_MODEL_PATH))
    try:
        obj = joblib.load(model_path)
        clf = obj["clf"]
        embedder_name = obj.get("embedder", obj.get("model_name", "all-MiniLM-L6-v2"))
        embedder = SentenceTransformer(embedder_name)

        STATE.clf = clf
        STATE.embedder = embedder
        STATE.model_name = embedder_name
        STATE.ok = True
        return True
    except Exception:
        STATE.ok = False
        STATE.clf = None
        STATE.embedder = None
        return False

def _predict_probs(texts: List[str]) -> List[float]:
    if not STATE.ok or not texts:
        return [0.0] * len(texts)
    X = STATE.embedder.encode(texts, convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=False)
    probs = STATE.clf.predict_proba(X)[:, 1]
    return probs.tolist()

def annotate_sentences(text: str) -> List[Dict[str, float | str]]:
    """Return [{'text': str, 'bias_prob': float}, ...] using ML (empty if not loaded)."""
    sents = split_sentences(text)
    if not sents:
        return []
    if STATE.ok:
        ml = _predict_probs(sents)
        return [{"text": s, "bias_prob": float(p)} for s, p in zip(sents, ml)]
    return []
