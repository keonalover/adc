import argparse
import json
import os
import re
import tempfile
from pathlib import Path
from urllib.parse import unquote

from cluster import build_outputs, slug, clean, normalize_address, optional_float, optional_int


STATE_NAME_TO_CODE = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "district of columbia": "DC",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
}


def parse_args():
    parser = argparse.ArgumentParser(description="Ingest Apify Google Places exports.")
    parser.add_argument("apify_export", help="Path to the Apify export JSON file.")
    parser.add_argument("output_dir", help="Directory where candidate outputs will be written.")
    parser.add_argument("--state", help="Fallback 2-letter state code.", default="")
    parser.add_argument("--min-rating", type=float, default=None)
    parser.add_argument("--min-review-count", type=int, default=None)
    return parser.parse_args()


def normalize_state(value, fallback=""):
    text = clean(value)
    if len(text) == 2:
        return text.upper()
    if text.lower() in STATE_NAME_TO_CODE:
        return STATE_NAME_TO_CODE[text.lower()]
    return clean(fallback).upper() if fallback else ""


def load_items(path):
    with Path(path).open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("items", "results"):
            if isinstance(data.get(key), list):
                return data[key]
    raise ValueError("Expected a top-level list or an object with an items/results list.")


def place_id_from_url(url):
    match = re.search(r"query_place_id=([^&]+)", clean(url))
    return unquote(match.group(1)) if match else ""


def map_record(record, fallback_state):
    state2 = normalize_state(record.get("state"), fallback_state)
    address = ", ".join(
        part
        for part in (
            clean(record.get("street")),
            clean(record.get("city")),
            state2,
        )
        if part
    )
    return {
        "displayName": clean(record.get("title")),
        "websiteUri": clean(record.get("website")),
        "rating": optional_float(record.get("totalScore")),
        "userRatingCount": optional_int(record.get("reviewsCount")),
        "formattedAddress": address,
        "id": place_id_from_url(record.get("url")),
        "_queryCity": clean(record.get("city")),
        "_queryState": state2,
    }


def dedupe_places(places):
    deduped = []
    seen = set()
    dropped = 0
    for place in places:
        place_id = clean(place.get("id"))
        if place_id:
            key = place_id
        else:
            key = f"{slug(place.get('displayName'))}|{normalize_address(place.get('formattedAddress'))}"
        if key in seen:
            dropped += 1
            continue
        seen.add(key)
        deduped.append(place)
    return deduped, dropped


def output_dir_path(value):
    text = clean(value)
    if os.name == "nt":
        normalized = text.replace("\\", "/")
        if normalized == "/tmp" or normalized.startswith("/tmp/"):
            suffix = normalized[len("/tmp"):].lstrip("/")
            base = Path(tempfile.gettempdir())
            return base / suffix if suffix else base
    return Path(value)


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    args = parse_args()
    items = load_items(args.apify_export)
    fallback_state = (args.state or "").upper()
    places = [map_record(record, fallback_state) for record in items]
    deduped_places, duplicates_dropped = dedupe_places(places)

    candidates, skipped = build_outputs(
        deduped_places,
        fallback_state,
        args.min_rating,
        args.min_review_count,
        False,
        source="apify",
    )

    output_dir = output_dir_path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    candidates_path = output_dir / "candidates.json"
    skipped_path = output_dir / "candidates-skipped.json"
    write_json(candidates_path, candidates)
    write_json(skipped_path, skipped)

    clustered_place_count = sum(candidate["placeCount"] for candidate in candidates)
    skipped_count = max(len(deduped_places) - clustered_place_count, 0)

    print(f"items read: {len(items)}")
    print(f"after dedup: {len(deduped_places)}")
    print(f"duplicates dropped: {duplicates_dropped}")
    print(f"candidates kept: {len(candidates)}")
    print(f"skipped count: {skipped_count}")
    print(f"wrote candidates: {candidates_path}")
    print(f"wrote skipped: {skipped_path}")


if __name__ == "__main__":
    main()
