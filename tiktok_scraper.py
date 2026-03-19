import os
import json
import time
import re
import urllib.request
import urllib.parse
from datetime import datetime

INSTAGRAM_TOKEN = os.environ.get("INSTAGRAM_TOKEN", "")
APPLE_KEY_ID = os.environ.get("APPLE_KEY_ID", "")
APPLE_ISSUER_ID = os.environ.get("APPLE_ISSUER_ID", "")
APPLE_PRIVATE_KEY = os.environ.get("APPLE_PRIVATE_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://xiudsyiinkqtmowkiqxh.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdWRzeWlpbmtxdG1vd2tpcXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NzU5OTcsImV4cCI6MjA4OTQ1MTk5N30.8aHpQIcEcrDXo9DJN52SWAOee-rrkp-ti00h72-_sZE")
OUTPUT_FILE = "krapmaps_stats.json"
TIKTOK_HANDLE = "findkrap"

def log(msg):
    print("[" + datetime.now().strftime("%H:%M:%S") + "] " + str(msg))

def parse_count(text):
    if not text:
        return 0
    text = str(text).strip().replace(",", "").replace(" ", "")
    try:
        if text.upper().endswith("K"):
            return int(float(text[:-1]) * 1000)
        if text.upper().endswith("M"):
            return int(float(text[:-1]) * 1000000)
        return int(float(text))
    except Exception:
        return 0

def scrape_tiktok_profile():
    log("Fetching TikTok profile...")
    try:
        url = "https://www.tiktok.com/@" + TIKTOK_HANDLE
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml",
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="ignore")
        followers = re.search(r'"followerCount":(\d+)', html)
        likes = re.search(r'"heartCount":(\d+)', html)
        videos = re.search(r'"videoCount":(\d+)', html)
        # Total views shown on public profile
        views = re.search(r'"playCount":(\d+)', html)
        if not views:
            views = re.search(r'"viewerCount":(\d+)', html)
        if not views:
            views = re.search(r'"statsV2".*?"playCount":"(\d+)"', html)
        result = {
            "followers": int(followers.group(1)) if followers else 0,
            "total_likes": int(likes.group(1)) if likes else 0,
            "video_count": int(videos.group(1)) if videos else 0,
            "total_views": int(views.group(1)) if views else 0,
            "scraped_at": datetime.utcnow().isoformat(),
        }
        log("TikTok: " + str(result["followers"]) + " followers, " + str(result["total_views"]) + " views")
        return result
    except Exception as e:
        log("TikTok error: " + str(e))
        return None

def fetch_instagram(token):
    if not token:
        log("No Instagram token")
        return None
    log("Fetching Instagram...")
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
        log("Instagram: " + str(profile.get("followers_count", 0)) + " followers")
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

def make_apple_jwt(key_id, issuer_id, private_key_pem):
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
        import base64
        private_key = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
        header = base64.urlsafe_b64encode(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}).encode()).rstrip(b"=").decode()
        now = int(time.time())
        payload = base64.urlsafe_b64encode(json.dumps({"iss": issuer_id, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"}).encode()).rstrip(b"=").decode()
        message = header + "." + payload
        signature = private_key.sign(message.encode(), ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(signature)
        raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")
        sig_b64 = base64.urlsafe_b64encode(raw_sig).rstrip(b"=").decode()
        return message + "." + sig_b64
    except Exception as e:
        log("JWT error: " + str(e))
        return None

def fetch_appstore(key_id, issuer_id, private_key):
    if not key_id or not issuer_id or not private_key:
        log("No App Store keys")
        return None
    log("Fetching App Store...")
    try:
        key = private_key.strip()
        if "\\n" in key:
            key = key.replace("\\n", "\n")
        token = make_apple_jwt(key_id, issuer_id, key)
        if not token:
            return None
        headers = {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        }
        req = urllib.request.Request(
            "https://api.appstoreconnect.apple.com/v1/apps",
            headers=headers
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            apps_data = json.loads(r.read())
        apps = apps_data.get("data", [])
        if not apps:
            log("No apps found")
            return None
        app = apps[0]
        app_id = app["id"]
        app_name = app["attributes"].get("name", "KrapMaps")
        log("Found: " + app_name)
        return {
            "app_id": app_id,
            "app_name": app_name,
            "bundle_id": app["attributes"].get("bundleId", ""),
            "scraped_at": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        log("App Store error: " + str(e))
        return None

def push_to_supabase(result):
    if not SUPABASE_URL or not SUPABASE_KEY:
        log("No Supabase config")
        return
    log("Pushing to Supabase...")
    try:
        data = json.dumps({
            "id": 1,
            "value": json.dumps(result),
            "updated_at": datetime.utcnow().isoformat()
        }).encode()
        req = urllib.request.Request(
            SUPABASE_URL + "/rest/v1/km_scraped_stats",
            data=data,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": "Bearer " + SUPABASE_KEY,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            log("Supabase updated: " + str(r.status))
    except Exception as e:
        log("Supabase error: " + str(e))

def main():
    log("KrapMaps scraper starting...")
    result = {
        "scraped_at": datetime.utcnow().isoformat(),
        "tiktok": None,
        "instagram": None,
        "appstore": None,
    }
    result["instagram"] = fetch_instagram(INSTAGRAM_TOKEN)
    result["tiktok"] = scrape_tiktok_profile()
    result["appstore"] = fetch_appstore(APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_PRIVATE_KEY)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(result, f, indent=2)
    push_to_supabase(result)
    log("Saved.")
    if result["tiktok"]:
        log("TikTok: " + str(result["tiktok"].get("followers", 0)) + " followers, " + str(result["tiktok"].get("total_views", 0)) + " views")
    if result["instagram"]:
        log("Instagram: " + str(result["instagram"].get("followers", 0)) + " followers")
    if result["appstore"]:
        log("App Store: " + str(result["appstore"].get("app_name", "")))
    log("Done.")

if __name__ == "__main__":
    main()
