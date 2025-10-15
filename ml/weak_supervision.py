# ml/weak_supervision.py
from __future__ import annotations

import json, random, re
from pathlib import Path
from typing import List, Tuple

import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sentence_transformers import SentenceTransformer

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "articles_step2.json"
MODELS_DIR = ROOT / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
MODEL_OUT = MODELS_DIR / "bias_sentence_clf.joblib"

# --- Embeddings model (switched to DistilRoBERTa) ---
EMBEDDER_NAME = "sentence-transformers/all-distilroberta-v1"
EMBEDDER = SentenceTransformer(EMBEDDER_NAME)

# -------- stricter labelers for weak supervision --------
BIAS_LEXICON = [
    # Absolutes / certainty / dog whistles
    "everyone knows", "the evidence is overwhelming", "only an idiot", "obviously",
    "always", "never", "clearly", "undeniable", "no question", "without a doubt",
    "the only", "it’s common sense",
    # Ad hominem / smear
    "freeloaders", "moron", "idiot", "liars", "corrupt", "traitor", "evil", "disgusting",
    # Loaded frames / propaganda terms
    "mainstream media", "woke", "agenda", "witch hunt", "rigged", "fake news", "propaganda",
]

PATTERNS = [
    re.compile(r"!!!"),
    re.compile(r"\b(always|never|only|obviously)\b", re.I),
    re.compile(r"\b(everyone knows|no question|undeniable|without a doubt)\b", re.I),
    re.compile(r"\b(idiot|moron|evil|disgusting|freeloaders)\b", re.I),
    re.compile(r"[A-Z][A-Z]{6,}"),  # SHOUTING
]

def is_loaded_sentence(s: str) -> bool:
    t = (s or "").strip()
    if not t:
        return False
    tl = t.lower()
    if any(kw in tl for kw in BIAS_LEXICON):
        return True
    if any(p.search(t) for p in PATTERNS):
        return True
    # multiple rhetorical questions
    if tl.count("?") >= 2:
        return True
    return False

# -------- simple sentence split --------
SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")

def split_sentences(text: str) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    parts = SENT_SPLIT.split(text)
    # clean & keep reasonable length
    sents = []
    for s in parts:
        s = s.strip()
        if len(s) >= 20:
            sents.append(s)
    return sents

def load_articles() -> List[dict]:
    if not DATA_PATH.exists():
        raise SystemExit(f"Missing dataset: {DATA_PATH}")
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def build_dataset(articles: List[dict]) -> Tuple[List[str], List[int]]:
    X: List[str] = []
    y: List[int] = []
    for a in articles:
        body = a.get("body") or ""
        sents = split_sentences(body)
        for s in sents:
            X.append(s)
            y.append(1 if is_loaded_sentence(s) else 0)
    return X, y

def balance(X: List[str], y: List[int]) -> Tuple[List[str], List[int]]:
    pos_idx = [i for i, yi in enumerate(y) if yi == 1]
    neg_idx = [i for i, yi in enumerate(y) if yi == 0]
    if not pos_idx or not neg_idx:
        return X, y
    # downsample negatives to at most 1.5x positives
    max_negs = int(1.5 * len(pos_idx))
    if len(neg_idx) > max_negs:
        neg_idx = random.sample(neg_idx, max_negs)
    keep = sorted(pos_idx + neg_idx)
    Xb = [X[i] for i in keep]
    yb = [y[i] for i in keep]
    return Xb, yb

def main():
    articles = load_articles()
    X, y = build_dataset(articles)

    if len(X) < 200:
        raise SystemExit(f"Not enough sentences to train ({len(X)}). Scrape more articles.")

    Xb, yb = balance(X, y)

    print(f"Embedding with {EMBEDDER_NAME} …")
    X_emb = EMBEDDER.encode(
        Xb,
        batch_size=64,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )

    X_tr, X_val, y_tr, y_val = train_test_split(
        X_emb, yb, test_size=0.2, random_state=42, stratify=yb
    )

    clf = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)
    clf.fit(X_tr, y_tr)

    y_hat = clf.predict(X_val)
    acc = accuracy_score(y_val, y_hat)
    print(f"Validation accuracy: {acc:.3f}")

    job = {
        "clf": clf,
        # store embedder name explicitly; keep model_name for back-compat
        "embedder": EMBEDDER_NAME,
        "model_name": EMBEDDER_NAME,
    }
    joblib.dump(job, MODEL_OUT)
    print(f"Saved model -> {MODEL_OUT}")

if __name__ == "__main__":
    main()
