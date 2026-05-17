import csv
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlparse


EXPORT_HEADERS = [
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
]

INTERNAL_HEADERS = [
    "Concept Key",
    "Owner Key",
    "Email Type",
    "Email Patterns Emitted",
    "Locations Confidence",
    "Researched Date",
    "Source",
]

MASTER_HEADERS = EXPORT_HEADERS + INTERNAL_HEADERS

PERMUTATION_PATTERNS = [
    ("[firstname]@domain", lambda first, last, domain: f"{first}@{domain}"),
    ("[firstinitial][lastname]@domain", lambda first, last, domain: f"{first[:1]}{last}@{domain}"),
    ("[firstname].[lastname]@domain", lambda first, last, domain: f"{first}.{last}@{domain}"),
    ("[firstname][lastname]@domain", lambda first, last, domain: f"{first}{last}@{domain}"),
]


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python build-instantly-list.py <rows.json> <output_dir>")

    rows_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)

    concepts = load_concepts(rows_path)
    today = date.today().isoformat()
    master_path = output_dir / "lead-master.csv"
    ensure_master(master_path)

    master_rows = read_master(master_path)
    seen_concept_keys = {clean(row.get("Concept Key")) for row in master_rows if clean(row.get("Concept Key"))}
    owner_businesses = {
        (clean(row.get("Owner Key")), normalize_business_name(row.get("Business Name")))
        for row in master_rows
        if clean(row.get("Owner Key")) and clean(row.get("Business Name"))
    }

    accepted = []
    skipped = []
    output_rows = []
    permutation_rows = []

    for concept in concepts:
        prepared = prepare_concept(concept, today)
        is_duplicate = (
            prepared["concept_key"] in seen_concept_keys
            or (prepared["owner_key"], prepared["normalized_business_name"]) in owner_businesses
        )

        if is_duplicate:
            skipped.append(prepared)
            continue

        accepted.append(prepared)
        seen_concept_keys.add(prepared["concept_key"])
        owner_businesses.add((prepared["owner_key"], prepared["normalized_business_name"]))

        for row in prepared["output_rows"]:
            output_rows.append(row["export"])
            if row["email_type"] == "permutation-guess":
                permutation_rows.append({
                    "business": row["export"]["Business Name"],
                    "email": row["export"]["Email"],
                    "pattern": row["email_pattern"],
                    "output_row": len(output_rows) + 1,
                })

    if output_rows:
        output_path = write_instantly_file(output_dir, today, output_rows)
    else:
        output_path = None
    append_master(master_path, accepted)
    print_summary(len(concepts), len(accepted), len(skipped), len(output_rows), output_path, permutation_rows)


def load_concepts(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"Input file not found: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Could not parse JSON from {path}: {exc}")

    if not isinstance(data, list):
        raise SystemExit("rows.json must contain a JSON array of concept objects.")
    for index, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            raise SystemExit(f"Concept {index} is not an object.")
    return data


def ensure_master(path):
    if path.exists():
        return
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=MASTER_HEADERS)
        writer.writeheader()


def read_master(path):
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader)


def prepare_concept(concept, researched_date):
    business_name = clean(concept.get("businessName"), keep_na=True)
    first_name = clean(concept.get("firstName"), keep_na=True)
    last_name = clean(concept.get("lastName"), keep_na=True)
    state = clean(concept.get("state"), keep_na=True)
    website = clean(concept.get("website"), keep_na=True)
    website_domain = domain_from_website(website)
    concept_key = f"{slug(business_name)}|{slug(website_domain or 'no-domain')}|{state.lower()}"
    owner_key = f"{slug((first_name + ' ' + last_name).strip())}|{state.lower()}"

    base_export = {
        "Business Name": business_name,
        "First Name": first_name,
        "Last Name": last_name,
        "Email": "",
        "City": clean(concept.get("city"), keep_na=True),
        "State": state,
        "Website": website,
        "Locations": to_int_or_blank(concept.get("locations")),
        "Personalization Note": clean(concept.get("personalizationNote"), keep_na=True),
        "Review Rating": to_float_or_blank(concept.get("reviewRating")),
        "Review Count": to_int_or_blank(concept.get("reviewCount")),
    }

    output_rows, representative_email, email_type, emitted_patterns = build_email_rows(concept, base_export)
    source = clean(concept.get("source"), keep_na=True)
    if website_domain == "no-domain":
        source = f"manual-review: no-domain | {source}" if source else "manual-review: no-domain"

    master_export = dict(base_export)
    master_export["Email"] = representative_email
    master_row = dict(master_export)
    master_row.update({
        "Concept Key": concept_key,
        "Owner Key": owner_key,
        "Email Type": email_type,
        "Email Patterns Emitted": ";".join(emitted_patterns),
        "Locations Confidence": clean(concept.get("locationsConfidence"), keep_na=True),
        "Researched Date": researched_date,
        "Source": source,
    })

    return {
        "concept_key": concept_key,
        "owner_key": owner_key,
        "normalized_business_name": normalize_business_name(business_name),
        "output_rows": output_rows,
        "master_row": master_row,
    }


def build_email_rows(concept, base_export):
    public_email = clean(concept.get("publicEmail"))
    if public_email:
        export = dict(base_export)
        export["Email"] = public_email
        return ([{
            "export": export,
            "email_type": "public",
            "email_pattern": "",
        }], public_email, "public", [])

    domain = normalize_email_domain(concept.get("domain"))
    if not domain:
        raise SystemExit(f"Missing publicEmail or domain for concept: {base_export['Business Name']}")

    first = email_part(base_export["First Name"])
    last = email_part(base_export["Last Name"])
    rows = []
    emitted_patterns = []
    for pattern_name, builder in PERMUTATION_PATTERNS:
        export = dict(base_export)
        export["Email"] = builder(first, last, domain).lower()
        rows.append({
            "export": export,
            "email_type": "permutation-guess",
            "email_pattern": pattern_name,
        })
        emitted_patterns.append(pattern_name)

    return rows, rows[0]["export"]["Email"], "permutation-guess", emitted_patterns


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


def write_instantly_file(output_dir, today, output_rows):
    try:
        import openpyxl
    except ImportError:
        csv_path = unclobbered_path(output_dir, today, "csv")
        write_csv(csv_path, EXPORT_HEADERS, output_rows)
        print(f"openpyxl was unavailable, so CSV was produced instead: {csv_path}")
        return csv_path

    xlsx_path = unclobbered_path(output_dir, today, "xlsx")
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Instantly Lead List"
    sheet.append(EXPORT_HEADERS)
    for row in output_rows:
        sheet.append([row.get(header, "") for header in EXPORT_HEADERS])
    workbook.save(xlsx_path)
    return xlsx_path


def write_csv(path, headers, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in headers})


def append_master(path, accepted):
    if not accepted:
        return
    with path.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=MASTER_HEADERS)
        for item in accepted:
            writer.writerow({header: item["master_row"].get(header, "") for header in MASTER_HEADERS})


def print_summary(concepts_in, new_count, skipped_count, rows_written, output_path, permutation_rows):
    print(f"Concepts in: {concepts_in}")
    print(f"New concepts: {new_count}")
    print(f"Skipped as dup: {skipped_count}")
    print(f"Total output rows written: {rows_written}")
    if output_path is None:
        print("Output file: none (no new concepts — nothing written)")
    else:
        print(f"Output file: {output_path}")
    if permutation_rows:
        print("Permutation-guess rows (hold-back-by-default for live campaigns):")
        for row in permutation_rows:
            print(f"- Output row {row['output_row']}: {row['business']} <{row['email']}> ({row['pattern']})")
    else:
        print("Permutation-guess rows (hold-back-by-default for live campaigns): none")


def clean(value, keep_na=False):
    if value is None:
        return ""
    text = str(value).strip()
    if not keep_na and text.lower() in {"n/a", "na", "none", "null"}:
        return ""
    return text


def slug(value):
    text = clean(value).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def normalize_business_name(value):
    text = clean(value).lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def domain_from_website(website):
    text = clean(website)
    if not text:
        return "no-domain"
    parsed = urlparse(text if re.match(r"^[a-z][a-z0-9+.-]*://", text, re.I) else f"https://{text}")
    domain = (parsed.netloc or parsed.path.split("/")[0]).lower()
    domain = domain.split("@")[-1].split(":")[0].strip(".")
    if domain.startswith("www."):
        domain = domain[4:]
    return domain or "no-domain"


def normalize_email_domain(value):
    domain = domain_from_website(clean(value))
    return "" if domain == "no-domain" else domain.lower()


def email_part(value):
    return re.sub(r"[^a-z0-9]", "", clean(value).lower())


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
