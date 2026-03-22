#!/usr/bin/env python3
"""
fetch_pubmed.py — Fetch PubMed evidence for Geroexplorer nodes.
Usage: python3 scripts/fetch_pubmed.py [--email you@example.com] [--dry-run] [--limit N]
"""

import argparse
import json
import math
import os
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Fetch PubMed evidence counts for Geroexplorer nodes."
    )
    parser.add_argument(
        "--email",
        default="",
        help="E-mail address for NCBI Entrez (best practice, not required).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be searched without making any network requests.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Only fetch the first N nodes (useful for testing).",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Data loading helpers
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"


def load_json(path: Path) -> list | dict:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def collect_nodes() -> list[dict]:
    """Return a flat list of node dicts from all available data files."""
    nodes = []

    for filename, node_type in [
        ("hallmarks.json", "hallmark"),
        ("mechanisms.json", "mechanism"),
        ("diseases.json", "disease"),
    ]:
        filepath = DATA_DIR / filename
        if not filepath.exists():
            print(f"[info] {filename} not found, skipping.")
            continue
        data = load_json(filepath)
        for item in data:
            nodes.append({
                "id": item["id"],
                "name": item.get("name", item["id"]),
                "type": node_type,
                "pubmed_search_terms": item.get("pubmed_search_terms", []),
            })

    return nodes


# ---------------------------------------------------------------------------
# PubMed fetching
# ---------------------------------------------------------------------------

def _build_entrez():
    """Import Biopython Entrez; raise a helpful error if not installed."""
    try:
        from Bio import Entrez  # type: ignore
        return Entrez
    except ImportError as exc:
        raise SystemExit(
            "Biopython is required. Install with: pip install biopython"
        ) from exc


def esearch_query(entrez, query: str, retries: int = 3) -> dict:
    """
    Run an Entrez esearch and return a dict with:
      count, min_date, max_date, pmids (top-5)
    Retries up to `retries` times on network errors.
    """
    for attempt in range(1, retries + 1):
        try:
            # Fetch basic count + top 5 PMIDs
            handle = entrez.esearch(
                db="pubmed",
                term=query,
                retmax=5,
                sort="relevance",
                usehistory="y",
            )
            record = entrez.read(handle)
            handle.close()

            count = int(record.get("Count", 0))
            pmids = list(record.get("IdList", []))

            # Fetch date range when there are results
            min_date = ""
            max_date = ""
            if count > 0:
                # Fetch the single oldest article to get min date
                handle_old = entrez.esearch(
                    db="pubmed",
                    term=query,
                    retmax=1,
                    sort="pub+date",
                )
                rec_old = entrez.read(handle_old)
                handle_old.close()

                handle_new = entrez.esearch(
                    db="pubmed",
                    term=query,
                    retmax=1,
                    sort="pub+date",
                    # reverse sort not directly available; use pub date descending
                )
                # Use esearch with datetype for a reliable recent date
                handle_recent = entrez.esearch(
                    db="pubmed",
                    term=query,
                    retmax=1,
                    sort="relevance",
                )
                rec_recent = entrez.read(handle_recent)
                handle_recent.close()

                # esearch returns TranslationStack and other meta; dates come
                # from the individual records — approximate with pub year range
                # via efetch summary on oldest/newest PMID when available.
                if rec_old.get("IdList"):
                    oldest_pmid = rec_old["IdList"][0]
                    time.sleep(0.35)
                    sum_handle = entrez.efetch(
                        db="pubmed", id=oldest_pmid, rettype="docsum", retmode="xml"
                    )
                    sum_rec = entrez.read(sum_handle)
                    sum_handle.close()
                    try:
                        min_date = sum_rec["PubmedArticle"][0]["MedlineCitation"][
                            "Article"
                        ]["Journal"]["JournalIssue"]["PubDate"].get("Year", "")
                    except (KeyError, IndexError, TypeError):
                        pass

            return {
                "count": count,
                "min_date": str(min_date),
                "max_date": str(max_date),
                "pmids": pmids,
            }

        except Exception as exc:  # pylint: disable=broad-except
            print(f"  [warn] Attempt {attempt}/{retries} failed for query '{query}': {exc}")
            if attempt < retries:
                time.sleep(1.5 * attempt)
            else:
                print(f"  [error] All {retries} attempts failed; recording empty result.")
                return {"count": 0, "min_date": "", "max_date": "", "pmids": []}


def compute_raw_confidence(count: int, max_count: int) -> float:
    """
    Log-scale publication count normalised to [0, 1].

    raw_confidence = log(1 + count) / log(1 + max_count)

    When max_count == 0, returns 0.
    """
    if max_count <= 0:
        return 0.0
    return math.log1p(count) / math.log1p(max_count)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()

    # ---- Load nodes ----
    nodes = collect_nodes()
    if not nodes:
        print("[error] No node data found. Make sure data/hallmarks.json or data/mechanisms.json exist.")
        return

    if args.limit is not None:
        nodes = nodes[: args.limit]
        print(f"[info] --limit {args.limit}: processing {len(nodes)} nodes.")

    # ---- Dry-run mode ----
    if args.dry_run:
        print("=== DRY RUN — no network requests will be made ===\n")
        for node in nodes:
            print(f"  [{node['type']}] {node['name']} ({node['id']})")
            for term in node["pubmed_search_terms"]:
                print(f"      query: {term}")
        print(f"\nTotal nodes: {len(nodes)}")
        total_queries = sum(len(n["pubmed_search_terms"]) for n in nodes)
        print(f"Total queries: {total_queries}")
        est_time = total_queries * 0.35 * 2  # ~2 requests per term (count + date)
        print(f"Estimated time (approx): {est_time:.0f}s")
        return

    # ---- Real fetch ----
    entrez = _build_entrez()
    if args.email:
        entrez.email = args.email
        print(f"[info] Using Entrez email: {args.email}")
    else:
        print("[info] No --email provided. Consider adding one as NCBI best practice.")

    cache = {}
    all_counts: list[int] = []

    total_nodes = len(nodes)
    for node_idx, node in enumerate(nodes, start=1):
        node_id = node["id"]
        terms = node["pubmed_search_terms"]
        print(f"\n[{node_idx}/{total_nodes}] {node['name']} ({node_id})")

        if not terms:
            print("  [skip] No pubmed_search_terms defined.")
            cache[node_id] = {
                "name": node["name"],
                "type": node["type"],
                "queries": [],
                "total_count": 0,
                "top_pmids": [],
                "raw_confidence": 0.0,
            }
            continue

        query_results = []
        node_total_count = 0

        for term in terms:
            print(f"  Querying: {term}")
            result = esearch_query(entrez, term)
            query_results.append({"term": term, **result})
            node_total_count += result["count"]
            print(f"    -> {result['count']} results, top PMIDs: {result['pmids']}")
            time.sleep(0.35)

        # Aggregate top PMIDs (deduplicated, preserve order)
        seen: set[str] = set()
        top_pmids: list[str] = []
        for qr in query_results:
            for pmid in qr["pmids"]:
                if pmid not in seen:
                    seen.add(pmid)
                    top_pmids.append(pmid)
                if len(top_pmids) >= 5:
                    break
            if len(top_pmids) >= 5:
                break

        all_counts.append(node_total_count)
        cache[node_id] = {
            "name": node["name"],
            "type": node["type"],
            "queries": query_results,
            "total_count": node_total_count,
            "top_pmids": top_pmids,
            "raw_confidence": None,  # computed after all nodes are processed
        }

    # ---- Compute normalised raw_confidence ----
    max_count = max(all_counts) if all_counts else 0
    for node_id, entry in cache.items():
        entry["raw_confidence"] = round(
            compute_raw_confidence(entry["total_count"], max_count), 4
        )

    # ---- Save cache ----
    output_path = DATA_DIR / "pubmed_cache.json"
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(cache, fh, indent=2, ensure_ascii=False)

    print(f"\n[done] Saved PubMed cache to {output_path}")
    print(f"       Nodes processed : {len(cache)}")
    print(f"       Max total count : {max_count}")
    top_node = max(cache.items(), key=lambda kv: kv[1]["total_count"], default=None)
    if top_node:
        print(f"       Most-cited node  : {top_node[1]['name']} ({top_node[0]}) — {top_node[1]['total_count']} results")


if __name__ == "__main__":
    main()
