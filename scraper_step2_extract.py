# scraper_step2_extract.py
from __future__ import annotations

import asyncio, json, os, re
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright
import trafilatura

# -------- Title hygiene --------
BAD_TITLE_PATTERNS = [
    r"access request form",
    r"access denied",
    r"forbidden",
    r"sign[ -]?in",
    r"log[ -]?in",
    r"request access",
    r"are you a robot",
    r"verify you are human",
    r"bbc - signin",
]

def is_bad_title(title: str) -> bool:
    t = (title or "").strip().lower()
    if not t or len(t) < 8:
        return True
    return any(re.search(p, t) for p in BAD_TITLE_PATTERNS)

def from_meta_title(html: str) -> Optional[str]:
    if not html:
        return None
    m = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
    if m:
        return m.group(1).strip()
    m = re.search(r'<meta[^>]+name=["\']twitter:title["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
    if m:
        return m.group(1).strip()
    return None

def title_from_url(url: str) -> str:
    try:
        slug = url.split("?")[0].rstrip("/").split("/")[-1]
        slug = re.sub(r"[-_]+", " ", slug)
        slug = re.sub(r"^\w{1,8}\d+$", "", slug)  # drop short id-like slugs
        if slug and not slug.isdigit():
            s = slug.strip().capitalize()
            if len(s) >= 10:
                return s
    except:
        pass
    return "(no title)"

# -------- Paths / output --------
BASE = Path(__file__).resolve().parent
DATA_DIR = BASE / "data"
OUTFILE = "articles_step2.json"

# -------- Seeds --------
SEEDS: List[str] = [
    "https://www.bbc.com/news/world",
    "https://www.bbc.com/news",
    "https://www.bbc.com/news/business",
    "https://www.bbc.com/news/us-canada",
    "https://www.bbc.com/news/technology",
    "https://www.reuters.com/world/",
    "https://www.reuters.com/world/us/",
    "https://www.reuters.com/world/uk/",
    "https://apnews.com/",
    "https://apnews.com/hub/world-news",
    "https://apnews.com/hub/politics",
    "https://apnews.com/hub/science",
    "https://apnews.com/hub/technology",
    "https://www.theguardian.com/world",
    "https://www.theguardian.com/us-news",
    "https://www.cbc.ca/news/world",
    "https://www.cbc.ca/news/politics",
    "https://www.cbsnews.com/world/",
    "https://www.cbsnews.com/politics/",
    "https://www.nbcnews.com/world",
    "https://www.nbcnews.com/politics",
    "https://news.sky.com/world",
    "https://news.sky.com/technology",
    "https://abcnews.go.com/International",
]

# -------- URL filters --------
BAD_FRAGMENTS = ("/video", "/videos/", "/live/", "/sport/", "#", "/av/", "/sounds/")
BAD_HOSTS = (
    "session.bbc.com",
    "account.reuters.com",
    "accounts.reuters.com",
    "consent.",
    "consent.google.com",
)

def is_article(u: str) -> bool:
    try:
        pu = urlparse(u)
    except Exception:
        return False
    if pu.scheme not in ("http", "https"):
        return False
    host = (pu.netloc or "").lower()
    path = pu.path or ""

    # drop login/consent/utility hosts early
    if any(bad in host for bad in BAD_HOSTS):
        return False
    # drop obvious non-article fragments
    if any(b in u for b in BAD_FRAGMENTS):
        return False

    # Domain-specific rules
    if "bbc.com" in host:
        # BBC articles: /news/articles/<id>
        return path.startswith("/news/articles/")
    if "apnews.com" in host:
        # AP: /article/<slug-or-id>
        return "/article/" in path and len(path) > len("/article/")
    if "reuters.com" in host:
        # Reuters: articles under /world/... (avoid bare /world/ section)
        return path.startswith("/world/") and path.count("/") >= 4 and not path.endswith("/world/")

    # Fallback: require at least a few path segments to avoid section pages
    return path.count("/") >= 3 and len(path) > 8

async def get_links(page) -> List[str]:
    """Visit each seed, collect candidate article links, de-dupe, and return."""
    selectors = [
        'a[href^="/news/"]',
        'article a[href^="/news/"]',
        'a[data-testid="internal-link"]',
        "a",  # fallback: grab all anchors and filter in Python
    ]

    seen: set[str] = set()
    all_links: List[str] = []

    for seed in SEEDS:
        try:
            await page.goto(seed, wait_until="domcontentloaded", timeout=60_000)
            await page.wait_for_timeout(1200)

            # Try cookie/consent buttons on each seed
            for sel in (
                'button:has-text("Accept")',
                'button:has-text("Agree")',
                'button[aria-label*="accept"]',
                'button:has-text("Continue")',
                'button:has-text("I agree")',
            ):
                try:
                    await page.click(sel, timeout=1200)
                    break
                except:
                    pass

            found_links: List[str] = []
            for css in selectors:
                try:
                    hrefs = await page.eval_on_selector_all(css, 'els => els.map(a => a.href)')
                    if hrefs:
                        found_links.extend(hrefs)
                except:
                    pass

            found_links = [u for u in found_links if is_article(u)]
            for u in found_links:
                if u not in seen:
                    seen.add(u)
                    all_links.append(u)

            print(f"Seed {seed} -> collected {len(found_links)} candidates (total so far: {len(all_links)})")
        except Exception as e:
            print(f"Seed {seed} skipped: {e.__class__.__name__}: {e}")

    CAP = int(os.getenv("SCRAPE_CAP", "500"))  # allow override via env
    all_links = all_links[:CAP]
    print(f"Found {len(all_links)} unique article links across seeds:")
    for u in all_links[:12]:
        print(f" - {u}")
    if len(all_links) > 12:
        print(f" ... and {len(all_links) - 12} more")

    return all_links

def extract_with_trafilatura(html: str):
    data_json = trafilatura.extract(
        html,
        output_format="json",
        favor_recall=True,
        include_comments=False,
        include_tables=False,
    )
    if not data_json:
        return None
    return json.loads(data_json)

async def resolve_title(page, html: str, data: Optional[dict]) -> str:
    t = (data or {}).get("title")
    if t and (t := t.strip()):
        return t

    if html:
        m = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        if m:
            return m.group(1).strip()
        m = re.search(r'<meta[^>]+name=["\']twitter:title["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        if m:
            return m.group(1).strip()

    try:
        h1 = await page.locator('h1, header h1, article h1, [data-component="headline"]').first().text_content()
        if h1 and (h1 := h1.strip()):
            return h1
    except:
        pass

    try:
        t = await page.title()
        if t and (t := t.strip()):
            return t
    except:
        pass
    return "(no title)"

async def extract_article(page, url: str):
    try:
        html = None
        data = None

        # 1) Fast path: direct fetch (usually enough)
        fetched = trafilatura.fetch_url(url)
        if fetched:
            data = extract_with_trafilatura(fetched)

        # 2) Fallback: light browser load with short timeout
        if not data:
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=10_000)
                await page.wait_for_timeout(300)
                html = await page.content()
                data = extract_with_trafilatura(html)
            except Exception:
                pass

        if not data:
            print(f"    Could not extract: {url}")
            return None

        body = (data.get("text") or "").strip()
        title = await resolve_title(page, html or "", data)
        # guard against interstitial/utility pages
        if is_bad_title(title):
            # try to salvage a better title, else fallback or skip
            alt = from_meta_title(html or "") or title_from_url(url)
            if is_bad_title(alt):
                print(f"    Skipping generic/non-article page: {url!r} — title={title!r}")
                return None
            title = alt

        published = (data.get("date") or datetime.utcnow().isoformat())

        if len(body) < 120:
            print(f"    Too short ({len(body)} chars): {url} — '{title[:60]}'")
            return None

        return {
            "url": url,
            "source": data.get("sitename") or "",
            "title": title,
            "published": published,
            "body": body,
        }

    except Exception as e:
        print(f"   Skip {url}: {e.__class__.__name__}: {e}")
        return None

# -------- Route handler: abort nonessential assets --------
NONESSENTIAL_TYPES = {"image", "media", "font", "stylesheet"}

async def block_nonessential(route):
    try:
        if route.request.resource_type in NONESSENTIAL_TYPES:
            await route.abort()
        else:
            await route.continue_()
    except Exception:
        # Fail open so extraction continues
        try:
            await route.continue_()
        except Exception:
            pass

# -------- Main run --------
async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        await context.route("**/*", block_nonessential)
        try:
            page = await context.new_page()
            links = await get_links(page)
            if not links:
                print("No links found on the seed page.")
                return

            results: List[Dict] = []
            for url in links:
                art = await extract_article(page, url)
                if art:
                    results.append(art)
        finally:
            await context.close()
            await browser.close()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DATA_DIR / OUTFILE
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(results)} articles to {out_path}")
    for i, a in enumerate(results, 1):
        snippet = a["body"][:180].replace("\n", " ")
        print(f"\n{i}. {a['title']}  ({a['published']})")
        print(f"    {a['url']}")
        print(f"    {len(a['body'])} chars | {snippet}...")

if __name__ == "__main__":
    asyncio.run(run())
