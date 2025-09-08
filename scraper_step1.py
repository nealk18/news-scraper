import asyncio
from playwright.async_api import async_playwright

SEED = "https://www.bbc.com/news/world"

SELECTORS = ['a[href^="/news/"]']

async def main():
    async with async_playwright() as p: 
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Load the seed page
        await page.goto(SEED, timeout = 60_000)

        await page.wait_for_load_state("domcontentloaded")
        await page.wait_for_timeout(1200)
        for sel in ('button:has-text("Accept")',
                    'button:has-text("I Accept")',
                    'button:has-text("Agree")'
                    ):
            try:
                await page.click(sel, timeout=1500)
                break
            except:
                pass
        
        links = []
        for css in SELECTORS:
            try:
                found = await page.eval_on_selector_all(
                    css, 'els => [...new Set(els.map(a => a.href))]'
                )
                if found:
                    links = found
                    break
            except:
                pass

        if not links:
            print("No links found with the current selectors.")
        else:
            links = links[:6]
            for i, url in enumerate(links, 1):
                print(f"{i}. {url}")

        await browser.close()

if __name__ == "__main__":
        asyncio.run(main())

        