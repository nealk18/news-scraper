# News Scraper + Fake News Detection (MVP)

Goal: Be able to scrape news related links from one site, shows that I'm able to load pages and print article URLS.  

Next Steps: Extract clean text and add ML scoring.

## Quickstart
1) Create & activate a virtualenv
    python3 -m venv .venv && source .venv/bin/activate

2) Install deps
    pip install -r requirements.txt
    python -m playwright install chromium

3) Run python scraper_step1.py