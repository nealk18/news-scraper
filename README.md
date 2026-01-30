# News Credibility Scraper — Final Product
NOTE: this project has been deployed, but is suspended on Render

Scrape recent news links from a variety of sites, extract clean article text, and assign a score using Machine Learning, including a heatmap showing areas of high, medium, and low bias within the article.

**Status:**   
✅ Scraper (links → articles) • ✅ Heuristic scorer • ✅ FastAPI API  
✅ Pagination metadata • ✅ Frontend UI • ✅ ML classifier

---

## Tech Stack

- **Python** 3.9
- **Playwright** (headless browser) for link discovery & navigation
- **Trafilatura** for article extraction (title/date/body)
- **FastAPI** (+ Uvicorn) to serve JSON endpoints
- **Heuristic scorer** (rule-based) to produce `fake_prob` and `flags`

---

## Repo Structure

news-credibility-analyzer/
├─ api/
│  └─ main.py
├─ data/
│  └─ articles_step3_scored.json
├─ ml/
│  ├─ batch_infer.py
│  ├─ infer.py
│  ├─ weak_supervision.py
│  └─ models/
│     └─ bias_sentence_clf.joblib
├─ web/
│  ├─ public/
│  │  ├─ file.svg
│  │  ├─ globe.svg
│  │  ├─ next.svg
│  │  ├─ vercel.svg
│  │  └─ window.svg
│  ├─ src/
│  │  └─ app/
│  │     ├─ check/
│  │     │  └─ page.tsx
│  │     ├─ components/
│  │     │  └─ BiasHeatmap.tsx
│  │     ├─ favicon.ico
│  │     ├─ globals.css
│  │     ├─ layout.tsx
│  │     └─ page.tsx
│  ├─ .gitignore
│  ├─ README.md
│  ├─ eslint.config.mjs
│  ├─ next.config.ts
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ postcss.config.mjs
│  ├─ tailwind.config.ts
│  └─ tsconfig.json
├─ .gitignore
├─ .pre-commit-config.yaml
├─ .secrets.baseline
├─ README.md
├─ requirements.txt
├─ runtime.txt
├─ scraper_step1.py
├─ scraper_step2_extract.py
└─ scraper_step3_score.py


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

Ethics & Limitations:
This project gives clues, not complete facts.  The scores can be affected by writing style, extraction errors, or the site itself.  Always used multiple sources when trying to fact check.
