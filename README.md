# News Credibility Scraper — MVP

Scrape recent news links from a source site, extract clean article text, and assign a **heuristic credibility score**. A small **FastAPI** server exposes the results so a UI can consume them later.

**Status:** MVP  
✅ Scraper (links → articles) • ✅ Heuristic scorer • ✅ FastAPI API  
❌ Pagination metadata • ❌ Frontend UI • ❌ ML classifier

---

## Tech Stack

- **Python** 3.9
- **Playwright** (headless browser) for link discovery & navigation
- **Trafilatura** for article extraction (title/date/body)
- **FastAPI** (+ Uvicorn) to serve JSON endpoints
- **Heuristic scorer** (rule-based) to produce `fake_prob` and `flags`

---

## Repo Structure

news-scraper/
├─ api/
│ └─ main.py # FastAPI app: /health, /articles, /score-url, /refresh
├─ data/ # Generated outputs (gitignored)
│ ├─ articles_step2.json
│ └─ articles_step3_scored.json
├─ scraper_step1.py # MVP link collector (single seed)
├─ scraper_step2_extract.py # Extract clean text → step2.json
├─ scraper_step3_score.py # Heuristic scoring → step3_scored.json
├─ requirements.txt
└─ README.md

---

## Setup

```bash
# 1) Enter project
cd path/to/news-scraper

# 2) Create & activate a virtualenv
python3 -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# (from api/ subfolder use: source ../.venv/bin/activate)
# Windows PowerShell:
# .venv\Scripts\Activate.ps1

# 3) Install dependencies
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# 4) Install Playwright browsers (once)
python -m playwright install

macOS note: If you see a urllib3 OpenSSL warning, add urllib3<2 to requirements.txt and reinstall it.
```
---

Run the Pipeline (Steps 1-3)

Step 1:
python scraper_step1.py

Step 2:
python scraper_step2_extract.py

Creates data/articles_step2.json entries like:
{
  "url": "https://www.bbc.com/news/articles/abc123",
  "source": "bbc",
  "title": "Headline…",
  "published": "2025-09-22T01:28:51.484257",
  "body": "Clean plain text content…"
}

Step 3:
python scraper_step3_score.py

Creates data/articles_step3_scored.json with extra fields:
{
  "url": "https://…",
  "source": "bbc",
  "title": "…",
  "published": "2025-09-22T01:28:51.484257",
  "body": "…",
  "fake_prob": 0.41,
  "flags": ["sensational terms: 2", "credibility cues present"],
  "word_count": 645
}

---

Run the API:
python -m uvicorn api.main:app --reload --host 127.0.0.1 --port 8000

Open http://127.0.0.1:8000/docs for the interactive Swagger UI

---

Endpoints:

GET /health
    - Liveness probe:
{ "ok": true }

GET /articles
    - Returns a JSON array of scored articles (reads through data/articles_step3_scored.json)

Query Parameters:
    - page(int, default 1)
    - page_size(int, default 20)
    - sort_by = fake_prob|published|title (default fake_prob)
    - order = asc|desc (default desc)
    - q (string, optional) - search term in title/body
    - min_prob, max_prob (float [0..1], optional)
Example:
curl -s 'http://127.0.0.1:8000/articles?sort_by=fake_prob&order=desc&page=1&page_size=10' | jq

POST /score-url
    - Scores a single article from a provided URL

Body:
    - { "url": "https://www.bbc.com/news/articles/cn4wwwz2p1po" }

Example:
curl -s -X POST http://127.0.0.1:8000/score-url \
    -H 'Content-Type: application/json' \
    -d '{"url":"https://www.bbc.com/news/articles/cn4wwwz2p1po"}' | jq

Common erros:
  - 400; Could not fetch URL (might be offline/blocked or URL is a non-article page)
  - 422; Validation/extraction error (ensure the body is { "url": "https://..." })

POST /refresh (dev only)
    - Runs step 2 to step 3 to regenerate datasets
curl -s -X POST http://127.0.0.1:8000/refresh | jq

---

Article JSON Schema:
{
  "url": "string",
  "source": "string",
  "title": "string",
  "published": "string",
  "body": "string",
  "fake_prob": 0.0,
  "flags": ["string"],
  "word_count": 0
}

---

Troubleshooting:
    - Playwright timeouts
        - Waits for domcontentloaded and blocks non-essential assets.
        - If a site is slow/JS heavy, increase timeouts or retry.
        - Non-articles are filtered but some will be skipped as "Too short".
    - Extraction failures:
        - Some pages contain small amounts of extractable text; which are skipped
    - ImportError: lxml.html.clean
        - Ensure lxml[html_clean] or lxml_html_clean is installed.
    - urllib3 v2 / LibreSSL warning (macOs)
        - Pin urllib3<2 in requirements.txt if needed.
    - 422 on /score-url in Swagger UI
        - Make sure body is JSON object: { "url": "https://..." }
    - Terminal "blocked" when server runs
        - Open a new terminal; stop with Ctrl+C

Ethics & Limitations:
This project gives clues, not complete facts.  The scores can be affected by writing style, extraction errors, or the site itself.  Always used multiple sources when trying to fact check.

---

Roadmap:
    - Create pagination metadata from /articles ( {items, total, page, page_size} )
    - Frontend UI using Next.js and Tailwind
    - ML classifier (probability)
    - Deployment (API on Render/Railway/Fly; UI on Vercel/Netlify)
        - Scheduled refresh
        - Logging/monitoring
    - Database (JSON -> Postgres) for history, filters, and analytics
    - Security hardening: rate limit /score-url, protect /refresh, and tighten CORS
