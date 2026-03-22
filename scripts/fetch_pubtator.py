#!/usr/bin/env python3
"""
fetch_pubtator.py — Query PubTator3 API to discover diseases co-occurring with
Hallmarks of Aging, for expanding the Geroexplorer diseases.json dataset.

=============================================================================
OVERVIEW: THREE-PHASE PIPELINE
=============================================================================

Phase 1 — Explore (default):
    For each of the 12 Hallmarks of Aging, query PubTator3 with that hallmark's
    pubmed_search_terms. Extract all Disease-type NER entities that co-occur in
    the returned papers. Filter out infectious diseases and pure symptoms/signs.
    Save raw co-occurrence data to data/pubtator_raw.json and print statistics.

Phase 2 — Generate (--phase generate):
    Apply a tiered threshold filter to the raw data to produce a list of
    candidate diseases. The tiered approach guards against two failure modes:
      - Raw count alone favours common-term diseases (e.g. "cancer") that
        swamp every search regardless of hallmark specificity.
      - Relative frequency alone can surface rare diseases with near-perfect
        co-occurrence in a tiny paper set.
    The combined requirement (count >= min_absolute AND relative >= min_relative)
    requires both breadth and specificity before a candidate is promoted.
    Output written to data/pubtator_candidates.json for human review.

Phase 3 — Merge (--phase merge):
    Load pubtator_candidates.json, deduplicate against diseases.json by name
    similarity (difflib sequence matching), show a diff, and — only when
    --confirm is also supplied — append approved candidates to diseases.json.

=============================================================================
USAGE
=============================================================================

    python3 scripts/fetch_pubtator.py [OPTIONS]

Options:
    --phase {explore,generate,merge}   Which phase to run (default: explore)
    --min-count N                      Absolute minimum co-occurrence (default: 20)
    --min-relative F                   Relative minimum co-occurrence (default: 0.001)
    --include-syndromes                Include syndrome-named entities
    --force-refresh                    Ignore cache and re-fetch from API
    --confirm                          Required for --phase merge to write files
    --hallmark HALLMARK_ID             Run for a single hallmark only
    --limit N                          Limit to first N hallmarks
    --dry-run                          Show what would happen without API calls
"""

import argparse
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path
from statistics import median, quantiles

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

HALLMARKS_FILE = DATA_DIR / "hallmarks.json"
DISEASES_FILE = DATA_DIR / "diseases.json"
MECHANISMS_FILE = DATA_DIR / "mechanisms.json"
CACHE_FILE = DATA_DIR / "pubtator_cache.json"
RAW_OUTPUT_FILE = DATA_DIR / "pubtator_raw.json"
CANDIDATES_FILE = DATA_DIR / "pubtator_candidates.json"

# ---------------------------------------------------------------------------
# PubTator3 API
# ---------------------------------------------------------------------------

PUBTATOR_BASE = "https://www.ncbi.nlm.nih.gov/research/pubtator3-api"
SEARCH_ENDPOINT = PUBTATOR_BASE + "/search/"
EXPORT_ENDPOINT = PUBTATOR_BASE + "/publications/export/biocjson"

REQUEST_DELAY = 0.5   # seconds between API calls
MAX_RETRIES = 3
BACKOFF_BASE = 2      # exponential backoff multiplier
PMIDS_PER_QUERY = 200 # number of PMIDs to fetch per search query
ANNOTATION_BATCH = 20 # PMIDs per annotation request

# ---------------------------------------------------------------------------
# Filtering constants
# ---------------------------------------------------------------------------

INFECTIOUS_KEYWORDS = [
    "infection", "virus", "viral", "bacterial", "fungal", "parasit",
    "HIV", "COVID", "influenza", "tuberculosis", "malaria", "hepatitis",
    "pneumonia", "sepsis", "syphilis", "chlamydia", "gonorrhea",
    "candida", "aspergill", "herpes", "ebola", "dengue", "zika",
    "prion", "rabies", "polio", "measles", "rubella", "varicella",
    "toxoplasm", "leishman", "trypanosom", "plasmodium",
]

SYMPTOM_SUFFIXES = [
    "pain", "ache", "symptom", "sign", "finding", "disorder NOS",
    "unspecified", "not otherwise specified",
]

SYNDROME_KEYWORDS = ["syndrome"]

# Broad MESH category terms — groups of diseases, not specific diagnoses
BROAD_CATEGORY_PATTERNS = re.compile(
    r"\b(diseases?|disorders?|neoplasms?|conditions?|abnormalities|complications?"
    r"|manifestations?|injuries|wounds?|poisoning|defects?)\s*$",
    re.IGNORECASE,
)

# Biological processes and non-disease entities (often appear as MESH disease annotations)
PROCESS_TERMS = {
    "inflammation", "carcinogenesis", "fibrosis", "aging", "senescence",
    "apoptosis", "autophagy", "dysbiosis", "cachexia", "atrophy",
    "degeneration", "necrosis", "oxidative stress", "hypoxia",
    "aging premature",  # progeroid syndromes — keep separately
    # Non-disease outcomes and processes identified in full pipeline run (2026-03-22)
    "death", "insulin resistance", "chromosomal instability",
    "drug-related side effects and adverse reactions",
    "nerve degeneration",  # process, not a specific disease
}

# Simple heuristic: names that look like pure symptoms rather than diseases
SYMPTOM_PATTERNS = re.compile(
    r"\b(pain|ache|fever|nausea|vomiting|diarrhea|fatigue|dyspnea|dyspnoea"
    r"|cough|rash|pruritus|edema|oedema|pallor|jaundice)\b",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def load_json(path: Path) -> object:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def save_json(path: Path, data: object, indent: int = 2) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=indent, ensure_ascii=False)
    print(f"  [saved] {path}")


def snake_case(text: str) -> str:
    """Convert a disease name to a snake_case identifier segment."""
    text = text.lower()
    text = re.sub(r"[''`]", "", text)          # apostrophes
    text = re.sub(r"[^a-z0-9]+", "_", text)   # non-alphanumeric → underscore
    text = text.strip("_")
    return text


def name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def percentile_from_sorted(sorted_vals: list, pct: float) -> float:
    """Return the p-th percentile (0–100) of a pre-sorted list."""
    if not sorted_vals:
        return 0.0
    idx = (pct / 100) * (len(sorted_vals) - 1)
    lo, hi = int(idx), math.ceil(idx)
    if lo == hi:
        return float(sorted_vals[lo])
    frac = idx - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


# ---------------------------------------------------------------------------
# Cache layer
# ---------------------------------------------------------------------------


class Cache:
    """Simple JSON-backed request cache keyed by URL."""

    def __init__(self, path: Path, force_refresh: bool = False):
        self._path = path
        self._force = force_refresh
        if not force_refresh and path.exists():
            with open(path, "r", encoding="utf-8") as fh:
                self._store = json.load(fh)
        else:
            self._store = {}

    def get(self, key: str):
        if self._force:
            return None
        return self._store.get(key)

    def set(self, key: str, value) -> None:
        self._store[key] = value
        with open(self._path, "w", encoding="utf-8") as fh:
            json.dump(self._store, fh, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------


def _http_get(url: str, params: dict | None = None) -> dict:
    """Make a GET request and return parsed JSON. Raises on HTTP errors."""
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "GeroexplorerBot/1.0 (research; fetch_pubtator.py)"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def api_get(url: str, params: dict | None = None, cache: Cache | None = None) -> dict | None:
    """GET with retry/backoff and optional caching. Returns None on failure."""
    cache_key = url + ("?" + urllib.parse.urlencode(params) if params else "")

    if cache is not None:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            time.sleep(REQUEST_DELAY)
            data = _http_get(url, params)
            if cache is not None:
                cache.set(cache_key, data)
            return data
        except urllib.error.HTTPError as exc:
            print(f"    [HTTP {exc.code}] {cache_key} (attempt {attempt}/{MAX_RETRIES})")
            if exc.code in (429, 503) and attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
            elif attempt == MAX_RETRIES:
                print(f"    [error] giving up on {cache_key}")
                return None
        except Exception as exc:  # noqa: BLE001
            print(f"    [error] {exc} (attempt {attempt}/{MAX_RETRIES})")
            if attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
            else:
                return None
    return None


# ---------------------------------------------------------------------------
# Disease filtering
# ---------------------------------------------------------------------------


def is_infectious(name: str) -> bool:
    nl = name.lower()
    return any(kw.lower() in nl for kw in INFECTIOUS_KEYWORDS)


def is_syndrome(name: str) -> bool:
    nl = name.lower()
    return any(kw in nl for kw in SYNDROME_KEYWORDS)


def is_pure_symptom(name: str) -> bool:
    """Heuristic: likely a symptom/sign rather than a named disease."""
    if SYMPTOM_PATTERNS.search(name):
        # Allow if paired with a disease term (e.g. "chest pain in MI" is filtered
        # out entirely; standalone "pain" / "chest pain" goes)
        disease_markers = re.search(
            r"\b(disease|disorder|syndrome|cancer|carcinoma|oma|itis|osis|opathy|emia)\b",
            name,
            re.IGNORECASE,
        )
        if not disease_markers:
            return True
    return False


def is_broad_category(name: str) -> bool:
    """Return True if this is a broad disease category or biological process."""
    if BROAD_CATEGORY_PATTERNS.search(name.strip()):
        return True
    if name.lower().strip() in PROCESS_TERMS:
        return True
    return False


def passes_filter(name: str, include_syndromes: bool) -> bool:
    """Return True if this disease entity should be kept."""
    if is_infectious(name):
        return False
    if is_pure_symptom(name):
        return False
    if is_broad_category(name):
        return False
    if not include_syndromes and is_syndrome(name):
        return False
    return True


# ---------------------------------------------------------------------------
# PubTator query logic
# ---------------------------------------------------------------------------


def query_pubtator_for_hallmark(
    hallmark: dict,
    cache: Cache,
    dry_run: bool = False,
) -> list[dict]:
    """
    Query PubTator3 for papers co-occurring with a hallmark.

    Two-step process:
      1. Search endpoint → get PMIDs for papers mentioning hallmark terms
      2. Export/biocjson endpoint → get full NER annotations for those PMIDs
         and extract Disease entities

    Returns a list of Disease annotation dicts:
        {"concept_id": str, "name": str, "count": int}
    """
    search_terms = hallmark.get("pubmed_search_terms", [])
    if not search_terms:
        return []

    all_pmids: list[str] = []

    for term in search_terms[:2]:
        print(f"    querying: {term!r}")
        if dry_run:
            print("    [dry-run] skipping API call")
            continue

        # PubTator search returns 10 per page — paginate to reach PMIDS_PER_QUERY
        term_pmids: list[str] = []
        page = 1
        max_pages = math.ceil(PMIDS_PER_QUERY / 10)
        while len(term_pmids) < PMIDS_PER_QUERY:
            data = api_get(
                SEARCH_ENDPOINT,
                params={"text": term, "concepts": "disease", "page": page},
                cache=cache,
            )
            if not data or not data.get("results"):
                break
            batch = [str(r["pmid"]) for r in data["results"] if r.get("pmid")]
            if not batch:
                break
            term_pmids.extend(batch)
            total_pages = data.get("total_pages", 1)
            if page >= total_pages or page >= max_pages:
                break
            page += 1

        all_pmids.extend(term_pmids)
        print(f"    → {len(term_pmids)} PMIDs (pages: {page})")

    if not all_pmids or dry_run:
        return []

    # Deduplicate PMIDs
    seen = set()
    unique_pmids = [p for p in all_pmids if not (p in seen or seen.add(p))]

    # Step 2: fetch annotations in batches
    all_concepts: dict[str, dict] = {}  # concept_id → {name, count}
    for i in range(0, len(unique_pmids), ANNOTATION_BATCH):
        batch = unique_pmids[i:i + ANNOTATION_BATCH]
        ann_data = api_get(
            EXPORT_ENDPOINT,
            params={"pmids": ",".join(batch)},
            cache=cache,
        )
        if ann_data:
            _extract_concepts_from_biocjson(ann_data, all_concepts)

    return list(all_concepts.values())


def _extract_concepts_from_biocjson(data, accumulator: dict) -> None:
    """
    Extract Disease annotations from PubTator3 biocjson export response.
    Response shape: {"PubTator3": [doc, ...]} or a list of docs directly.
    """
    if isinstance(data, dict) and "PubTator3" in data:
        docs = data["PubTator3"]
    elif isinstance(data, list):
        docs = data
    else:
        docs = [data]
    for doc in docs:
        for passage in doc.get("passages", []):
            for ann in passage.get("annotations", []):
                infons = ann.get("infons", {})
                if infons.get("type", "").lower() != "disease":
                    continue
                raw_id = infons.get("identifier", "")
                name = infons.get("name") or ann.get("text", "")
                name = name.strip()
                if not raw_id or not name or raw_id in ("-1", ""):
                    continue
                # Normalise to MESH: prefix
                cid = raw_id if raw_id.startswith("MESH:") else "MESH:" + raw_id
                if cid not in accumulator:
                    accumulator[cid] = {"concept_id": cid, "name": name, "count": 0}
                accumulator[cid]["count"] += 1


# ---------------------------------------------------------------------------
# Phase 1 — Explore
# ---------------------------------------------------------------------------


def phase_explore(args, hallmarks: list, diseases: list) -> dict:
    """
    Query PubTator for each hallmark and aggregate disease co-occurrence data.
    Returns the raw results dict (also written to RAW_OUTPUT_FILE).
    """
    cache = Cache(CACHE_FILE, force_refresh=args.force_refresh)

    existing_names = {d["name"].lower() for d in diseases}
    existing_mesh = {
        d.get("mesh_id", "").upper()
        for d in diseases
        if d.get("mesh_id")
    }

    # hallmark_id → list of disease dicts with co-occurrence count
    per_hallmark: dict[str, list] = {}

    # Global aggregation: concept_id → cumulative info
    global_map: dict[str, dict] = {}

    for hallmark in hallmarks:
        hid = hallmark["id"]
        hname = hallmark["name"]
        print(f"\n[Hallmark] {hname} ({hid})")

        concepts = query_pubtator_for_hallmark(hallmark, cache, dry_run=args.dry_run)
        print(f"  raw entities returned: {len(concepts)}")

        kept = []
        for c in concepts:
            name = c["name"]
            cid = c["concept_id"].upper()

            if not passes_filter(name, args.include_syndromes):
                continue

            entry = {
                "concept_id": cid,
                "name": name,
                "count": c["count"],
                "is_syndrome": is_syndrome(name),
                "already_exists": (
                    name.lower() in existing_names or cid in existing_mesh
                ),
            }
            kept.append(entry)

            # Accumulate into global map
            if cid not in global_map:
                global_map[cid] = {
                    "concept_id": cid,
                    "name": name,
                    "total_count": 0,
                    "hallmarks": [],
                    "is_syndrome": is_syndrome(name),
                    "already_exists": entry["already_exists"],
                }
            global_map[cid]["total_count"] += c["count"]
            if hid not in global_map[cid]["hallmarks"]:
                global_map[cid]["hallmarks"].append(hid)

        per_hallmark[hid] = kept
        print(f"  after filtering: {len(kept)} diseases")

    # Print per-hallmark statistics
    print("\n" + "=" * 70)
    print("STATISTICS PER HALLMARK")
    print("=" * 70)
    thresholds = [10, 20, 50, 100]
    for hallmark in hallmarks:
        hid = hallmark["id"]
        hname = hallmark["name"]
        entries = per_hallmark.get(hid, [])
        counts = sorted([e["count"] for e in entries])
        print(f"\n{hname}:")
        print(f"  total diseases: {len(entries)}")
        if counts:
            print(
                f"  count range: {counts[0]}–{counts[-1]}, "
                f"median: {median(counts):.0f}, "
                f"p25: {percentile_from_sorted(counts, 25):.0f}, "
                f"p75: {percentile_from_sorted(counts, 75):.0f}"
            )
            for t in thresholds:
                n = sum(1 for c in counts if c >= t)
                print(f"  >= {t:3d}: {n}")
        else:
            print("  (no results)")

    # Print global top-20 new candidates
    new_candidates = [
        v for v in global_map.values() if not v["already_exists"]
    ]
    new_candidates.sort(key=lambda x: x["total_count"], reverse=True)

    print("\n" + "=" * 70)
    print("TOP 20 NEW CANDIDATE DISEASES (by total co-occurrence)")
    print("=" * 70)
    for i, cand in enumerate(new_candidates[:20], 1):
        syndrome_flag = " [SYNDROME]" if cand["is_syndrome"] else ""
        print(
            f"  {i:2d}. {cand['name']}{syndrome_flag} "
            f"(count={cand['total_count']}, "
            f"hallmarks={len(cand['hallmarks'])})"
        )

    # Summary
    total_unique = len(global_map)
    n_existing = sum(1 for v in global_map.values() if v["already_exists"])
    n_new = total_unique - n_existing
    print(f"\nTotal unique disease entities: {total_unique}")
    print(f"  Already in diseases.json: {n_existing}")
    print(f"  New candidates: {n_new}")

    raw_output = {
        "per_hallmark": per_hallmark,
        "global_map": list(global_map.values()),
    }

    if not args.dry_run:
        save_json(RAW_OUTPUT_FILE, raw_output)

    return raw_output


# ---------------------------------------------------------------------------
# Phase 2 — Generate candidates
# ---------------------------------------------------------------------------


def phase_generate(args, hallmarks: list, mechanisms: list) -> list:
    """
    Apply tiered thresholds to raw data and produce diseases.json-compatible
    candidate objects written to data/pubtator_candidates.json.
    """
    if not RAW_OUTPUT_FILE.exists():
        print("[error] data/pubtator_raw.json not found. Run --phase explore first.")
        sys.exit(1)

    raw = load_json(RAW_OUTPUT_FILE)
    global_map: list[dict] = raw.get("global_map", [])

    min_absolute: int = args.min_count
    min_relative: float = args.min_relative

    # Compute grand total for relative denominator
    grand_total = sum(e["total_count"] for e in global_map) or 1

    # Build hallmark name lookup
    hallmark_by_id = {h["id"]: h["name"] for h in hallmarks}
    mechanism_ids = [m["id"] for m in mechanisms]

    candidates = []
    rejected_count = 0

    for entry in global_map:
        if entry.get("already_exists"):
            continue

        # Re-apply content filters (raw file may predate filter additions)
        if not passes_filter(entry["name"], include_syndromes=False):
            rejected_count += 1
            continue

        count = entry["total_count"]
        relative = count / grand_total

        if count < min_absolute or relative < min_relative:
            rejected_count += 1
            continue

        name = entry["name"]
        cid = entry["concept_id"]
        hallmark_ids: list[str] = entry.get("hallmarks", [])

        # Normalise concept_id format
        mesh_id = cid if cid.startswith("MESH:") else ("MESH:" + cid)

        # Preliminary per-hallmark confidence based on relative contribution
        per_hallmark_counts = _gather_per_hallmark_counts(
            raw.get("per_hallmark", {}), cid, name
        )
        hallmark_total = sum(per_hallmark_counts.values()) or 1

        hallmark_links = []
        for hid in hallmark_ids:
            h_count = per_hallmark_counts.get(hid, 0)
            confidence = round(min(0.9, (h_count / hallmark_total) * len(hallmark_ids) * 0.5 + 0.1), 2)
            hallmark_links.append({
                "hallmark_id": hid,
                "confidence": confidence,
                "notes": f"PubTator co-occurrence: {h_count} papers",
            })

        # Sort links by confidence descending
        hallmark_links.sort(key=lambda x: x["confidence"], reverse=True)

        candidate = {
            "id": "disease_" + snake_case(name),
            "generated_id": "disease_" + snake_case(name),  # preserve for dedup check
            "name": name,
            "mesh_id": mesh_id,
            "icd10": "TBD",
            "system": _infer_system(name),
            "description": "Identified via PubTator NER co-occurrence analysis.",
            "confidence_source": "pubtator_ner",
            "is_syndrome": entry.get("is_syndrome", False),
            "pubtator_stats": {
                "total_count": count,
                "relative_frequency": round(relative, 6),
                "n_hallmarks": len(hallmark_ids),
            },
            "mechanism_links": [],
            "hallmark_direct_links": hallmark_links,
            "pubmed_search_terms": [f"{name} aging"],
        }
        candidates.append(candidate)

    # Sort by total count descending
    candidates.sort(key=lambda x: x["pubtator_stats"]["total_count"], reverse=True)

    print(f"\nCandidates passing threshold (>={min_absolute} absolute, >={min_relative} relative):")
    print(f"  Accepted: {len(candidates)}")
    print(f"  Rejected: {rejected_count}")
    print("\nTop 10 candidates:")
    for i, cand in enumerate(candidates[:10], 1):
        stats = cand["pubtator_stats"]
        print(
            f"  {i:2d}. {cand['name']} "
            f"(count={stats['total_count']}, "
            f"hallmarks={stats['n_hallmarks']}, "
            f"system={cand['system']})"
        )

    if not args.dry_run:
        save_json(CANDIDATES_FILE, candidates)
        print(f"\nCandidates written to {CANDIDATES_FILE}")
        print("Review carefully before running --phase merge.")

    return candidates


def _gather_per_hallmark_counts(per_hallmark: dict, cid: str, name: str) -> dict:
    """Return {hallmark_id: count} for a given disease across all hallmarks."""
    result = {}
    cid_upper = cid.upper()
    for hid, entries in per_hallmark.items():
        for e in entries:
            ecid = e.get("concept_id", "").upper()
            ename = e.get("name", "").lower()
            if ecid == cid_upper or ename == name.lower():
                result[hid] = e.get("count", 0)
                break
    return result


def _infer_system(name: str) -> str:
    """
    Very rough system inference from disease name keywords.
    Returns a string consistent with diseases.json 'system' values.
    """
    nl = name.lower()
    rules = [
        (["alzheimer", "parkinson", "dementia", "neuro", "brain", "cerebr",
          "spinal", "motor neuron", "neuropath", "cognitive"], "neurological"),
        (["heart", "cardiac", "coronary", "myocard", "atrial", "ventricul",
          "aorta", "atheroscler", "cardiovasc", "arrhythmia", "heart failure",
          "cardiomyopath", "hypertens"], "cardiovascular"),
        (["cancer", "carcinoma", "tumor", "tumour", "lymphoma", "leukemia",
          "leukaemia", "melanoma", "sarcoma", "glioma", "mesothelioma",
          "myeloma", "adenocarcinoma", "oncol", "neoplasm"], "oncological"),
        (["diabetes", "insulin", "glucose", "metabol", "obesity", "adipos",
          "thyroid", "pancrea", "endocrin", "dyslipid", "hyperlipid",
          "lipid", "fatty liver", "NAFLD", "NASH"], "metabolic"),
        (["lung", "pulmon", "respiratory", "asthma", "COPD", "emphysema",
          "bronch", "fibrosis pulm", "pleural"], "pulmonary"),
        (["kidney", "renal", "nephro", "glomerul", "uremia"], "renal"),
        (["liver", "hepat", "cirrhosis", "biliary"], "hepatic"),
        (["arthritis", "osteo", "bone", "joint", "skeletal", "musculosk",
          "sarcopenia", "musculo"], "musculoskeletal"),
        (["eye", "retina", "macular", "glaucoma", "cataract", "optic",
          "ocular", "vision"], "ophthalmic"),
        (["immune", "autoimmune", "lupus", "rheumat", "inflamm",
          "inflammator"], "immunological"),
        (["skin", "dermat", "psoriasis", "eczema", "derm"], "dermatological"),
        (["blood", "hematol", "anaemia", "anemia", "coagul", "thromb",
          "platelet", "hemophilia"], "hematological"),
        (["gut", "intestin", "colon", "gastro", "bowel", "crohn",
          "colitis", "ibs", "ibd"], "gastrointestinal"),
        (["depress", "anxiety", "psychiatric", "schizophrenia", "bipolar",
          "mental", "mood"], "psychiatric"),
    ]
    for keywords, system in rules:
        if any(kw in nl for kw in keywords):
            return system
    return "unknown"


# ---------------------------------------------------------------------------
# Phase 3 — Merge
# ---------------------------------------------------------------------------


def phase_merge(args, diseases: list) -> None:
    """
    Merge pubtator_candidates.json into diseases.json after deduplication check.
    Requires --confirm to actually write.
    """
    if not CANDIDATES_FILE.exists():
        print("[error] data/pubtator_candidates.json not found. Run --phase generate first.")
        sys.exit(1)

    candidates: list[dict] = load_json(CANDIDATES_FILE)
    existing_names = [(d["name"], d["id"]) for d in diseases]
    existing_ids   = {d["id"] for d in diseases}
    existing_mesh  = {
        d.get("mesh_id", "").upper(): d["id"]
        for d in diseases
        if d.get("mesh_id")
    }

    to_add = []
    skipped = []

    for cand in candidates:
        mesh      = cand.get("mesh_id", "").upper()
        cand_name = cand["name"]
        cand_id   = cand.get("generated_id") or cand["id"]

        # ── Check 1: exact ID collision ──────────────────────────────────────
        # "Stroke" → disease_stroke collides with existing "Ischemic Stroke"
        if cand_id in existing_ids:
            skipped.append((cand_name, f"ID collision → {cand_id} already exists"))
            continue

        # ── Check 2: MESH ID exact match ─────────────────────────────────────
        if mesh and mesh in existing_mesh:
            skipped.append((cand_name, f"MESH match → {existing_mesh[mesh]}"))
            continue

        # ── Check 3: name similarity + word overlap ───────────────────────────
        # Uses both character-level similarity AND word overlap to catch cases
        # like "Stroke" ↔ "Ischemic Stroke" (low char ratio, full word overlap)
        best_score = 0.0
        best_match = None
        cand_words = set(cand_name.lower().split())

        for ename, eid in existing_names:
            # Skip if lengths are too different (guards "Renal" ↔ "Adrenal")
            len_ratio = min(len(cand_name), len(ename)) / max(len(cand_name), len(ename))

            # Character similarity
            char_sim = name_similarity(cand_name, ename) if len_ratio >= 0.6 else 0.0

            # Word overlap: fraction of candidate words found in existing name
            exist_words = set(ename.lower().split())
            if cand_words and exist_words:
                word_overlap = len(cand_words & exist_words) / len(cand_words)
            else:
                word_overlap = 0.0

            # Combined score: high char_sim OR all candidate words appear in existing name
            score = max(char_sim, word_overlap if word_overlap == 1.0 else 0.0)
            if score > best_score:
                best_score = score
                best_match = eid

        if best_score >= 0.85:
            skipped.append(
                (cand_name, f"name/word match {best_score:.2f} → {best_match}")
            )
            continue

        to_add.append(cand)

    # Show diff
    print(f"\nMERGE PREVIEW")
    print(f"  Candidates total: {len(candidates)}")
    print(f"  Duplicates skipped: {len(skipped)}")
    print(f"  New entries to add: {len(to_add)}")

    if skipped:
        print("\nSkipped (duplicates):")
        for name, reason in skipped[:20]:
            print(f"  - {name}: {reason}")
        if len(skipped) > 20:
            print(f"  ... and {len(skipped) - 20} more")

    if to_add:
        print("\nWould add:")
        for cand in to_add[:20]:
            print(f"  + {cand['name']} ({cand.get('mesh_id', 'no MESH')})")
        if len(to_add) > 20:
            print(f"  ... and {len(to_add) - 20} more")

    if not args.confirm:
        print(
            "\n[info] Dry merge complete. Pass --confirm to write to diseases.json."
        )
        return

    if not to_add:
        print("\n[info] Nothing new to merge.")
        return

    # Strip internal fields before writing to diseases.json
    _INTERNAL_FIELDS = {"pubtator_stats", "confidence_source", "is_syndrome", "generated_id"}
    clean_entries = []
    for cand in to_add:
        entry = {k: v for k, v in cand.items() if k not in _INTERNAL_FIELDS}
        clean_entries.append(entry)

    merged = diseases + clean_entries
    save_json(DISEASES_FILE, merged)
    print(f"\n[done] Added {len(clean_entries)} diseases to {DISEASES_FILE}")
    print("Remember to run:  python3 scripts/build_graph.py")


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch PubTator3 NER co-occurrence data to expand diseases.json.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--phase",
        choices=["explore", "generate", "merge"],
        default="explore",
        help="Which phase to run (default: explore).",
    )
    parser.add_argument(
        "--min-count",
        type=int,
        default=20,
        metavar="N",
        help="Absolute minimum co-occurrence count for generate phase (default: 20).",
    )
    parser.add_argument(
        "--min-relative",
        type=float,
        default=0.001,
        metavar="F",
        help="Relative minimum co-occurrence for generate phase (default: 0.001).",
    )
    parser.add_argument(
        "--include-syndromes",
        action="store_true",
        help="Include syndrome-named entities (excluded by default).",
    )
    parser.add_argument(
        "--force-refresh",
        action="store_true",
        help="Ignore cache and re-fetch all data from PubTator3 API.",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Required for --phase merge to actually write to diseases.json.",
    )
    parser.add_argument(
        "--hallmark",
        metavar="HALLMARK_ID",
        default=None,
        help="Run for a single hallmark only (e.g. hallmark_genomic_instability).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Limit to first N hallmarks (useful for testing).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would happen without making API calls.",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    args = parse_args()

    # Load data files
    if not HALLMARKS_FILE.exists():
        print(f"[error] {HALLMARKS_FILE} not found.")
        sys.exit(1)
    hallmarks: list = load_json(HALLMARKS_FILE)
    diseases: list = load_json(DISEASES_FILE) if DISEASES_FILE.exists() else []
    mechanisms: list = load_json(MECHANISMS_FILE) if MECHANISMS_FILE.exists() else []

    # Apply hallmark filters
    if args.hallmark:
        matched = [h for h in hallmarks if h["id"] == args.hallmark]
        if not matched:
            ids = [h["id"] for h in hallmarks]
            print(f"[error] Unknown hallmark id: {args.hallmark!r}")
            print("Available:", ", ".join(ids))
            sys.exit(1)
        hallmarks = matched

    if args.limit is not None:
        hallmarks = hallmarks[: args.limit]

    print(f"Geroexplorer PubTator3 fetcher — phase: {args.phase}")
    print(f"Hallmarks to process: {len(hallmarks)}")
    if args.dry_run:
        print("[dry-run mode] No API calls or file writes.")

    if args.phase == "explore":
        phase_explore(args, hallmarks, diseases)

    elif args.phase == "generate":
        phase_generate(args, hallmarks, mechanisms)

    elif args.phase == "merge":
        phase_merge(args, diseases)


if __name__ == "__main__":
    main()
