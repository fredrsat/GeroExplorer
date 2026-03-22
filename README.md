# GeroExplorer — Aging Disease Tree

Interactive force-directed graph visualizing the causal chain from **Hallmarks of Aging** → pathophysiological mechanisms → clinical diseases.

## Concept

The trunk of the tree = the 12 Hallmarks of Aging (Lopez-Otín 2013 + 2023 update).
Branches = pathophysiological mechanisms linking hallmarks to disease.
Leaves = clinical diseases, each attached to multiple branches (cross-links).

Confidence scores on every edge reflect bibliometric evidence from PubMed.

## Quick Start

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Build the graph (combines hallmarks + mechanisms + diseases → graph.json)
python3 scripts/build_graph.py

# 3. Start the frontend
cd frontend
npm install
npm run dev
# → Open http://localhost:5173
```

## Data Pipeline

```
data/hallmarks.json   ─┐
data/mechanisms.json  ─┼─► scripts/build_graph.py ─► data/graph.json ─► frontend
data/diseases.json    ─┘

# Optionally fetch PubMed evidence to calibrate confidence scores:
python3 scripts/fetch_pubmed.py --email your@email.com
# Then rebuild:
python3 scripts/build_graph.py
```

## Graph Stats (current)

| | Count |
|--|--|
| Hallmarks | 12 |
| Mechanisms | 39 |
| Diseases | 70 |
| **Total nodes** | **121** |
| **Total edges** | **740** |
| Avg degree | 12.2 |

## Data Sources

- Lopez-Otín et al. (2013) *The Hallmarks of Aging* — Cell
- Lopez-Otín et al. (2023) *Hallmarks of Aging: An Expanding Universe* — Cell
- PubMed/NCBI Entrez (confidence calibration)

## Project Structure

```
Geroexplorer/
├── data/
│   ├── hallmarks.json       # 12 hallmarks with metadata
│   ├── mechanisms.json      # 39 pathophysiological mechanisms
│   ├── diseases.json        # 70 diseases with multi-mechanism links
│   ├── graph.json           # Built graph (nodes + links)
│   └── pubmed_cache.json    # PubMed evidence cache (generated)
├── scripts/
│   ├── build_graph.py       # Assemble graph.json from data files
│   └── fetch_pubmed.py      # Fetch PubMed counts for edge confidence
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   │       ├── ForceGraph.jsx   # D3 force simulation
│   │       ├── NodeDetail.jsx   # Node info panel
│   │       ├── FilterPanel.jsx  # Sidebar controls
│   │       └── Legend.jsx
│   └── public/graph.json    # Served by Vite
└── requirements.txt
```
