# api/main.py
from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, HttpUrl
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.middleware.gzip import GZipMiddleware

from typing import List, Optional
from pathlib import Path
from urllib.parse import urlparse
import json, subprocess, sys, trafilatura
from json import JSONDecodeError
import os, time, logging

# ----- paths / imports -----
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Heuristic article scorer from your step 3
from scraper_step3_score import score_article

# ML API (loaded after logging is configured)
try:
    from ml.infer import load_model, annotate_sentences, heuristic_bias_prob
except Exception:
    load_model = None  # type: ignore
    annotate_sentences = None  # type: ignore
    heuristic_bias_prob = None  # type: ignore

# ----- config / env -----
ENV = os.getenv("ENV", "dev")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
TRUSTED_HOSTS = [h.strip() for h in os.getenv("TRUSTED_HOSTS", "*").split(",") if h.strip()]
ALLOWED_SCORE_HOSTS = set(h.strip().lower() for h in os.getenv("ALLOWED_SCORE_HOSTS", "").split(",") if h.strip())
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
RATE_LIMIT_SCORE_PER_HOUR = int(os.getenv("RATE_LIMIT_SCORE_PER_HOUR", "30"))
CACHE_SECONDS_ARTICLES = int(os.getenv("CACHE_SECONDS_ARTICLES", "120"))

# How we combine scores
USE_ML_ONLY = os.getenv("USE_ML_ONLY", "true").lower() in {"1", "true", "yes"}  # default: ML replaces total
MIN_SENT_FOR_ML = int(os.getenv("MIN_SENT_FOR_ML", "3"))  # require N+ sentences to accept ML as stable
MIN_CHARS_TEXT = int(os.getenv("MIN_CHARS_TEXT", "120"))  # minimum chars to score text/url

# ----- logging -----
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("api")

# Load ML model
if load_model:
    try:
        ML_READY = load_model(None)  # returns True/False
        log.info("ML READY=%s", ML_READY)
    except Exception as e:
        ML_READY = False
        log.exception("ML init failed: %s", e)
else:
    ML_READY = False
    log.info("ML inference module not available; running heuristics-only.")

# ----- app / middleware -----
app = FastAPI(title="News Credibility API", version="0.1")

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
if ENV.lower() == "prod":
    app.add_middleware(HTTPSRedirectMiddleware)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=TRUSTED_HOSTS or ["*"])

# ----- models -----
class SentenceOut(BaseModel):
    text: str
    # Used by heatmap UI
    bias_prob: float
    # Extras for debugging / display
    heur_prob: Optional[float] = None
    ml_prob: Optional[float] = None
    final_prob: Optional[float] = None

class ArticleOut(BaseModel):
    url: str
    source: str
    title: str
    published: Optional[str] = None
    body: str
    fake_prob: float
    flags: List[str] = Field(default_factory=list)
    word_count: int
    # ML fields (optional)
    heur_prob: Optional[float] = None
    ml_prob: Optional[float] = None
    final_prob: Optional[float] = None
    sentences: Optional[List[SentenceOut]] = None

class ArticlesResponse(BaseModel):
    items: List[ArticleOut]
    total: int
    page: int
    page_size: int

class UrlIn(BaseModel):
    url: HttpUrl

class TextIn(BaseModel):
    text: str
    title: Optional[str] = None
    author: Optional[str] = None

# ----- rate limiter -----
class RateLimiter:
    def __init__(self, max_per_hour: int = 30) -> None:
        self.max = max_per_hour
        self.hits: dict[str, List[float]] = {}

    def check(self, key: str) -> bool:
        now = time.time()
        window_start = now - 3600
        lst = self.hits.get(key, [])
        lst = [t for t in lst if t >= window_start]
        if len(lst) >= self.max:
            self.hits[key] = lst
            return False
        lst.append(now)
        self.hits[key] = lst
        return True

rate_limiter = RateLimiter(RATE_LIMIT_SCORE_PER_HOUR)

async def rate_limit_dep(request: Request):
    client = (request.headers.get("x-forwarded-for") or request.client.host or "unknown").split(",")[0].strip()
    if not rate_limiter.check(client):
        raise HTTPException(status_code=429, detail="Rate limit exceeded for /score-url")

# ----- security headers -----
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    if ENV.lower() == "prod":
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
    return response

# ----- helpers -----
def validate_allowed_host(url: str) -> None:
    if not ALLOWED_SCORE_HOSTS:
        return
    host = urlparse(url).hostname or ""
    host = host.lower()
    if not any(host == h or host.endswith("." + h) for h in ALLOWED_SCORE_HOSTS):
        raise HTTPException(status_code=422, detail=f"Host '{host}' not allowed.")

def choose_final_prob(heur_prob: float, ml_prob: Optional[float], sentences: Optional[List[SentenceOut]]) -> float:
    """Prefer ML-only when available & stable; else blend (optional) or fallback to heuristics."""
    sent_ok = sentences is not None and len(sentences) >= MIN_SENT_FOR_ML
    if ML_READY and ml_prob is not None and sent_ok:
        if USE_ML_ONLY:
            return float(ml_prob)
        # hybrid option (kept for easy toggling)
        return float(0.8 * ml_prob + 0.2 * heur_prob)
    return float(heur_prob)

# ----- dataset paths -----
DATA_DIR = ROOT / "data"
OUTFILE = DATA_DIR / "articles_step3_scored.json"

# ----- endpoints -----
@app.get("/health")
def health():
    return {"ok": True}

@app.get("/ready")
def ready():
    return {"ok": True}

@app.get("/model/health")
def model_health():
    return {"loaded": bool(ML_READY)}

@app.get("/articles", response_model=ArticlesResponse)
def list_articles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: str = Query("fake_prob", pattern="^(fake_prob|published|title)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    q: Optional[str] = Query(None),
    min_prob: Optional[float] = Query(None, ge=0.0, le=1.0),
    max_prob: Optional[float] = Query(None, ge=0.0, le=1.0),
):
    if not OUTFILE.exists():
        raise HTTPException(status_code=404, detail="No scored dataset yet. Run /refresh or your step scripts.")
    try:
        items = json.loads(OUTFILE.read_text(encoding="utf-8"))
    except JSONDecodeError:
        raise HTTPException(status_code=500, detail="Scored dataset is corrupt or empty.")

    # Prefer ML final_prob if present (e.g., after ml/batch_infer.py ran)
    for it in items:
        it["fake_prob"] = it.get("final_prob", it.get("fake_prob", 0.0))

    if min_prob is not None:
        items = [a for a in items if a.get("fake_prob", 0.0) >= min_prob]
    if max_prob is not None:
        items = [a for a in items if a.get("fake_prob", 0.0) <= max_prob]
    if q:
        q1 = q.lower()
        items = [a for a in items if q1 in (a.get("title", "") + " " + a.get("body", "")).lower()]

    reverse = (order == "desc")
    if sort_by == "published":
        items.sort(key=lambda x: x.get("published", "") or "", reverse=reverse)
    elif sort_by == "title":
        items.sort(key=lambda x: (x.get("title") or "").lower(), reverse=reverse)
    else:
        items.sort(key=lambda x: x.get("fake_prob", 0.0), reverse=reverse)

    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = items[start:end]

    return {"items": page_items, "total": total, "page": page, "page_size": page_size}

@app.post("/score-url", response_model=ArticleOut, dependencies=[Depends(rate_limit_dep)])
def score_url(payload: UrlIn):
    """Extract article, compute heuristic + (optional) ML scores, return ML-preferred result."""
    validate_allowed_host(str(payload.url))

    url = str(payload.url).strip()
    html = trafilatura.fetch_url(url)
    if not html:
        raise HTTPException(status_code=400, detail="Could not fetch URL")
    data_json = trafilatura.extract(html, output_format="json", favor_recall=True)
    if not data_json:
        raise HTTPException(status_code=422, detail="Could not extract article content")

    item = json.loads(data_json)
    art = {
        "url": url,
        "source": item.get("sitename") or "",
        "title": item.get("title") or "",
        "published": item.get("date") or "",
        "body": (item.get("text") or "").strip(),
    }
    if len(art["body"]) < MIN_CHARS_TEXT:
        raise HTTPException(status_code=422, detail="Extracted content too short to score.")

    # Heuristic (article-level)
    scored = score_article(art)
    heur_prob = float(scored.get("fake_prob", 0.0))

    # ML (sentence-level)
    sentences: List[SentenceOut] = []
    ml_prob: Optional[float] = None
    if ML_READY and annotate_sentences:
        try:
            raw = annotate_sentences(art["body"]) or []  # [{text, bias_prob}]
            for r in raw:
                s_text = r.get("text", "")
                ml_p = float(r.get("bias_prob", 0.0))
                heur_p = float(heuristic_bias_prob(s_text)) if heuristic_bias_prob else None
                final_p = ml_p if USE_ML_ONLY or heur_p is None else (0.8 * ml_p + 0.2 * heur_p)
                sentences.append(SentenceOut(text=s_text, bias_prob=final_p, heur_prob=heur_p, ml_prob=ml_p, final_prob=final_p))
            if sentences:
                ml_vals = [s.ml_prob for s in sentences if s.ml_prob is not None]
                if ml_vals:
                    ml_prob = float(sum(ml_vals) / len(ml_vals))
        except Exception as e:
            log.warning(f"annotate_sentences failed: {e}")

    final_prob = choose_final_prob(heur_prob, ml_prob, sentences)

    return ArticleOut(
        url=scored["url"],
        source=scored["source"],
        title=scored["title"],
        published=scored.get("published"),
        body=scored["body"],
        fake_prob=final_prob,  # keep compatibility with UI
        flags=scored.get("flags", []),
        word_count=int(scored.get("word_count", 0)),
        heur_prob=heur_prob,
        ml_prob=ml_prob,
        final_prob=final_prob,
        sentences=sentences or None,
    )

@app.post("/score-text", response_model=ArticleOut)
def score_text(payload: TextIn):
    """Score raw text (no URL)."""
    text = (payload.text or "").strip()
    if len(text) < MIN_CHARS_TEXT:
        raise HTTPException(status_code=422, detail=f"Text too short to score (min {MIN_CHARS_TEXT} chars).")

    # Heuristic on the text as an "article"
    art_in = {"url": "text://input", "source": "", "title": payload.title or "", "published": "", "body": text}
    heur_scored = score_article(art_in)
    heur_prob = float(heur_scored.get("fake_prob", 0.0))

    # ML annotate
    sentences: List[SentenceOut] = []
    ml_prob: Optional[float] = None
    if ML_READY and annotate_sentences:
        try:
            raw = annotate_sentences(text) or []
            for r in raw:
                s_text = r.get("text", "")
                ml_p = float(r.get("bias_prob", 0.0))
                heur_p = float(heuristic_bias_prob(s_text)) if heuristic_bias_prob else None
                final_p = ml_p if USE_ML_ONLY or heur_p is None else (0.8 * ml_p + 0.2 * heur_p)
                sentences.append(SentenceOut(text=s_text, bias_prob=final_p, heur_prob=heur_p, ml_prob=ml_p, final_prob=final_p))
            if sentences:
                ml_vals = [s.ml_prob for s in sentences if s.ml_prob is not None]
                if ml_vals:
                    ml_prob = float(sum(ml_vals) / len(ml_vals))
        except Exception as e:
            log.warning(f"annotate_sentences (text) failed: {e}")

    final_prob = choose_final_prob(heur_prob, ml_prob, sentences)

    return ArticleOut(
        url="text://input",
        source="",
        title=payload.title or "",
        published=None,
        body=text,
        fake_prob=final_prob,
        flags=heur_scored.get("flags", []),
        word_count=int(heur_scored.get("word_count", len(text.split()))),
        heur_prob=heur_prob,
        ml_prob=ml_prob,
        final_prob=final_prob,
        sentences=sentences or None,
    )

@app.post("/refresh")
def refresh(request: Request):
    # Optional admin gate in prod
    if ENV.lower() == "prod":
        token = request.headers.get("x-admin-token", "")
        if not ADMIN_TOKEN or token != ADMIN_TOKEN:
            raise HTTPException(status_code=403, detail="Forbidden")

    cmds = [
        [sys.executable, str(ROOT / "scraper_step2_extract.py")],
        [sys.executable, str(ROOT / "scraper_step3_score.py")],
    ]
    ok = True
    for cmd in cmds:
        try:
            subprocess.run(cmd, check=True)
        except subprocess.CalledProcessError:
            ok = False
            break
    return {"ok": ok, "scored_exists": (ROOT / "data" / "articles_step3_scored.json").exists()}
