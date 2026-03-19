import os
import json
import time
import base64
import hashlib
import hmac
import struct
import urllib.request
import urllib.parse
from datetime import datetime

TIKTOK_USERNAME = os.environ.get("TIKTOK_USERNAME", "")
TIKTOK_PASSWORD = os.environ.get("TIKTOK_PASSWORD", "")
INSTAGRAM_TOKEN = os.environ.get("INSTAGRAM_TOKEN", "")
APPLE_KEY_ID = os.environ.get("APPLE_KEY_ID", "")
APPLE_ISSUER_ID = os.environ.get("APPLE_ISSUER_ID", "")
APPLE_PRIVATE_KEY = os.environ.get("APPLE_PRIVATE_KEY", "")
OUTPUT_FILE = "krapmaps_stats.json"
TIKTOK_HANDLE = "findkrap"

def log(msg):
    print("[" + datetime.now().strftime("%H:%M:%S") + "] " + str(msg))

def today_str():
    return datetime.utcnow().strftime("%Y-%m-%d")

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
    # Build JWT header and payload
    header = base64.urlsafe_b64encode(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}).encode()).rstrip(b"=").decode()
    now = int(time.time())
    payload = base64.urlsafe_b64encode(json.dumps({"iss": issuer_id, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"}).encode()).rstrip(b"=").decode()
    message = header + "." + payload
    # Sign with ES256 using cryptography library
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        private_key = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
        signature = private_key.sign(message.encode(), ec.ECDSA(hashes.SHA256()))
        # Convert DER signature to raw r+s format
        from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
        r, s = decode_dss_signature(signature)
        raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")
        sig_b64 = base64.urlsafe_b64encode(raw_sig).rstrip(b"=").decode()
        return message + "." + sig_b64
    except Exception as e:
        log("JWT signing error: " + str(e))
        return None

def fetch_appstore(key_id, issuer_id, private_key):
    if not key_id or not issuer_id or not private_key:
        log("No App Store keys")
        return None
    log("Fetching App Store stats...")
    try:
        token = make_apple_jwt(key_id, issuer_id, private_key)
        if not token:
            return None
        # Get app info
        headers = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
        req = urllib.request.Request("https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=app.krapmaps", headers=headers)
        with urllib.request.urlopen(req, timeout=15) as r:
            apps_data = json.loads(r.read())
        apps = apps_data.get("data", [])
        if not apps:
            log("No apps found")
            return None
        app_id = apps[0]["id"]
        app_name = apps[0]["attributes"].get("name", "KrapMaps")
        log("Found app: " + app_name + " id: " + app_id)
        # Get sales summary - last 7 days
        end = datetime.utcnow().strftime("%Y-%m-%d")
        req2 = urllib.request.Request(
            "https://api.appstoreconnect.apple.com/v1/salesReports?filter[frequency]=DAILY&filter[reportDate]=" + end + "&filter[reportType]=SALES&filter[vendorNumber]=&filter[version]=1_0",
            headers=headers
        )
        # Try to get installs from analytics
        req3 = urllib.request.Request(
            "https://api.appstoreconnect.apple.com/v1/apps/" + app_id + "/appStoreVersions",
            headers=headers
        )
        with urllib.request.urlopen(req3, timeout=15) as r:
            versions = json.loads(r.read())
        log("App Store connected successfully")
        return {
            "app_id": app_id,
            "app_name": app_name,
            "scraped_at": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        log("App Store error: " + str(e))
        return None

def scrape_tiktok_profile():
    log("Fetching TikTok profile via oEmbed...")
    try:
        url = "https://www.tiktok.com/oembed?url=https://www.tiktok.com/@" + TIKTOK_HANDLE
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        log("TikTok oEmbed: " + str(data.get("author_name", "")))
        return {"author_name": data.get("author_name"), "scraped_at": datetime.utcnow().isoformat()}
    except Exception as e:
        log("TikTok oEmbed error: " + str(e))

    log("Trying TikTok profile page...")
    try:
        url = "https://www.tiktok.com/@" + TIKTOK_HANDLE
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
            "Accept": "text/html",
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="ignore")
        import re
        followers = re.search(r'"followerCount":(\d+)', html)
        likes = re.search(r'"heartCount":(\d+)', html)
        videos = re.search(r'"videoCount":(\d+)', html)
        result = {
            "followers": int(followers.group(1)) if followers else 0,
            "total_likes": int(likes.group(1)) if likes else 0,
            "video_count": int(videos.group(1)) if videos else 0,
            "scraped_at": datetime.utcnow().isoformat(),
        }
        log("TikTok profile: " + str(result["followers"]) + " followers")
        return result
    except Exception as e:
        log("TikTok profile error: " + str(e))
        return None

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

    log("Saved to " + OUTPUT_FILE)
    if result["tiktok"]:
        log("TikTok: " + str(result["tiktok"].get("followers", 0)) + " followers")
    if result["instagram"]:
        log("Instagram: " + str(result["instagram"].get("followers", 0)) + " followers")
    if result["appstore"]:
        log("App Store: connected")
    log("Done.")

if __name__ == "__main__":
    main()
