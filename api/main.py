from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from pathlib import Path
import json, subprocess, sys, trafilatura
from json import JSONDecodeError


class ArticleOut(BaseModel):
    url: str
    source: str
    title: str
    published: str
    body: str
    fake_prob: float
    flags: List[str] = Field(default_factory=list)
    word_count: int

class ArticlesResponse(BaseModel):
    items: List[ArticleOut]
    total: int
    page: int
    page_size: int

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUTFILE = DATA_DIR / "articles_step3_scored.json"

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scraper_step3_score import score_article

app = FastAPI(title="News Credibility API", version="0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class UrlIn(BaseModel):
    url: str

@app.get("/health")
def health():
    return {"ok": True}

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

    if min_prob is not None:
        items = [a for a in items if a.get("fake_prob", 0.0) >= min_prob]
    if max_prob is not None:
        items = [a for a in items if a.get("fake_prob", 0.0) <= max_prob]
    if q:
        q1 = q.lower()
        items = [a for a in items if q1 in (a.get("title", "")+ " " + a.get("body","")).lower()]

    reverse = (order == "desc")
    if sort_by == "published":
        items.sort(key=lambda x: x.get("published", ""), reverse=reverse)
    elif sort_by == "title":
        items.sort(key=lambda x: (x.get("title") or "").lower(), reverse=reverse)
    else:
        items.sort(key=lambda x: x.get("fake_prob", 0.0), reverse=reverse)

    total = len(items)    
    start = (page - 1) * page_size
    end = start + page_size
    page_items = items[start:end]

    return {
        "items": page_items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }

@app.post("/score-url", response_model=ArticleOut)
def score_url(payload: UrlIn):
    url = payload.url.strip()
    html = trafilatura.fetch_url(url)
    if not html:
        raise HTTPException(400, "Could not fetch URL")
    data_json = trafilatura.extract(html, output_format="json", favor_recall=True)
    if not data_json:
        raise HTTPException(422, "Could not extract article content")
    
    item = json.loads(data_json)
    art = {
        "url": url,
        "source": item.get("sitename") or "",
        "title": item.get("title") or "",
        "published": item.get("date") or "",
        "body": (item.get("text") or "").strip(),
    }

    if len(art["body"]) < 120:
        raise HTTPException(status_code=422, detail="Extracted content too short to score.")
    
    return score_article(art)

@app.post("/refresh")
def refresh():
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
    return {"ok": ok, "scored_exists": OUTFILE.exists()}



