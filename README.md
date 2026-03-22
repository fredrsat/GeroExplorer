# GeroExplorer — Aging Disease Tree

An interactive force-directed graph visualizing the causal chain from **Hallmarks of Aging** → pathophysiological mechanisms → clinical diseases.

## Concept

The core premise: nearly all non-infectious diseases are manifestations of overlapping aging processes. By tracing any disease "backwards" along the graph, you always arrive at one or more hallmarks of aging.

```
Hallmarks of Aging (trunk)
    └── Pathophysiological Mechanisms (branches)
            └── Clinical Diseases (leaves)
```

Cross-links between branches are a first-class feature — e.g. Alzheimer's connects simultaneously to proteostasis failure, neuroinflammation, and mitochondrial dysfunction.

Confidence scores on every edge reflect bibliometric evidence (PubMed publication counts, updatable via the data pipeline).

---

## Current State

### Data (as of current build)

| Layer | Count |
|---|---|
| Hallmarks of Aging | 12 |
| Pathophysiological Mechanisms | 39 |
| Diseases | 155 |
| **Total graph nodes** | **206** |
| **Total graph edges** | **1776** |
| Average degree | 17.2 |

70 diseases curated manually; 85 additional diseases discovered via PubTator3 NER co-occurrence mining (200 abstracts × 2 search terms × 12 hallmarks). All 85 PubTator diseases have mechanism links inferred from their hallmark associations.

**Most connected nodes:**
1. Chronic Inflammation (Inflammaging) — 153 connections
2. Cellular Senescence — 119
3. Mitochondrial Dysfunction — 102

**Hallmarks included** (Lopez-Otín 2013 + 2023 update):

*Primary (cause damage):*
- Genomic Instability
- Telomere Attrition
- Epigenetic Alterations
- Loss of Proteostasis
- Disabled Macroautophagy *(2023)*

*Antagonistic (cellular responses):*
- Deregulated Nutrient Sensing
- Mitochondrial Dysfunction
- Cellular Senescence

*Integrative (final culprits):*
- Stem Cell Exhaustion
- Altered Intercellular Communication
- Chronic Inflammation / Inflammaging *(2023)*
- Dysbiosis *(2023)*

**Disease systems covered:** Neurological, Cardiovascular, Metabolic, Cancer, Musculoskeletal, Renal, Pulmonary, Ophthalmological, Dermatological, Immunological, Psychiatric, Gastrointestinal, Reproductive, Hematological, Endocrine

### Frontend

- Full-screen D3 v7 force-directed graph (React 18 + Vite)
- Node visual encoding:
  - **Color**: Hallmarks = amber, Mechanisms = blue, Diseases = red/coral
  - **Size**: proportional to degree (number of connections)
- Edge visual encoding:
  - **Color**: green (confidence > 0.85), yellow (0.60–0.85), orange (< 0.60)
  - **Width/opacity**: proportional to confidence score
- Click any node → side panel with description, key genes, all connections with relation labels, PubMed link
- Click any connected node in the detail panel → jump to that node as new focus
- Disease nodes: collapsible "Related Diseases" section — siblings grouped by shared mechanism
- 2-hop highlight on selection: selected=full, 1-hop=95%, 2-hop=55%, rest=8%
- Dynamic spacing: highlighted nodes physically separate on selection
- Filter panel: toggle node types, confidence threshold slider, body system filter
- Search by name, zoom/pan/drag
- About panel (? button): explains concept, data sources, confidence model, references
- Click selected node again to deselect

---

## Quick Start

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Build the graph (combines all data files → graph.json)
python3 scripts/build_graph.py

# 3. Start the frontend
cd frontend
npm install
npm run dev
# → Open http://localhost:5173
```

---

## Data Pipeline

```
data/hallmarks.json   ─┐
data/mechanisms.json  ─┼─► scripts/build_graph.py ─► data/graph.json ─► frontend/public/
data/diseases.json    ─┘                                                   served at /graph.json

# Optional: calibrate confidence scores from PubMed
python3 scripts/fetch_pubmed.py --email your@email.com [--dry-run] [--limit N]
python3 scripts/build_graph.py   # rebuild with updated scores
```

`fetch_pubmed.py` queries NCBI Entrez for each node's search terms, computes a log-scaled normalized confidence from publication counts, and saves to `data/pubmed_cache.json`. The next `build_graph.py` run picks this up automatically.

---

## Project Structure

```
GeroExplorer/
├── data/
│   ├── hallmarks.json          # 12 hallmarks with metadata, key genes, biomarkers
│   ├── mechanisms.json         # 39 mechanisms with hallmark links + confidence scores
│   ├── diseases.json           # 155 diseases with mechanism + hallmark cross-links
│   ├── graph.json              # Assembled graph (D3 format: nodes + links)
│   └── pubmed_cache.json       # PubMed evidence cache (generated, gitignored)
├── scripts/
│   ├── build_graph.py          # Assemble graph.json; copy to frontend/public/
│   ├── fetch_pubmed.py         # Fetch PubMed counts for confidence calibration
│   └── fetch_pubtator.py       # PubTator3 NER pipeline (explore/generate/merge)
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Root layout, state management
│   │   ├── index.css           # Dark theme global styles
│   │   └── components/
│   │       ├── ForceGraph.jsx  # D3 force simulation (core)
│   │       ├── NodeDetail.jsx  # Right-panel node info + disease overlap view
│   │       ├── FilterPanel.jsx # Sidebar controls
│   │       ├── About.jsx       # About panel (concept, data sources, references)
│   │       └── Legend.jsx      # Bottom-right legend
│   ├── public/
│   │   └── graph.json          # Served at /graph.json by Vite
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── requirements.txt
├── CLAUDE.md                   # AI assistant context
└── README.md
```

---

## Data Pipeline — Deduplication

When merging PubTator candidates into `diseases.json`, three checks run in order:

1. **ID collision** — generated `disease_snake_case` ID already exists (catches e.g. "Stroke" → same ID as "Ischemic Stroke")
2. **MESH ID** — exact match on MESH concept identifier
3. **Name + word overlap** — character similarity ≥ 0.85, OR all candidate words appear in an existing entry ("Stroke" ⊂ "Ischemic Stroke")

---

## Open Questions / Roadmap

### Confidence model (decision pending)
Currently using bibliometric count (log-scaled publication count per search term). Options:
1. **Bibliometric only** — fast, fully automatable via PubMed
2. **Bibliometric + effect size** — requires parsing abstracts / full text
3. **Bibliometric + study quality weighting** — e.g. RCT > cohort > case study

Decision affects parser complexity significantly.

### Planned next steps
- [ ] Add `key_genes` and `treatments` to all diseases and mechanisms
- [ ] Run `fetch_pubmed.py` to calibrate all ~206 nodes with real PubMed data
- [ ] Expand disease coverage further (currently 155)
- [ ] Add timeline slider: highlight which hallmarks are most active at which age
- [ ] Export: subgraph export for specific disease, downloadable PNG/SVG

---

## References

- Lopez-Otín et al. (2013) *The Hallmarks of Aging.* Cell 153(6):1194–1217
- Lopez-Otín et al. (2023) *Hallmarks of Aging: An Expanding Universe.* Cell 186(2):243–278
- PubMed/NCBI Entrez API for confidence calibration
