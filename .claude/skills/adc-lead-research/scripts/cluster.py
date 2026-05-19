import re
import time
from collections import Counter, defaultdict
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse

MULTI_PART_SUFFIXES = {
    "co.uk",
    "org.uk",
    "ac.uk",
    "com.au",
    "net.au",
    "org.au",
    "co.nz",
    "com.br",
    "com.mx",
    "co.jp",
    "co.kr",
}
BLOCKED_DOMAINS = {
    "yelp.com",
    "doordash.com",
    "ubereats.com",
    "grubhub.com",
    "facebook.com",
    "instagram.com",
    "linktr.ee",
    "toasttab.com",
    "square.site",
    "tripadvisor.com",
    "maps.google.com",
    "google.com",
}
ADDRESS_RE = re.compile(
    r"\b\d{1,6}\s+[A-Za-z0-9][A-Za-z0-9 .#'/-]{2,80}\s+"
    r"(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|"
    r"Way|Pkwy|Parkway|Hwy|Highway|Ct|Court|Pl|Place|Ter|Terrace)\b"
    r"(?:[^<\n\r]{0,100}\b[A-Z]{2}\s+\d{5}(?:-\d{4})?)?",
    re.IGNORECASE,
)

def build_outputs(places, state, min_rating, min_review_count, location_pre_count, source="google_places"):
    filtered = []
    no_own_site = []
    name_groups = defaultdict(list)

    for place in places:
        rating = optional_float(place.get("rating"))
        review_count = optional_int(place.get("userRatingCount"))
        if min_rating is not None and (rating is None or rating < min_rating):
            continue
        if min_review_count is not None and (
            review_count is None or review_count < min_review_count
        ):
            continue

        website = clean(place.get("websiteUri"))
        host = host_from_url(website)
        domain = registrable_domain(host)
        blocked = is_blocked_website(website, host, domain)
        address = clean(place.get("formattedAddress"))
        place_state = extract_state(address) or clean(place.get("_queryState")).upper() or state
        enriched = {
            "id": clean(place.get("id")),
            "businessName": place_name(place),
            "website": website,
            "domain": domain,
            "host": host,
            "blocked": blocked,
            "rating": rating,
            "reviewCount": review_count,
            "address": address,
            "city": extract_city(address) or clean(place.get("_queryCity")),
            "state": place_state,
        }
        filtered.append(enriched)
        name_groups[(slug(enriched["businessName"]), place_state)].append(enriched)
        if not domain or blocked:
            no_own_site.append(enriched)

    domain_groups = defaultdict(list)
    for item in filtered:
        if item["domain"] and not item["blocked"]:
            domain_groups[item["domain"]].append(item)

    candidates = []
    used_ids = set()
    for domain, items in sorted(domain_groups.items()):
        addresses = distinct_addresses(items)
        if len(addresses) < 2:
            continue
        candidate = {
            "businessName": most_common_name(items),
            "website": best_website(items, domain),
            "domain": domain,
            "city": first_clean(item["city"] for item in items),
            "state": first_clean(item["state"] for item in items) or state,
            "addresses": addresses,
            "placeCount": len(addresses),
            "reviewRating": aggregate_rating(items),
            "reviewCount": sum(item["reviewCount"] or 0 for item in items),
            "source": source,
        }
        if location_pre_count:
            candidate.update(pre_count_locations(candidate["domain"]))
        candidates.append(candidate)
        used_ids.update(item["id"] for item in items if item["id"])

    skipped = []
    for key, items in sorted(group_by_name_state(no_own_site).items()):
        addresses = distinct_addresses(items)
        skipped.append(
            {
                "reason": "no-own-site",
                "businessName": most_common_name(items),
                "state": key[1],
                "addresses": addresses,
                "placeCount": len(addresses),
                "websites": sorted({item["website"] for item in items if item["website"]}),
                "domains": sorted({item["domain"] for item in items if item["domain"]}),
                "source": source,
            }
        )

    for (name_key, group_state), items in sorted(name_groups.items()):
        addresses = distinct_addresses(items)
        domains = sorted({item["domain"] for item in items if item["domain"]})
        real_domains = sorted(
            {item["domain"] for item in items if item["domain"] and not item["blocked"]}
        )
        if len(addresses) < 2:
            continue
        if not real_domains:
            continue
        if len(real_domains) == 1 and all(item["domain"] == real_domains[0] for item in items):
            continue
        skipped.append(
            {
                "reason": "name-only-multi-location",
                "businessName": most_common_name(items),
                "state": group_state,
                "addresses": addresses,
                "placeCount": len(addresses),
                "websites": sorted({item["website"] for item in items if item["website"]}),
                "domains": domains,
                "source": source,
            }
        )

    return candidates, skipped


def pre_count_locations(domain):
    urls = [
        f"https://{domain}/",
        f"https://{domain}/locations",
        f"https://{domain}/our-locations",
        f"https://{domain}/contact",
        f"https://{domain}/find-us",
    ]
    found = set()
    try:
        for url in urls:
            request = Request(url, headers={"User-Agent": "adc-lead-research/1.0"})
            with urlopen(request, timeout=8) as response:
                if response.status >= 400:
                    continue
                text = response.read(500000).decode("utf-8", errors="ignore")
                for match in ADDRESS_RE.findall(text):
                    found.add(normalize_address(match))
    except Exception:
        return {"preCount": "", "preCountConfidence": "low"}
    count = len(found)
    return {"preCount": count, "preCountConfidence": "ok" if count else "low"}

def place_name(place):
    display = place.get("displayName")
    if isinstance(display, dict):
        return clean(display.get("text"))
    return clean(display)


def most_common_name(items):
    counts = Counter(item["businessName"] for item in items if item["businessName"])
    return counts.most_common(1)[0][0] if counts else ""


def best_website(items, domain):
    for item in items:
        if item["website"] and registrable_domain(host_from_url(item["website"])) == domain:
            return item["website"]
    return f"https://{domain}" if domain else ""


def aggregate_rating(items):
    weighted_total = 0
    review_total = 0
    ratings = []
    for item in items:
        rating = item["rating"]
        reviews = item["reviewCount"] or 0
        if rating is None:
            continue
        ratings.append(rating)
        if reviews > 0:
            weighted_total += rating * reviews
            review_total += reviews
    if review_total:
        return round(weighted_total / review_total, 2)
    if ratings:
        return round(sum(ratings) / len(ratings), 2)
    return ""


def first_clean(values):
    for value in values:
        text = clean(value)
        if text:
            return text
    return ""


def distinct_addresses(items):
    seen = set()
    addresses = []
    for item in items:
        address = clean(item["address"])
        if not address:
            continue
        normalized = normalize_address(address)
        if normalized in seen:
            continue
        seen.add(normalized)
        addresses.append(address)
    return addresses


def group_by_name_state(items):
    grouped = defaultdict(list)
    for item in items:
        grouped[(slug(item["businessName"]), item["state"])].append(item)
    return grouped


def host_from_url(value):
    text = clean(value).lower()
    if not text:
        return ""
    parsed = urlparse(text if re.match(r"^[a-z][a-z0-9+.-]*://", text, re.I) else f"https://{text}")
    host = (parsed.netloc or parsed.path.split("/")[0]).split("@")[-1].split(":")[0].strip(".")
    while host.startswith("www."):
        host = host[4:]
    return host


def registrable_domain(host):
    host = clean(host).lower().strip(".")
    if not host:
        return ""
    labels = [label for label in host.split(".") if label]
    if len(labels) <= 2:
        return ".".join(labels)
    suffix = ".".join(labels[-2:])
    if suffix in MULTI_PART_SUFFIXES and len(labels) >= 3:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def is_blocked_website(website, host, domain):
    target = f"{website} {host} {domain}".lower()
    if "google.com/maps" in target or "maps.google" in target:
        return True
    if host.startswith("order.") or ".order." in host:
        return True
    for blocked in BLOCKED_DOMAINS:
        if domain == blocked or host == blocked or host.endswith(f".{blocked}"):
            return True
    return False


def extract_city(address):
    parts = [part.strip() for part in clean(address).split(",")]
    if len(parts) >= 2:
        return parts[-2]
    return ""


def extract_state(address):
    match = re.search(r",\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\b", clean(address))
    return match.group(1) if match else ""


def normalize_address(value):
    text = clean(value).lower()
    text = re.sub(r"\b(suite|ste|unit|#)\s*[a-z0-9-]+", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def slug(value):
    text = clean(value).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def clean(value):
    if value is None:
        return ""
    return str(value).strip()


def optional_float(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def optional_int(value):
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None
