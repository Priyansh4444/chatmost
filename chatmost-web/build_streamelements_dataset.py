import urllib.request
import json
import os

def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.loads(res.read().decode("utf-8"))

def main():
    print("Fetching StreamElements stats for jo2uke...")
    try:
        stats_raw = fetch_json("https://api.streamelements.com/kappa/v2/chatstats/jo2uke/stats")
    except Exception as e:
        print(f"Error fetching live API: {e}")
        return

    total_messages = stats_raw.get("totalMessages", 1502696)
    unique_chatters = stats_raw.get("uniqueChatters", 2230)
    chatters_list = stats_raw.get("chatters", [])
    commands_list = stats_raw.get("commands", [])
    hashtags_list = stats_raw.get("hashtags", [])

    # Process Emotes
    seven_tv = []
    for item in stats_raw.get("sevenTVEmotes", []):
        eid = item.get("id")
        name = item.get("emote")
        amount = item.get("amount", 0)
        url = f"https://cdn.7tv.app/emote/{eid}/2x.webp" if eid else None
        seven_tv.append({
            "id": eid,
            "kind": "7tv",
            "kindLabel": "7TV Emote",
            "name": name,
            "total": amount,
            "url": url
        })

    twitch = []
    for item in stats_raw.get("twitchEmotes", []):
        eid = item.get("id")
        name = item.get("emote")
        amount = item.get("amount", 0)
        if eid and str(eid).startswith("emotesv2_"):
            url = f"https://static-cdn.jtvnw.net/emoticons/v2/{eid}/default/dark/2.0"
        elif eid:
            url = f"https://static-cdn.jtvnw.net/emoticons/v1/{eid}/2.0"
        else:
            url = None
        twitch.append({
            "id": eid,
            "kind": "twitch",
            "kindLabel": "Twitch Emote",
            "name": name,
            "total": amount,
            "url": url
        })

    bttv = []
    for item in stats_raw.get("bttvEmotes", []):
        eid = item.get("id")
        name = item.get("emote")
        amount = item.get("amount", 0)
        url = f"https://cdn.betterttv.net/emote/{eid}/2x.webp" if eid else None
        bttv.append({
            "id": eid,
            "kind": "bttv",
            "kindLabel": "BTTV Emote",
            "name": name,
            "total": amount,
            "url": url
        })

    ffz = []
    for item in stats_raw.get("ffzEmotes", []):
        eid = item.get("id")
        name = item.get("emote")
        amount = item.get("amount", 0)
        url = f"https://cdn.frankerfacez.com/emote/{eid}/2" if eid else None
        ffz.append({
            "id": eid,
            "kind": "ffz",
            "kindLabel": "FFZ Emote",
            "name": name,
            "total": amount,
            "url": url
        })

    chatters = []
    for idx, c in enumerate(chatters_list):
        name = c.get("name", "")
        amount = c.get("amount", 0)
        chatters.append({
            "rank": idx + 1,
            "login": name.lower(),
            "displayName": name,
            "messages": amount
        })

    out_dataset = {
        "stats": {
            "channel": "jo2uke",
            "source": "StreamElements Official Chat Stats",
            "dateRange": "StreamElements All-Time Live Records (1.5M+ messages)",
            "messages": total_messages,
            "chatters": unique_chatters,
            "targets": len(seven_tv) + len(twitch) + len(bttv) + len(ffz),
            "topChatters": chatters[:100],
            "top7tv": seven_tv[:100],
            "topTwitch": twitch[:100],
            "topBttv": bttv[:100],
            "topFfz": ffz[:100],
            "topCommands": commands_list[:100],
            "topHashtags": hashtags_list[:25]
        },
        "chatters": chatters,
        "emotes": {
            "7tv": seven_tv,
            "twitch": twitch,
            "bttv": bttv,
            "ffz": ffz
        },
        "commands": commands_list
    }

    json_path = "/home/pronsh/Coding/joshing-around/chatmost-web/web/src/data/streamelements-dataset.json"
    os.makedirs(os.path.dirname(json_path), exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(out_dataset, f, indent=2)
    
    print(f"Created StreamElements dataset at {json_path}")

if __name__ == "__main__":
    main()
