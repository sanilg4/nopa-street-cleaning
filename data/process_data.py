import json

src_file = "/google/data/rw/personal-agents/sa/sanilg/corpagent-eng-sanilg/.gemini/jetski/brain/89fd7562-2fa2-4d92-a2f4-ad9b87093abc/.system_generated/steps/93/content.md"
dest_file = "/home/corpagent-eng-sanilg/nopa-street-cleaning/data/nopa_segments.json"

with open(src_file, "r") as f:
    raw = f.read()

start_idx = raw.find("[{")
records = json.loads(raw[start_idx:])

cleaned = []
for r in records:
    line_geom = r.get("line")
    if not line_geom or line_geom.get("type") != "LineString":
        continue
    coords = line_geom.get("coordinates", [])
    if len(coords) < 2:
        continue
    
    # Clean up limits formatting (remove excessive spaces)
    limits = " ".join(r.get("limits", "").split())
    limits = limits.replace(" - ", " to ")

    item = {
        "id": r.get("blocksweepid", ""),
        "cnn": r.get("cnn", ""),
        "corridor": r.get("corridor", "").strip(),
        "limits": limits,
        "side": r.get("blockside", "").strip(),
        "sideLR": r.get("cnnrightleft", "").strip(),
        "weekday": r.get("weekday", "").strip(),
        "fromHour": int(r.get("fromhour", 0)),
        "toHour": int(r.get("tohour", 0)),
        "fullname": r.get("fullname", "").strip(),
        "week1": r.get("week1") == "1",
        "week2": r.get("week2") == "1",
        "week3": r.get("week3") == "1",
        "week4": r.get("week4") == "1",
        "week5": r.get("week5") == "1",
        "holidays": r.get("holidays") == "1",
        "coordinates": coords
    }
    cleaned.append(item)

with open(dest_file, "w") as f:
    json.dump(cleaned, f, separators=(',', ':'))

print(f"Successfully processed and saved {len(cleaned)} segments to {dest_file}")
