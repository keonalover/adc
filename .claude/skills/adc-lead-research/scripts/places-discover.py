import argparse
import json
import os
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from cluster import build_outputs, clean, optional_float, optional_int, place_name


PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = (
    "places.id,places.displayName,places.websiteUri,places.rating,"
    "places.userRatingCount,places.formattedAddress,places.location,nextPageToken"
)
PROBE_FIELD_MASK = "places.id,places.displayName"
DEFAULT_MAX_API_CALLS = 400
MAX_PAGES_PER_QUERY = 3
STATE_NAMES = {
    "AL": "Alabama",
    "AK": "Alaska",
    "AZ": "Arizona",
    "AR": "Arkansas",
    "CA": "California",
    "CO": "Colorado",
    "CT": "Connecticut",
    "DE": "Delaware",
    "FL": "Florida",
    "GA": "Georgia",
    "HI": "Hawaii",
    "ID": "Idaho",
    "IL": "Illinois",
    "IN": "Indiana",
    "IA": "Iowa",
    "KS": "Kansas",
    "KY": "Kentucky",
    "LA": "Louisiana",
    "ME": "Maine",
    "MD": "Maryland",
    "MA": "Massachusetts",
    "MI": "Michigan",
    "MN": "Minnesota",
    "MS": "Mississippi",
    "MO": "Missouri",
    "MT": "Montana",
    "NE": "Nebraska",
    "NV": "Nevada",
    "NH": "New Hampshire",
    "NJ": "New Jersey",
    "NM": "New Mexico",
    "NY": "New York",
    "NC": "North Carolina",
    "ND": "North Dakota",
    "OH": "Ohio",
    "OK": "Oklahoma",
    "OR": "Oregon",
    "PA": "Pennsylvania",
    "RI": "Rhode Island",
    "SC": "South Carolina",
    "SD": "South Dakota",
    "TN": "Tennessee",
    "TX": "Texas",
    "UT": "Utah",
    "VT": "Vermont",
    "VA": "Virginia",
    "WA": "Washington",
    "WV": "West Virginia",
    "WI": "Wisconsin",
    "WY": "Wyoming",
    "DC": "District of Columbia",
}
def main():
    parser = argparse.ArgumentParser(
        description="Discover independent multi-location F&B operators via Google Places."
    )
    parser.add_argument("brief_json")
    parser.add_argument("output_dir")
    parser.add_argument("--api-key", help="Google Places API key; overrides GOOGLE_PLACES_API_KEY.")
    parser.add_argument(
        "--api-key-placement",
        choices=("header", "query"),
        default="header",
        help="Send the API key in X-Goog-Api-Key or as a URL query parameter.",
    )
    parser.add_argument("--fixture", help="Offline Places responses JSON.")
    parser.add_argument(
        "--probe-only",
        action="store_true",
        help="Make one live Places request using the first brief query, print the result, and exit.",
    )
    args = parser.parse_args()

    brief_path = Path(args.brief_json)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    brief = load_json(brief_path, "brief.json")
    state = clean(brief.get("state")).upper()
    cities = load_cities(brief, state)
    keywords = load_keywords(brief)
    min_rating = optional_float(brief.get("minRating"))
    min_review_count = optional_int(brief.get("minReviewCount"))
    max_api_calls = optional_int(brief.get("maxApiCalls")) or DEFAULT_MAX_API_CALLS
    if max_api_calls < 1:
        raise SystemExit("maxApiCalls must be at least 1.")
    location_pre_count = bool(brief.get("locationPreCount", False))

    api_key = (args.api_key or os.environ.get("GOOGLE_PLACES_API_KEY", "")).strip()
    fixture = load_fixture(args.fixture) if args.fixture else None
    if not api_key and fixture is None:
        raise SystemExit(
            "Set GOOGLE_PLACES_API_KEY, pass --api-key <key>, or pass --fixture <responses.json>."
        )

    state_name = STATE_NAMES.get(state, state)
    if args.probe_only:
        if fixture is not None:
            raise SystemExit("--probe-only is for live API checks; omit --fixture.")
        probe_query = build_text_query(keywords[0], cities[0], state_name, min_rating)
        print(f"probe endpoint: {PLACES_URL}")
        print(f"probe api key placement: {args.api_key_placement}")
        print(f"probe key: length={len(api_key)} last4={api_key[-4:] if len(api_key) >= 4 else api_key}")
        print(f"probe query: {probe_query}")
        response = call_places_api(
            api_key,
            probe_query,
            field_mask=PROBE_FIELD_MASK,
            api_key_placement=args.api_key_placement,
        )
        places = response.get("places", []) or []
        print(f"probe ok: {len(places)} places returned")
        for place in places[:3]:
            print(f"- {place_name(place) or clean(place.get('id'))}")
        return

    collector = PlacesCollector(api_key, fixture, max_api_calls, args.api_key_placement)
    for keyword in keywords:
        for city in cities:
            query = build_text_query(keyword, city, state_name, min_rating)
            page_token = None
            for _ in range(MAX_PAGES_PER_QUERY):
                response = collector.search(query, page_token)
                if response is None:
                    break
                collector.add_response(response, city, state)
                page_token = clean(response.get("nextPageToken"))
                if not page_token or collector.exhausted:
                    break
            if collector.exhausted:
                break
        if collector.exhausted:
            break

    candidates, skipped = build_outputs(
        collector.places,
        state,
        min_rating,
        min_review_count,
        location_pre_count,
        source="google_places",
    )
    write_json(output_dir / "candidates.json", candidates)
    write_json(output_dir / "candidates-skipped.json", skipped)

    skipped_count = len(collector.places) - sum(item["placeCount"] for item in candidates)
    spend = collector.requests / 1000 * 35
    print(f"requests: {collector.requests}")
    print(f"spend: ${spend:.2f}")
    print(f"candidates kept: {len(candidates)}")
    print(f"skipped: {max(skipped_count, 0)}")
    print(f"wrote: {output_dir / 'candidates.json'}")
    print(f"wrote: {output_dir / 'candidates-skipped.json'}")


class PlacesCollector:
    def __init__(self, api_key, fixture, max_api_calls, api_key_placement):
        self.api_key = api_key
        self.fixture = fixture
        self.max_api_calls = max_api_calls
        self.api_key_placement = api_key_placement
        self.requests = 0
        self.exhausted = False
        self.seen_ids = set()
        self.places = []

    def search(self, text_query, page_token=None):
        if self.exhausted:
            return None
        if self.requests >= self.max_api_calls:
            self.exhausted = True
            return None
        self.requests += 1
        if self.fixture is not None:
            return self.fixture.next_response(text_query, page_token)
        return call_places_api(
            self.api_key,
            text_query,
            page_token,
            field_mask=FIELD_MASK,
            api_key_placement=self.api_key_placement,
        )

    def add_response(self, response, query_city, query_state):
        for place in response.get("places", []) or []:
            place_id = clean(place.get("id"))
            dedupe_id = place_id or f"{place_name(place)}|{clean(place.get('formattedAddress'))}"
            if dedupe_id in self.seen_ids:
                continue
            self.seen_ids.add(dedupe_id)
            row = dict(place)
            row["_queryCity"] = query_city
            row["_queryState"] = query_state
            self.places.append(row)


class FixtureResponses:
    def __init__(self, data):
        self.queue = []
        self.queries = {}
        if isinstance(data, list):
            self.queue = data
        elif isinstance(data, dict):
            if isinstance(data.get("responses"), list):
                self.queue = data["responses"]
            elif isinstance(data.get("pages"), list):
                self.queue = data["pages"]
            elif isinstance(data.get("queries"), dict):
                self.queries = data["queries"]
            else:
                self.queue = [data]
        else:
            raise SystemExit("--fixture must contain an object or array.")
        self.offset = 0

    def next_response(self, text_query, page_token=None):
        if self.queries:
            pages = self.queries.get(text_query, [])
            if not isinstance(pages, list):
                pages = [pages]
            token_index = optional_int(page_token) if page_token else 0
            if token_index is None:
                token_index = 0
            return pages[token_index] if token_index < len(pages) else {"places": []}
        if self.offset >= len(self.queue):
            return {"places": []}
        response = self.queue[self.offset]
        self.offset += 1
        return response


def call_places_api(
    api_key,
    text_query,
    page_token=None,
    field_mask=FIELD_MASK,
    api_key_placement="header",
):
    payload = {"textQuery": text_query}
    if page_token:
        payload["pageToken"] = page_token
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Goog-FieldMask": field_mask,
    }
    url = PLACES_URL
    if api_key_placement == "query":
        url = f"{PLACES_URL}?{urlencode({'key': api_key})}"
    else:
        headers["X-Goog-Api-Key"] = api_key
    for attempt, wait_seconds in enumerate([1, 2, 4], start=1):
        request = Request(url, data=body, headers=headers, method="POST")
        try:
            with urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            if exc.code not in {429, 500, 502, 503, 504} or attempt == 3:
                detail = exc.read().decode("utf-8", errors="replace")
                raise SystemExit(f"Places API error {exc.code}: {detail}") from exc
            time.sleep(wait_seconds)
        except URLError as exc:
            if attempt == 3:
                raise SystemExit(f"Places API request failed: {exc}") from exc
            time.sleep(wait_seconds)
    return {"places": []}


def load_cities(brief, state):
    cities = brief.get("cities")
    if cities:
        if not isinstance(cities, list):
            raise SystemExit("brief.json cities must be an array.")
        return [clean(city) for city in cities if clean(city)]
    if not state:
        raise SystemExit("brief.json must include state when cities are omitted.")
    cities_path = Path(__file__).with_name("state-cities.json")
    data = load_json(cities_path, "state-cities.json")
    default_cities = data.get(state)
    if not default_cities:
        raise SystemExit(f"No default cities found for state {state}; provide cities in brief.json.")
    return default_cities


def load_keywords(brief):
    keywords = brief.get("categoryKeywords")
    if isinstance(keywords, str):
        keywords = [keywords]
    if not isinstance(keywords, list):
        raise SystemExit("brief.json categoryKeywords must be an array.")
    cleaned = [clean(item) for item in keywords if clean(item)]
    if not cleaned:
        raise SystemExit("brief.json categoryKeywords must not be empty.")
    return cleaned


def build_text_query(keyword, city, state_name, min_rating):
    location = f"{city}, {state_name}" if state_name else city
    query = f"{keyword} in {location}"
    if min_rating is not None:
        query += f" with rating at least {min_rating:g}"
    return query


def load_fixture(path):
    if not path:
        return None
    return FixtureResponses(load_json(Path(path), "--fixture"))


def load_json(path, label):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        raise SystemExit(f"{label} not found: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Could not parse {label}: {exc}") from exc


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
