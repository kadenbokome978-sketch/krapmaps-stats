import os
import json
import time
import re
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

INSTAGRAM_TOKEN   = os.environ.get("INSTAGRAM_TOKEN", "")
APPLE_KEY_ID      = os.environ.get("APPLE_KEY_ID", "")
APPLE_ISSUER_ID   = os.environ.get("APPLE_ISSUER_ID", "")
APPLE_PRIVATE_KEY = os.environ.get("APPLE_PRIVATE_KEY", "")
SUPABASE_URL      = os.environ.get("SUPABASE_URL", "https://xiudsyiinkqtmowkiqxh.supabase.co")
SUPABASE_KEY      = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdWRzeWlpbmtxdG1vd2tpcXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NzU5OTcsImV4cCI6MjA4OTQ1MTk5N30.8aHpQIcEcrDXo9DJN52SWAOee-rrkp-ti00h72-_sZE")
APIFY_TOKEN       = os.environ.get("APIFY_TOKEN", "apify_api_rEkdgJty82n38lzD57IBeX18yX3SPC3uHsmQ")
TIKTOK_HANDLE     = "findkrap"
OUTPUT_FILE       = "krapmaps_stats.json"

def log(msg):
    print("[" + datetime.now().strftime("%H:%M:%S") + "] " + str(msg))

def sb_request(method, path, data=None, extra_headers=None):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(
        SUPABASE_URL + path,
        data=json.dumps(data).encode() if data else None,
        headers=headers,
        method=method
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        body = r.read()
        return json.loads(body) if body else {}

def run_apify_scraper():
    log("Running Apify TikTok scraper for @" + TIKTOK_HANDLE + "...")
    try:
        run_input = {
            "profiles": ["https://www.tiktok.com/@" + TIKTOK_HANDLE],
            "resultsPerPage": 50,
            "shouldDownloadVideos": False,
            "shouldDownloadCovers": False,
        }
        data = json.dumps(run_input).encode()
        req = urllib.request.Request(
            "https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs?token=" + APIFY_TOKEN,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            run = json.loads(r.read())

        run_id = run["data"]["id"]
        dataset_id = run["data"]["defaultDatasetId"]
        log("Run started: " + run_id)

        for attempt in range(18):
            time.sleep(10)
            status_req = urllib.request.Request(
                "https://api.apify.com/v2/actor-runs/" + run_id + "?token=" + APIFY_TOKEN
            )
            with urllib.request.urlopen(status_req, timeout=15) as r:
                status = json.loads(r.read())
            state = status["data"]["status"]
            log("Status: " + state + " (" + str((attempt+1)*10) + "s)")
            if state in ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]:
                break

        if state != "SUCCEEDED":
            log("Apify run did not succeed: " + state)
            return None

        items_req = urllib.request.Request(
            "https://api.apify.com/v2/datasets/" + dataset_id + "/items?token=" + APIFY_TOKEN + "&limit=50"
        )
        with urllib.request.urlopen(items_req, timeout=15) as r:
            items = json.loads(r.read())

        log("Apify returned " + str(len(items)) + " videos")
        return items
    except Exception as e:
        log("Apify error: " + str(e))
        return None

def detect_hook(caption):
    if not caption: return "other"
    c = caption.lower()
    if any(w in c for w in ["pov:", "pov you", "imagine"]): return "achievement"
    if any(w in c for w in ["challenge", "i tried", "minute"]): return "challenge"
    if any(w in c for w in ["you need", "if you", "when you", "holding rubbish", "no bin", "cant find"]): return "problem->solution"
    if any(w in c for w in ["rating", "ranking", "rate", "/10", "score"]): return "gamification"
    if any(w in c for w in ["reaction", "reacted"]): return "reaction"
    if any(w in c for w in ["how to", "tutorial"]): return "demo"
    if any(w in c for w in ["controversial", "unpopular", "hot take"]): return "edgy/controversial"
    return "other"

def detect_type(caption):
    if not caption: return "facecam"
    c = caption.lower()
    if any(w in c for w in ["screen", "app", "game", "playing", "score", "points"]): return "screencap"
    if any(w in c for w in ["street", "outside", "found", "city", "walking"]): return "street"
    return "facecam"

def process_apify_videos(items):
    videos = []
    for item in items:
        try:
            caption = item.get("text") or item.get("desc") or ""
            created_iso = item.get("createTimeISO") or ""
            date_str = created_iso[:10] if created_iso else ""
            video = {
                "id":       item.get("id") or str(int(time.time() * 1000)),
                "title":    caption[:120] if caption else "Untitled",
                "date":     date_str,
                "views":    int(item.get("playCount") or 0),
                "likes":    int(item.get("diggCount") or 0),
                "comments": int(item.get("commentCount") or 0),
                "shares":   int(item.get("shareCount") or 0),
                "saves":    int(item.get("collectCount") or 0),
                "hook":     detect_hook(caption),
                "type":     detect_type(caption),
                "promoted": False,
                "crossPost": False,
                "notes":    "",
                "url":      item.get("webVideoUrl") or "",
                "_source":  "apify",
                "_scraped": datetime.utcnow().isoformat(),
            }
            videos.append(video)
        except Exception as e:
            log("Video error: " + str(e))
    log("Processed " + str(len(videos)) + " videos")
    return videos

def load_existing_videos():
    try:
        result = sb_request("GET", "/rest/v1/km_videos?order=updated_at.desc&limit=1",
                            extra_headers={"Prefer": ""})
        if result and len(result) > 0:
            data = json.loads(result[0]["value"])
            if isinstance(data, list):
                log("Loaded " + str(len(data)) + " existing videos")
                return data
    except Exception as e:
        log("Load videos error: " + str(e))
    return []

def merge_videos(existing, fresh):
    existing_by_id = {str(v.get("id","")): v for v in existing if v.get("id")}
    updated = 0
    added = 0
    now = datetime.utcnow()

    for fv in fresh:
        vid_id = str(fv.get("id",""))
        if not vid_id: continue

        if vid_id in existing_by_id:
            ev = existing_by_id[vid_id]
            date_str = fv.get("date","")
            if date_str:
                try:
                    posted = datetime.strptime(date_str, "%Y-%m-%d")
                    hours_since = (now - posted).total_seconds() / 3600
                    if 20 <= hours_since <= 48 and not ev.get("_updated"):
                        ev["views"]    = fv["views"]
                        ev["likes"]    = fv["likes"]
                        ev["comments"] = fv["comments"]
                        ev["shares"]   = fv["shares"]
                        ev["_updated"] = date_str
                        ev["_auto_updated"] = True
                        updated += 1
                        log("24hr update: " + ev["title"][:50])
                except: pass
        else:
            added += 1
            log("New video: " + fv["title"][:60])
            existing_by_id[vid_id] = fv

    log(str(added) + " new videos, " + str(updated) + " auto 24hr updates")
    merged = list(existing_by_id.values())
    merged.sort(key=lambda v: v.get("date",""), reverse=True)
    return merged

def save_videos(videos):
    try:
        sb_request("POST", "/rest/v1/km_videos", {
            "id": 1,
            "value": json.dumps(videos),
            "updated_at": datetime.utcnow().isoformat()
        })
        log("Saved " + str(len(videos)) + " videos to Supabase")
    except Exception as e:
        log("Save videos error: " + str(e))

def scrape_tiktok_profile():
    log("Fetching TikTok profile...")
    try:
        url = "https://www.tiktok.com/@" + TIKTOK_HANDLE
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode("utf-8", errors="ignore")
        followers = re.search(r'"followerCount":(\d+)', html)
        likes     = re.search(r'"heartCount":(\d+)', html)
        videos    = re.search(r'"videoCount":(\d+)', html)
        result = {
            "followers":   int(followers.group(1)) if followers else 0,
            "total_likes": int(likes.group(1)) if likes else 0,
            "video_count": int(videos.group(1)) if videos else 0,
            "scraped_at":  datetime.utcnow().isoformat(),
        }
        log("TikTok: " + str(result["followers"]) + " followers")
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
        url = "https://graph.instagram.com/me?fields=id,username,media_count,followers_count&access_token=" + token
        with urllib.request.urlopen(url, timeout=10) as r:
            profile = json.loads(r.read())
        url2 = "https://graph.instagram.com/me/media?fields=id,caption,media_type,timestamp,like_count,comments_count,video_views&access_token=" + token + "&limit=20"
        with urllib.request.urlopen(url2, timeout=10) as r:
            media = json.loads(r.read())
        posts = [{"id":p.get("id"),"caption":(p.get("caption") or "")[:80],"media_type":p.get("media_type"),"date":(p.get("timestamp") or "")[:10],"likes":p.get("like_count",0),"comments":p.get("comments_count",0),"views":p.get("video_views",0)} for p in media.get("data",[])]
        log("Instagram: " + str(profile.get("followers_count",0)) + " followers")
        return {"username":profile.get("username"),"followers":profile.get("followers_count",0),"posts":profile.get("media_count",0),"media":posts,"scraped_at":datetime.utcnow().isoformat()}
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
        header  = base64.urlsafe_b64encode(json.dumps({"alg":"ES256","kid":key_id,"typ":"JWT"}).encode()).rstrip(b"=").decode()
        now     = int(time.time())
        payload = base64.urlsafe_b64encode(json.dumps({"iss":issuer_id,"iat":now,"exp":now+1200,"aud":"appstoreconnect-v1"}).encode()).rstrip(b"=").decode()
        message = header + "." + payload
        signature = private_key.sign(message.encode(), ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(signature)
        return message + "." + base64.urlsafe_b64encode(r.to_bytes(32,"big") + s.to_bytes(32,"big")).rstrip(b"=").decode()
    except Exception as e:
        log("JWT error: " + str(e))
        return None

def fetch_appstore(key_id, issuer_id, private_key):
    if not key_id or not issuer_id or not private_key:
        log("No App Store keys")
        return None
    log("Fetching App Store...")
    try:
        key   = private_key.strip().replace("\\n", "\n")
        token = make_apple_jwt(key_id, issuer_id, key)
        if not token: return None
        req = urllib.request.Request("https://api.appstoreconnect.apple.com/v1/apps",
            headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"})
        with urllib.request.urlopen(req, timeout=15) as r:
            apps = json.loads(r.read()).get("data",[])
        if not apps: return None
        app = apps[0]
        log("App Store: " + app["attributes"].get("name",""))
        return {"app_id":app["id"],"app_name":app["attributes"].get("name","KrapMaps"),"bundle_id":app["attributes"].get("bundleId",""),"scraped_at":datetime.utcnow().isoformat()}
    except Exception as e:
        log("App Store error: " + str(e))
        return None

def push_stats_to_supabase(result):
    log("Pushing stats...")
    try:
        sb_request("POST", "/rest/v1/km_scraped_stats", {"id":1,"value":json.dumps(result),"updated_at":datetime.utcnow().isoformat()})
        log("Stats pushed OK")
    except Exception as e:
        log("Stats push error: " + str(e))

def main():
    log("KrapMaps scraper starting...")
    result = {"scraped_at":datetime.utcnow().isoformat(),"tiktok":None,"instagram":None,"appstore":None}

    result["tiktok"]    = scrape_tiktok_profile()
    result["instagram"] = fetch_instagram(INSTAGRAM_TOKEN)
    result["appstore"]  = fetch_appstore(APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_PRIVATE_KEY)

    apify_items = run_apify_scraper()
    if apify_items:
        fresh    = process_apify_videos(apify_items)
        existing = load_existing_videos()
        merged   = merge_videos(existing, fresh)
        save_videos(merged)
        if result["tiktok"]:
            result["tiktok"]["video_count"] = len(merged)

    with open(OUTPUT_FILE, "w") as f:
        json.dump(result, f, indent=2)
    with open("last_run.txt", "w") as f:
        f.write(datetime.utcnow().isoformat())

    push_stats_to_supabase(result)

    log("--- DONE ---")
    if result["tiktok"]:  log("TikTok: " + str(result["tiktok"].get("followers",0)) + " followers")
    if apify_items:       log("Videos: " + str(len(apify_items)) + " scraped")
    if result["instagram"]: log("Instagram: " + str(result["instagram"].get("followers",0)) + " followers")

if __name__ == "__main__":
    main()
