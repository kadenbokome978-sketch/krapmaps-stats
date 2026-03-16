“””
KrapMaps Nightly Stats Scraper
Runs on GitHub Actions every night at midnight.
Scrapes TikTok Creator Studio + Instagram API → saves to krapmaps_stats.json
“””

import os
import json
import time
import re
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# ── CONFIG ────────────────────────────────────────────────────────────────────

TIKTOK_USERNAME = os.environ.get(“TIKTOK_USERNAME”, “”)
TIKTOK_PASSWORD = os.environ.get(“TIKTOK_PASSWORD”, “”)
INSTAGRAM_TOKEN = os.environ.get(“INSTAGRAM_TOKEN”, “”)   # optional
OUTPUT_FILE     = “krapmaps_stats.json”

# ── HELPERS ───────────────────────────────────────────────────────────────────

def parse_count(text):
“”“Convert ‘14.2K’ → 14200, ‘1.3M’ → 1300000, ‘89’ → 89”””
if not text:
return 0
text = str(text).strip().replace(”,”, “”)
try:
if text.upper().endswith(“K”):
return int(float(text[:-1]) * 1000)
if text.upper().endswith(“M”):
return int(float(text[:-1]) * 1_000_000)
return int(float(text))
except (ValueError, TypeError):
return 0

def log(msg):
print(f”[{datetime.now().strftime(’%H:%M:%S’)}] {msg}”)

# ── TIKTOK SCRAPER ────────────────────────────────────────────────────────────

def scrape_tiktok(page):
log(“Navigating to TikTok login…”)
page.goto(“https://www.tiktok.com/login/phone-or-email/email”, wait_until=“networkidle”, timeout=30000)
time.sleep(2)

```
# Fill login
try:
    page.fill('input[name="username"]', TIKTOK_USERNAME)
    time.sleep(0.5)
    page.fill('input[type="password"]', TIKTOK_PASSWORD)
    time.sleep(0.5)
    page.click('button[type="submit"]')
    log("Login submitted, waiting...")
    time.sleep(5)
except Exception as e:
    log(f"Login form error: {e}")
    raise

# Check for CAPTCHA
if page.query_selector('[id*="captcha"], [class*="captcha"]'):
    log("CAPTCHA detected — manual intervention needed. Saving empty stats.")
    return None

# Wait for home feed (login success indicator)
try:
    page.wait_for_url(lambda url: "tiktok.com" in url and "login" not in url, timeout=15000)
    log("Login successful")
except PlaywrightTimeout:
    log("Login may have failed or requires verification")
    return None

# Go to Creator Studio analytics
log("Navigating to Creator Studio...")
page.goto("https://www.tiktok.com/creator-studio/content", wait_until="networkidle", timeout=30000)
time.sleep(3)

# ── Account overview stats ────────────────────────────────────────────────
log("Scraping account overview...")
page.goto("https://www.tiktok.com/creator-studio/analytics/overview", wait_until="networkidle", timeout=30000)
time.sleep(3)

account_stats = {
    "followers": 0,
    "total_likes": 0,
    "total_views": 0,
    "scraped_at": datetime.utcnow().isoformat(),
}

try:
    # Followers — look for the follower count element
    follower_els = page.query_selector_all('[class*="follower"], [data-e2e*="follower"]')
    for el in follower_els:
        text = el.inner_text().strip()
        if text and any(c.isdigit() for c in text):
            account_stats["followers"] = parse_count(text)
            break

    # Try the profile page for more reliable follower count
    page.goto(f"https://www.tiktok.com/@findkrap", wait_until="networkidle", timeout=20000)
    time.sleep(2)
    stats_els = page.query_selector_all('[data-e2e="followers-count"], [class*="CountInfos"]')
    for el in stats_els:
        text = el.inner_text().strip()
        if text:
            account_stats["followers"] = parse_count(text)
            log(f"Followers: {account_stats['followers']}")
            break
except Exception as e:
    log(f"Account stats error: {e}")

# ── Per-video stats ───────────────────────────────────────────────────────
log("Scraping video stats...")
page.goto("https://www.tiktok.com/creator-studio/content", wait_until="networkidle", timeout=30000)
time.sleep(3)

videos = []
try:
    # Scroll to load all videos
    for _ in range(5):
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(1.5)

    # Find video items
    video_cards = page.query_selector_all('[class*="DivVideoCardV2"], [data-e2e="video-item"], [class*="video-card"]')
    log(f"Found {len(video_cards)} video cards")

    for i, card in enumerate(video_cards[:30]):  # cap at 30
        try:
            video = {}

            # Title / caption
            caption_el = card.query_selector('[class*="caption"], [class*="desc"], [data-e2e="video-desc"]')
            video["title"] = caption_el.inner_text().strip()[:100] if caption_el else f"Video {i+1}"

            # Stats
            stat_els = card.query_selector_all('[class*="stat"], [class*="count"], [data-e2e*="count"]')
            stat_texts = [el.inner_text().strip() for el in stat_els if el.inner_text().strip()]

            # Try to get views (usually first stat)
            all_text = card.inner_text()
            numbers = re.findall(r'[\d,.]+[KkMm]?', all_text)
            parsed_numbers = [parse_count(n) for n in numbers if parse_count(n) > 0]

            if parsed_numbers:
                video["views"] = parsed_numbers[0] if parsed_numbers else 0

            # Date
            date_el = card.query_selector('[class*="date"], [class*="time"]')
            video["date"] = date_el.inner_text().strip() if date_el else ""

            video["scraped_at"] = datetime.utcnow().isoformat()
            videos.append(video)

        except Exception as e:
            log(f"Error parsing video {i}: {e}")
            continue

    # ── Try analytics page for better per-video data ──────────────────
    log("Getting detailed video analytics...")
    page.goto("https://www.tiktok.com/creator-studio/analytics/post", wait_until="networkidle", timeout=30000)
    time.sleep(3)

    # Scrape the analytics table
    rows = page.query_selector_all('tr, [class*="TableRow"], [class*="row"]')
    detailed_videos = []

    for row in rows[:30]:
        try:
            cells = row.query_selector_all('td, [class*="cell"], [class*="Cell"]')
            if len(cells) >= 3:
                texts = [c.inner_text().strip() for c in cells]
                numbers = [parse_count(t) for t in texts]
                video_data = {
                    "title": texts[0][:80] if texts[0] else "",
                    "views": numbers[1] if len(numbers) > 1 else 0,
                    "likes": numbers[2] if len(numbers) > 2 else 0,
                    "comments": numbers[3] if len(numbers) > 3 else 0,
                    "shares": numbers[4] if len(numbers) > 4 else 0,
                    "scraped_at": datetime.utcnow().isoformat(),
                }
                if video_data["views"] > 0 or video_data["title"]:
                    detailed_videos.append(video_data)
        except Exception:
            continue

    if detailed_videos:
        videos = detailed_videos
        log(f"Got {len(videos)} videos from analytics table")

    # Sum up total views + likes from all videos
    account_stats["total_views"] = sum(v.get("views", 0) for v in videos)
    account_stats["total_likes"] = sum(v.get("likes", 0) for v in videos)

except Exception as e:
    log(f"Video scraping error: {e}")

log(f"Scraped {len(videos)} videos, {account_stats['followers']} followers")
return { "account": account_stats, "videos": videos }
```

# ── INSTAGRAM STATS ───────────────────────────────────────────────────────────

def fetch_instagram(token):
if not token:
log(“No Instagram token — skipping”)
return None

```
import urllib.request
log("Fetching Instagram stats...")
try:
    # Profile
    url = f"https://graph.instagram.com/me?fields=id,username,media_count,followers_count,account_type&access_token={token}"
    with urllib.request.urlopen(url, timeout=10) as r:
        profile = json.loads(r.read())

    # Recent media
    url2 = f"https://graph.instagram.com/me/media?fields=id,caption,media_type,timestamp,like_count,comments_count,video_views&access_token={token}&limit=20"
    with urllib.request.urlopen(url2, timeout=10) as r:
        media = json.loads(r.read())

    posts = []
    for p in media.get("data", []):
        posts.append({
            "id": p.get("id"),
            "caption": (p.get("caption") or "")[:80],
            "media_type": p.get("media_type"),
            "date": (p.get("timestamp") or "")[:10],
            "likes": p.get("like_count", 0),
            "comments": p.get("comments_count", 0),
            "views": p.get("video_views", 0),
        })

    log(f"Instagram: {profile.get('followers_count', '?')} followers, {len(posts)} posts")
    return {
        "username": profile.get("username"),
        "followers": profile.get("followers_count", 0),
        "posts": profile.get("media_count", 0),
        "account_type": profile.get("account_type"),
        "media": posts,
        "scraped_at": datetime.utcnow().isoformat(),
    }
except Exception as e:
    log(f"Instagram error: {e}")
    return None
```

# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
log(“KrapMaps nightly scraper starting…”)
result = {
“scraped_at”: datetime.utcnow().isoformat(),
“tiktok”: None,
“instagram”: None,
}

```
# Instagram (no browser needed)
result["instagram"] = fetch_instagram(INSTAGRAM_TOKEN)

# TikTok (needs browser)
if not TIKTOK_USERNAME or not TIKTOK_PASSWORD:
    log("No TikTok credentials — skipping TikTok scrape")
else:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()
        try:
            result["tiktok"] = scrape_tiktok(page)
        except Exception as e:
            log(f"TikTok scrape failed: {e}")
            result["tiktok"] = None
        finally:
            browser.close()

# Save result
with open(OUTPUT_FILE, "w") as f:
    json.dump(result, f, indent=2)
log(f"Saved to {OUTPUT_FILE}")

# Print summary
if result["tiktok"]:
    acc = result["tiktok"]["account"]
    vids = result["tiktok"]["videos"]
    log(f"TikTok: {acc.get('followers',0)} followers, {len(vids)} videos")
if result["instagram"]:
    ig = result["instagram"]
    log(f"Instagram: {ig.get('followers',0)} followers, {len(ig.get('media',[]))} posts")

log("Done.")
```

if **name** == “**main**”:
main()
