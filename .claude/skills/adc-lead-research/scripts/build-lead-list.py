import csv
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse


LEGACY_HEADERS = [
    "Business Name",
    "First Name",
    "Last Name",
    "Email",
    "City",
    "State",
    "Website",
    "Locations",
    "Personalization Note",
    "Review Rating",
    "Review Count",
    "Concept Key",
    "Owner Key",
    "Email Type",
    "Email Patterns Emitted",
    "Locations Confidence",
    "Researched Date",
    "Source",
]
DOMAIN_HEADER = "Domain"
MASTER_HEADERS = LEGACY_HEADERS + [DOMAIN_HEADER]
EXPORT_HEADERS = [
    "Business Name",
    "Website",
    "Domain",
    "City",
    "State",
    "Locations",
    "Review Rating",
    "Review Count",
    "Source",
]
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


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python build-lead-list.py <qualified.json> <output_dir>")

    qualified_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)

    concepts = load_qualified(qualified_path)
    master_path = output_dir / "lead-master.csv"
    headers, master_rows, migrated = load_or_create_master(master_path)
    seen_keys = {concept_key_from_master(row) for row in master_rows}
    seen_keys.discard("")

    today = date.today().isoformat()
    accepted_master_rows = []
    export_rows = []
    skipped = 0

    for concept in concepts:
        prepared = prepare_concept(concept, today, headers)
        if prepared["Concept Key"] in seen_keys:
            skipped += 1
            continue
        seen_keys.add(prepared["Concept Key"])
        accepted_master_rows.append(prepared)
        export_rows.append(export_row(prepared))

    if migrated:
        write_master(master_path, headers, master_rows)
    if accepted_master_rows:
        append_master(master_path, headers, accepted_master_rows)
        output_path = write_export(output_dir, today, export_rows)
    else:
        output_path = None

    print(f"Qualified concepts in: {len(concepts)}")
    print(f"New concepts: {len(accepted_master_rows)}")
    print(f"Skipped as dup: {skipped}")
    print(f"Master rows preserved: {len(master_rows)}")
    if migrated:
        print("Migration: added Domain column and back-filled from Website")
    else:
        print("Migration: Domain column already present")
    if output_path is None:
        print("Output file: none (zero new concepts)")
    else:
        print(f"Output file: {output_path}")


def load_qualified(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        raise SystemExit(f"Input file not found: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Could not parse JSON from {path}: {exc}") from exc
    if not isinstance(data, list):
        raise SystemExit("qualified.json must contain a JSON array.")
    for index, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            raise SystemExit(f"Concept {index} is not an object.")
    return data


def load_or_create_master(path):
    if not path.exists():
        write_csv(path, MASTER_HEADERS, [])
        return MASTER_HEADERS, [], False

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = list(reader.fieldnames or [])
        rows = list(reader)

    migrated = False
    if DOMAIN_HEADER not in headers:
        headers = headers + [DOMAIN_HEADER]
        for row in rows:
            row[DOMAIN_HEADER] = domain_from_value(row.get("Website"))
            row["Concept Key"] = concept_key(
                row.get("Business Name"),
                row.get(DOMAIN_HEADER),
                row.get("State"),
            )
        migrated = True
    else:
        for row in rows:
            if row.get(DOMAIN_HEADER) is None:
                row[DOMAIN_HEADER] = ""
    return headers, rows, migrated


def prepare_concept(concept, researched_date, headers):
    business_name = clean(concept.get("businessName"))
    state = clean(concept.get("state")).upper()
    website = clean(concept.get("website"))
    domain = domain_from_value(concept.get("domain") or website)
    if not business_name:
        raise SystemExit("Qualified concept is missing businessName.")
    if not state:
        raise SystemExit(f"Qualified concept is missing state: {business_name}")
    if not domain:
        raise SystemExit(f"Qualified concept is missing domain/website: {business_name}")

    row = {header: "" for header in headers}
    row.update(
        {
            "Business Name": business_name,
            "First Name": "",
            "Last Name": "",
            "Email": "",
            "City": clean(concept.get("city")),
            "State": state,
            "Website": website,
            "Locations": to_int_or_blank(concept.get("locations", concept.get("placeCount"))),
            "Personalization Note": "",
            "Review Rating": to_float_or_blank(concept.get("reviewRating")),
            "Review Count": to_int_or_blank(concept.get("reviewCount")),
            "Concept Key": concept_key(business_name, domain, state),
            "Owner Key": "",
            "Email Type": "",
            "Email Patterns Emitted": "",
            "Locations Confidence": clean(concept.get("locationsConfidence")),
            "Researched Date": researched_date,
            "Source": clean(concept.get("source")),
            DOMAIN_HEADER: domain,
        }
    )
    return row


def export_row(master_row):
    return {header: master_row.get(header, "") for header in EXPORT_HEADERS}


def concept_key_from_master(row):
    domain = domain_from_value(row.get(DOMAIN_HEADER) or row.get("Website"))
    return concept_key(row.get("Business Name"), domain, row.get("State"))


def concept_key(business_name, domain, state):
    clean_domain = domain_from_value(domain) or "no-domain"
    clean_state = clean(state).lower()
    return f"{slug(business_name)}|{clean_domain}|{clean_state}"


def write_export(output_dir, today, rows):
    try:
        import openpyxl
    except ImportError:
        csv_path = unclobbered_path(output_dir, today, "csv")
        write_csv(csv_path, EXPORT_HEADERS, rows)
        print(f"openpyxl was unavailable, so CSV was produced instead: {csv_path}")
        return csv_path

    xlsx_path = unclobbered_path(output_dir, today, "xlsx")
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Instantly Lead List"
    sheet.append(EXPORT_HEADERS)
    for row in rows:
        sheet.append([row.get(header, "") for header in EXPORT_HEADERS])
    workbook.save(xlsx_path)
    return xlsx_path


def unclobbered_path(output_dir, today, extension):
    base = output_dir / f"instantly-lead-list-{today}.{extension}"
    if not base.exists():
        return base
    counter = 2
    while True:
        candidate = output_dir / f"instantly-lead-list-{today}-{counter}.{extension}"
        if not candidate.exists():
            return candidate
        counter += 1


def append_master(path, headers, rows):
    with path.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in headers})


def write_master(path, headers, rows):
    write_csv(path, headers, rows)


def write_csv(path, headers, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in headers})


def domain_from_value(value):
    text = clean(value).lower()
    if not text:
        return ""
    parsed = urlparse(text if re.match(r"^[a-z][a-z0-9+.-]*://", text, re.I) else f"https://{text}")
    host = (parsed.netloc or parsed.path.split("/")[0]).split("@")[-1].split(":")[0].strip(".")
    while host.startswith("www."):
        host = host[4:]
    labels = [label for label in host.split(".") if label]
    if len(labels) <= 2:
        return ".".join(labels)
    suffix = ".".join(labels[-2:])
    if suffix in MULTI_PART_SUFFIXES and len(labels) >= 3:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def slug(value):
    text = clean(value).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def clean(value):
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"n/a", "na", "none", "null"}:
        return ""
    return text


def to_int_or_blank(value):
    if value in (None, ""):
        return ""
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return ""


def to_float_or_blank(value):
    if value in (None, ""):
        return ""
    try:
        return float(value)
    except (TypeError, ValueError):
        return ""


if __name__ == "__main__":
    main()
