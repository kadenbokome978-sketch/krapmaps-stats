# KrapMaps Nightly Stats Scraper

# Runs on GitHub Actions every night at midnight.

# Scrapes TikTok Creator Studio + Instagram API then saves to krapmaps_stats.json

import os
import json
import time
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

TIKTOK_USERNAME = os.environ.get(“TIKTOK_USERNAME”, “”)
TIKTOK_PASSWORD = os.environ.get(“TIKTOK_PASSWORD”, “”)
INSTAGRAM_TOKEN = os.environ.get(“INSTAGRAM_TOKEN”, “”)
OUTPUT_FILE = “krapmaps_stats.json”

def parse_count(text):
if not text:
return 0
text = str(text).strip().replace(”,”, “”)
try:
if text.upper().endswith(“K”):
return int(float(text[:-1]) * 1000)
if text.upper().endswith(“M”):
return int(float(text[:-1]) * 1000000)
return int(float(text))
except (ValueError, TypeError):
return 0

def log(msg):
print(”[” + datetime.now().strftime(”%H:%M:%S”) + “] “ + msg)

def today_str():
return datetime.utcnow().strftime(”%Y-%m-%d”)

def scrape_tiktok(page):
log(“Navigating to TikTok login…”)
page.goto(“https://www.tiktok.com/login/phone-or-email/email”, wait_until=“networkidle”, timeout=30000)
time.sleep(2)

```
try:
    page.fill('input[name="username"]', TIKTOK_USERNAME)
    time.sleep(0.5)
    page.fill('input[type="password"]', TIKTOK_PASSWORD)
    time.sleep(0.5)
    page.click('button[type="submit"]')
    log("Login submitted, waiting...")
    time.sleep(5)
except Exception as e:
    log("Login form error: " + str(e))
    raise

if page.query_selector('[id*="captcha"], [class*="captcha"]'):
    log("CAPTCHA detected - saving empty stats.")
    return None

try:
    page.wait_for_url(lambda url: "tiktok.com" in url and "login" not in url, timeout=15000)
    log("Login successful")
except PlaywrightTimeout:
    log("Login may have failed or requires verification")
    return None

account_stats = {
    "followers": 0,
    "total_likes": 0,
    "total_views": 0,
    "scraped_at": datetime.utcnow().isoformat(),
}

try:
    page.goto("https://www.tiktok.com/@findkrap", wait_until="networkidle", timeout=20000)
    time.sleep(2)
    stats_els = page.query_selector_all('[data-e2e="followers-count"], [class*="CountInfos"]')
    for el in stats_els:
        text = el.inner_text().strip()
        if text:
            account_stats["followers"] = parse_count(text)
            log("Followers: " + str(account_stats["followers"]))
            break
except Exception as e:
    log("Account stats error: " + str(e))

log("Scraping video analytics...")
page.goto("https://www.tiktok.com/creator-studio/analytics/post", wait_until="networkidle", timeout=30000)
time.sleep(3)

videos = []
try:
    for _ in range(5):
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(1.5)

    rows = page.query_selector_all("tr")
    for row in rows[:30]:
        try:
            cells = row.query_selector_all("td")
            if len(cells) >= 3:
                texts = [c.inner_text().strip() for c in cells]
                numbers = [parse_count(t) for t in texts]
                video_data = {
                    "title": texts[0][:80] if texts[0] else "",
                    "views": numbers[1] if len(numbers) > 1 else 0,
                    "likes": numbers[2] if len(numbers) > 2 else 0,
                    "comments": numbers[3] if len(numbers) > 3 else 0,
                    "shares": numbers[4] if len(numbers) > 4 else 0,
                    "date": today_str(),
                    "scraped_at": datetime.utcnow().isoformat(),
                }
                if video_data["views"] > 0 or video_data["title"]:
                    videos.append(video_data)
        except Exception:
            continue

    account_stats["total_views"] = sum(v.get("views", 0) for v in videos)
    account_stats["total_likes"] = sum(v.get("likes", 0) for v in videos)

except Exception as e:
    log("Video scraping error: " + str(e))

log("Scraped " + str(len(videos)) + " videos")
return {"account": account_stats, "videos": videos}
```

def fetch_instagram(token):
if not token:
log(“No Instagram token - skipping”)
return None

```
import urllib.request
log("Fetching Instagram stats...")
try:
    url = "https://graph.instagram.com/me?fields=id,username,media_count,followers_count,account_type&access_token=" + token
    with urllib.request.urlopen(url, timeout=10) as r:
        profile = json.loads(r.read())

    url2 = "https://graph.instagram.com/me/media?fields=id,caption,media_type,timestamp,like_count,comments_count,video_views&access_token=" + token + "&limit=20"
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

    log("Instagram: " + str(profile.get("followers_count", "?")) + " followers")
    return {
        "username": profile.get("username"),
        "followers": profile.get("followers_count", 0),
        "posts": profile.get("media_count", 0),
        "account_type": profile.get("account_type"),
        "media": posts,
        "scraped_at": datetime.utcnow().isoformat(),
    }
except Exception as e:
    log("Instagram error: " + str(e))
    return None
```

def main():
log(“KrapMaps nightly scraper starting…”)
result = {
“scraped_at”: datetime.utcnow().isoformat(),
“tiktok”: None,
“instagram”: None,
}

```
result["instagram"] = fetch_instagram(INSTAGRAM_TOKEN)

if not TIKTOK_USERNAME or not TIKTOK_PASSWORD:
    log("No TikTok credentials - skipping TikTok scrape")
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
            log("TikTok scrape failed: " + str(e))
            result["tiktok"] = None
        finally:
            browser.close()

with open(OUTPUT_FILE, "w") as f:
    json.dump(result, f, indent=2)
log("Saved to " + OUTPUT_FILE)

if result["tiktok"]:
    acc = result["tiktok"]["account"]
    vids = result["tiktok"]["videos"]
    log("TikTok: " + str(acc.get("followers", 0)) + " followers, " + str(len(vids)) + " videos")
if result["instagram"]:
    ig = result["instagram"]
    log("Instagram: " + str(ig.get("followers", 0)) + " followers")

log("Done.")
```

if **name** == “**main**”:
main()
