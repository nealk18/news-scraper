import asyncio, json, os, re
from datetime import datetime
from typing import List, Dict, Optional

from pathlib import Path
BASE = Path(__file__).resolve().parent
DATA_DIR = BASE / "data"
OUTFILE = "articles_step2.json"

from playwright.async_api import async_playwright
import trafilatura

SEED = "https://www.bbc.com/news/world"
SELECTOR = 'a[href^="/news/"]'

async def get_links(page) -> List[str]:
    await page.goto(SEED, wait_until="domcontentloaded", timeout=60_000)
    await page.wait_for_timeout(1200)

    for sel in (
        'button:has-text("Accept")',
        'button:has-text("Agree")',
        'button[aria-label*="accept"]',
    ):
        try:
            await page.click(sel, timeout=1200)
            break
        except:
            pass

    selectors = [
        'a[href^="/news/"]',
        'article a[href^="/news/"]',
        'a[data-testid="internal-link"]',
    ]

    links = []
    for css in selectors:
        found = await page.eval_on_selector_all(
            css, 'els => [...new Set(els.map(a => a.href))]'
        )
        if found:
            links = found[:8]
            break
    BAD_FRAGMENTS = ("/video", "/videos/", "/live/", "/sport/", "#", "/av/", "/sounds/")
    def is_article(u: str) -> bool:
        return u.startswith("http") and all(b not in u for b in BAD_FRAGMENTS)

    links = [u for u in links if is_article(u)]
    links = list(dict.fromkeys(links))[:8]

    print(f"Found {len(links)} links on seed:", *links, sep="\n -")

    return links


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
        h1 = await page.locator('h1, header h1, article h1,  [data-component="headline"]').first().text_content()
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
    from datetime import datetime
    try:
        html = None
        data = None

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
            await page.wait_for_timeout(400)
            html = await page.content()
            data = extract_with_trafilatura(html)
        except Exception:
            nav_failed = True

        if not data:
            fetched = trafilatura.fetch_url(url)
            if fetched:
                data = extract_with_trafilatura(fetched)

        if not data:
            print(f"    Could not extract: {url}")
            return None

        body = (data.get("text") or "").strip()
        title = await resolve_title(page, html or "", data)
        published = (data.get("date") or datetime.utcnow().isoformat())

        if len(body) < 120:
            print(f"    Too short ({len(body)} chars): {url} — '{title[:60]}'")
            return None

        return {
            "url": url,
            "source": data.get("sitename") or "bbc",
            "title": title,
            "published": published,
            "body": body,
        }

    except Exception as e:
        print(f"   Skip {url}: {e.__class__.__name__}: {e}")
        return None

NONESSENTIAL_TYPES = {"image", "media", "font", "stylesheet"}

async def block_nonessential(route, request):
    if route.request.resource_type in NONESSENTIAL_TYPES:
        await route.abort()
    else:
        await route.continue_()




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
