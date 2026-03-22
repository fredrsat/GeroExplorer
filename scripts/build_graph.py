#!/usr/bin/env python3
"""
build_graph.py — Build D3 force graph JSON from Geroexplorer data.
Usage: python3 scripts/build_graph.py
Output: data/graph.json
"""

import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
OUTPUT_PATH = DATA_DIR / "graph.json"


# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------

NODE_COLORS = {
    "hallmark": "#F59E0B",   # gold
    "mechanism": "#3B82F6",  # blue
    "disease": "#EF4444",    # coral/red
}

LINK_TYPE_MAP = {
    # direction: mechanism → hallmark  (stored as hallmark_links on mechanisms)
    "hallmark_to_mechanism": "hallmark_to_mechanism",
    # direction: mechanism → disease   (stored as mechanism_links on diseases)
    "mechanism_to_disease": "mechanism_to_disease",
    # direction: hallmark → disease    (stored as hallmark_direct_links on diseases)
    "hallmark_to_disease": "hallmark_to_disease",
}


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02X}{g:02X}{b:02X}"


def confidence_to_color(confidence: float) -> str:
    """
    Interpolate link colour: green (#22C55E) → yellow (#EAB308) → red (#EF4444).

    confidence 1.0  → green
    confidence 0.5  → yellow
    confidence 0.0  → red
    """
    confidence = max(0.0, min(1.0, confidence))

    green = (0x22, 0xC5, 0x5E)
    yellow = (0xEA, 0xB3, 0x08)
    red = (0xEF, 0x44, 0x44)

    if confidence >= 0.5:
        t = (confidence - 0.5) / 0.5   # 1 = full green, 0 = yellow
        r = int(yellow[0] + t * (green[0] - yellow[0]))
        g = int(yellow[1] + t * (green[1] - yellow[1]))
        b = int(yellow[2] + t * (green[2] - yellow[2]))
    else:
        t = confidence / 0.5            # 1 = yellow, 0 = full red
        r = int(red[0] + t * (yellow[0] - red[0]))
        g = int(red[1] + t * (yellow[1] - red[1]))
        b = int(red[2] + t * (yellow[2] - red[2]))

    return _rgb_to_hex(r, g, b)


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_json_optional(path: Path) -> list | dict | None:
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def load_all_data() -> tuple[list, list, list, dict | None]:
    hallmarks_raw = load_json_optional(DATA_DIR / "hallmarks.json") or []
    mechanisms_raw = load_json_optional(DATA_DIR / "mechanisms.json") or []
    diseases_raw = load_json_optional(DATA_DIR / "diseases.json") or []
    pubmed_cache = load_json_optional(DATA_DIR / "pubmed_cache.json")
    return hallmarks_raw, mechanisms_raw, diseases_raw, pubmed_cache


# ---------------------------------------------------------------------------
# Node builders
# ---------------------------------------------------------------------------

def build_hallmark_node(h: dict, pubmed_cache: dict | None) -> dict:
    node = {
        "id": h["id"],
        "label": h.get("name", h["id"]),
        "type": "hallmark",
        "category": h.get("category", ""),
        "color": NODE_COLORS["hallmark"],
        "description": h.get("description", ""),
        "year_added": h.get("year_added"),
        "key_genes": h.get("key_genes", []),
        "biomarkers": h.get("biomarkers", []),
        "pubmed_search_terms": h.get("pubmed_search_terms", []),
        # size will be set after degree computation
        "size": 10,
        "confidence": None,
    }

    if pubmed_cache and h["id"] in pubmed_cache:
        entry = pubmed_cache[h["id"]]
        node["pubmed_count"] = entry.get("total_count", 0)
        node["pubmed_top_pmids"] = entry.get("top_pmids", [])
        node["confidence"] = entry.get("raw_confidence")

    return node


def build_mechanism_node(m: dict, pubmed_cache: dict | None) -> dict:
    node = {
        "id": m["id"],
        "label": m.get("name", m["id"]),
        "type": "mechanism",
        "category": "",            # mechanisms have no category in the schema
        "color": NODE_COLORS["mechanism"],
        "description": m.get("description", ""),
        "key_genes": m.get("key_genes", []),
        "pubmed_search_terms": m.get("pubmed_search_terms", []),
        "size": 10,
        "confidence": None,
    }

    if pubmed_cache and m["id"] in pubmed_cache:
        entry = pubmed_cache[m["id"]]
        node["pubmed_count"] = entry.get("total_count", 0)
        node["pubmed_top_pmids"] = entry.get("top_pmids", [])
        node["confidence"] = entry.get("raw_confidence")

    return node


def build_disease_node(d: dict, pubmed_cache: dict | None) -> dict:
    node = {
        "id": d["id"],
        "label": d.get("name", d["id"]),
        "type": "disease",
        "category": d.get("system", d.get("category", "")),
        "color": NODE_COLORS["disease"],
        "description": d.get("description", ""),
        "icd10": d.get("icd10", ""),
        "key_genes": d.get("key_genes", []),
        "treatments": d.get("treatments", []),
        "pubmed_search_terms": d.get("pubmed_search_terms", []),
        "size": 10,
        "confidence": None,
    }

    if pubmed_cache and d["id"] in pubmed_cache:
        entry = pubmed_cache[d["id"]]
        node["pubmed_count"] = entry.get("total_count", 0)
        node["pubmed_top_pmids"] = entry.get("top_pmids", [])
        node["confidence"] = entry.get("raw_confidence")

    return node


# ---------------------------------------------------------------------------
# Edge builders
# ---------------------------------------------------------------------------

def build_edges(
    mechanisms_raw: list,
    diseases_raw: list,
    valid_ids: set[str],
) -> list[dict]:
    """
    Collect all edges from:
      1. mechanism.hallmark_links         → hallmark_to_mechanism
      2. disease.mechanism_links          → mechanism_to_disease
      3. disease.hallmark_direct_links    → hallmark_to_disease
    """
    edges: list[dict] = []

    def _make_edge(source: str, target: str, confidence: float, edge_type: str) -> dict | None:
        # Skip edges that reference non-existent nodes
        if source not in valid_ids or target not in valid_ids:
            return None
        conf = max(0.0, min(1.0, float(confidence)))
        return {
            "source": source,
            "target": target,
            "confidence": round(conf, 4),
            "type": edge_type,
            "color": confidence_to_color(conf),
            "width": round(1.0 + conf * 4.0, 3),
        }

    # 1. hallmark ↔ mechanism edges (stored on mechanisms as hallmark_links)
    for mech in mechanisms_raw:
        mech_id = mech.get("id", "")
        for link in mech.get("hallmark_links", []):
            hallmark_id = link.get("hallmark_id", "")
            confidence = link.get("confidence", 0.5)
            edge = _make_edge(hallmark_id, mech_id, confidence, "hallmark_to_mechanism")
            if edge:
                edges.append(edge)

    # 2. mechanism → disease edges (stored on diseases as mechanism_links)
    for disease in diseases_raw:
        disease_id = disease.get("id", "")
        for link in disease.get("mechanism_links", []):
            mech_id = link.get("mechanism_id", "")
            confidence = link.get("confidence", 0.5)
            edge = _make_edge(mech_id, disease_id, confidence, "mechanism_to_disease")
            if edge:
                edges.append(edge)

    # 3. hallmark → disease direct edges (stored on diseases as hallmark_direct_links)
    for disease in diseases_raw:
        disease_id = disease.get("id", "")
        for link in disease.get("hallmark_direct_links", []):
            hallmark_id = link.get("hallmark_id", "")
            confidence = link.get("confidence", 0.5)
            edge = _make_edge(hallmark_id, disease_id, confidence, "hallmark_to_disease")
            if edge:
                edges.append(edge)

    return edges


# ---------------------------------------------------------------------------
# Graph statistics
# ---------------------------------------------------------------------------

def compute_degree(nodes: list[dict], edges: list[dict]) -> dict[str, int]:
    degree: dict[str, int] = defaultdict(int)
    for edge in edges:
        degree[edge["source"]] += 1
        degree[edge["target"]] += 1
    return dict(degree)


def compute_stats(nodes: list[dict], edges: list[dict], degree: dict[str, int]) -> dict:
    node_count = len(nodes)
    edge_count = len(edges)

    degrees = list(degree.values()) if degree else [0]
    avg_degree = sum(degrees) / len(degrees) if degrees else 0.0

    sorted_by_degree = sorted(
        ((n["id"], n["label"], degree.get(n["id"], 0)) for n in nodes),
        key=lambda x: x[2],
        reverse=True,
    )
    most_connected = [
        {"id": nid, "label": label, "degree": deg}
        for nid, label, deg in sorted_by_degree[:10]
    ]

    # Edge type breakdown
    type_counts: dict[str, int] = defaultdict(int)
    for edge in edges:
        type_counts[edge["type"]] += 1

    # Average confidence
    confidences = [e["confidence"] for e in edges]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

    return {
        "node_count": node_count,
        "edge_count": edge_count,
        "avg_degree": round(avg_degree, 3),
        "avg_confidence": round(avg_confidence, 3),
        "edge_type_counts": dict(type_counts),
        "most_connected_nodes": most_connected,
    }


# ---------------------------------------------------------------------------
# Size computation
# ---------------------------------------------------------------------------

BASE_SIZE = 10.0


def assign_sizes(nodes: list[dict], degree: dict[str, int]) -> None:
    """Update node['size'] in-place based on degree: base_size * sqrt(degree)."""
    for node in nodes:
        d = degree.get(node["id"], 0)
        node["size"] = round(BASE_SIZE * math.sqrt(max(d, 1)), 2)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("Loading data files...")
    hallmarks_raw, mechanisms_raw, diseases_raw, pubmed_cache = load_all_data()

    if pubmed_cache:
        print(f"  PubMed cache loaded: {len(pubmed_cache)} entries")
    else:
        print("  No pubmed_cache.json found; confidence scores will be null.")

    print(
        f"  Hallmarks  : {len(hallmarks_raw)}"
        f"\n  Mechanisms : {len(mechanisms_raw)}"
        f"\n  Diseases   : {len(diseases_raw)}"
    )

    # ---- Build nodes ----
    nodes: list[dict] = []

    for h in hallmarks_raw:
        nodes.append(build_hallmark_node(h, pubmed_cache))

    for m in mechanisms_raw:
        nodes.append(build_mechanism_node(m, pubmed_cache))

    for d in diseases_raw:
        nodes.append(build_disease_node(d, pubmed_cache))

    valid_ids = {n["id"] for n in nodes}

    # ---- Build edges ----
    edges = build_edges(mechanisms_raw, diseases_raw, valid_ids)

    # ---- Degree & sizes ----
    degree = compute_degree(nodes, edges)
    assign_sizes(nodes, degree)

    # ---- Stats ----
    stats = compute_stats(nodes, edges, degree)

    # ---- Assemble output ----
    graph = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "node_count": stats["node_count"],
            "edge_count": stats["edge_count"],
            "stats": stats,
        },
        "nodes": nodes,
        "links": edges,
    }

    # ---- Write output ----
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(graph, fh, indent=2, ensure_ascii=False)

    # ---- Summary ----
    print(f"\nGraph saved to {OUTPUT_PATH}")
    print(f"\n{'='*50}")
    print(f"  Nodes         : {stats['node_count']}")
    print(f"  Edges         : {stats['edge_count']}")
    print(f"  Avg degree    : {stats['avg_degree']}")
    print(f"  Avg confidence: {stats['avg_confidence']}")
    print(f"\n  Edge types:")
    for etype, count in stats["edge_type_counts"].items():
        print(f"    {etype:<32} {count}")
    print(f"\n  Most connected nodes (top 10):")
    for entry in stats["most_connected_nodes"]:
        print(f"    [{entry['degree']:>3}°] {entry['label']} ({entry['id']})")
    print(f"{'='*50}")

    # Copy to frontend public dir for Vite dev server
    public_dir = REPO_ROOT / "frontend" / "public"
    if public_dir.exists():
        import shutil
        shutil.copy(OUTPUT_PATH, public_dir / "graph.json")
        print(f"\n  Copied to {public_dir / 'graph.json'}")


if __name__ == "__main__":
    main()
