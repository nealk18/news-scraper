import json, math, os, re, subprocess, sys
from pathlib import Path
from typing import Dict, List

BASE = Path(__file__).resolve().parent
DATA_DIR = BASE / "data"
INFILE  = DATA_DIR / "articles_step2.json"
OUTFILE = DATA_DIR / "articles_step3_scored.json"

SENSATIONAL = {
    "shocking","exposed","unbelievable","secret","banned","scandal","cover-up","hoax",
    "miracle","you won't believe","destroyed","rigged","fake","fraud","lying","traitor",
    "bombshell","outrage","terrifying","panic","apocalyptic","proof","guaranteed",
}
CLICKBAIT = {
    "what happened next","this is why","you need to see","no one is talking about",
    "the real reason","number x will","goes viral","jaw-dropping"
}
CREDIBILITY_CUES = {
    "according to","report","data","study","analysis","research","investigation",
    "documents","records","court filings","peer-reviewed","methodology","dataset",
    "as confirmed by","spokesperson said","police said","officials said","the bbc has contacted",
}

def _norm(n: float, d: float) -> float:
    return n / d if d else 0.0

def score_article(a: Dict) -> Dict:
    title = (a.get("title") or "").strip()
    body  = (a.get("body") or "").strip()
    text  = f"{title}\n{body}"
    words = re.findall(r"[A-Za-z][A-Za-z'-]{2,}", text)
    n = len(words)

    excl = text.count("!")
    q    = text.count("?")
    allcaps = [w for w in re.findall(r"\b[A-Z]{4,}\b", text)
               if w not in ("COVID","NASA","US","UK","EU","BBC","NATO")]
    tl = text.lower()
    sens_hits  = sum(1 for w in SENSATIONAL   if w in tl)
    click_hits = sum(1 for w in CLICKBAIT     if w in tl)
    cred_hits  = sum(1 for w in CREDIBILITY_CUES if w in tl)

    allcaps_ratio = _norm(len(allcaps), n)
    sens_density  = _norm(sens_hits + click_hits, max(1, n/250))
    excl_norm     = min(excl/8.0, 1.0)
    q_norm        = min(q/12.0, 1.0)
    cred_density  = _norm(cred_hits, max(1, n/400))

    raw = 2.2*sens_density + 1.2*excl_norm + 0.9*q_norm + 3.0*allcaps_ratio - 1.5*cred_density
    fake_prob = 1 / (1 + math.exp(-raw))
    fake_prob = max(0.01, min(0.98, fake_prob))

    out = dict(a)
    out["fake_prob"] = round(fake_prob, 3)
    out["flags"] = [f for f in (
        f"sensational terms: {sens_hits+click_hits}" if (sens_hits+click_hits) else "",
        f"exclamation marks: {excl}" if excl > 2 else "",
        f"question marks: {q}" if q > 4 else "",
        f"ALL-CAPS ratio: {allcaps_ratio:.2%}" if allcaps_ratio > 0.02 else "",
        "credibility cues present" if cred_density >= 0.5 else "",
    ) if f]
    out["word_count"] = n
    return out

def main():
    if not INFILE.exists() or INFILE.stat().st_size == 0:
        print(f"Missing {INFILE} — running Step 2 to generate it...")
        subprocess.run([sys.executable, str(BASE / "scraper_step2_extract.py")], check=True)
        if not INFILE.exists() or INFILE.stat().st_size == 0:
            raise SystemExit(f"Still missing {INFILE}. Check Step 2 output above.")

    with open(INFILE, "r", encoding="utf-8") as f:
        items = json.load(f)

    scored = [score_article(a) for a in items]

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTFILE, "w", encoding="utf-8") as f:
        json.dump(scored, f, ensure_ascii=False, indent=2)

    print(f"Scored {len(scored)} articles → {OUTFILE}")
    top = sorted(scored, key=lambda x: x.get("fake_prob", 0), reverse=True)[:5]
    for i, a in enumerate(top, 1):
        print(f"{i}. {a.get('fake_prob', 0):.3f} — {a.get('title','')[:80]}")

if __name__ == "__main__":
    main()

