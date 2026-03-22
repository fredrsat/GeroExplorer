import React, { useState } from 'react'

const SECTION_STYLE = { marginBottom: 20 }
const H_STYLE = { fontSize: 11, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: '#64748b', marginBottom: 8 }
const P_STYLE = { fontSize: 12, color: '#94a3b8', lineHeight: 1.7, margin: 0 }
const LI_STYLE = { fontSize: 12, color: '#94a3b8', lineHeight: 1.7, marginBottom: 4 }

function Dot({ color }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 7, flexShrink: 0, verticalAlign: 'middle' }} />
}

export default function About({ onClose }) {
  return (
    <aside style={{
      width: 360, height: '100%', background: '#1e293b',
      borderLeft: '1px solid #334155', display: 'flex',
      flexDirection: 'column', flexShrink: 0, overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid #334155', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>About GeroExplorer</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>How the network is built</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 28, height: 28, borderRadius: '50%', background: '#334155',
            color: '#94a3b8', fontSize: 18, display: 'flex', alignItems: 'center',
            justifyContent: 'center', border: 'none', cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s', flexShrink: 0
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#475569'; e.currentTarget.style.color = '#f1f5f9' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#334155'; e.currentTarget.style.color = '#94a3b8' }}
        >×</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px' }}>

        <div style={SECTION_STYLE}>
          <div style={H_STYLE}>Core premise</div>
          <p style={P_STYLE}>
            Nearly all non-infectious diseases are manifestations of overlapping aging processes.
            By tracing any disease backwards through its mechanisms, you always arrive at one or
            more of the 12 Hallmarks of Aging.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <div style={H_STYLE}>Network structure</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li style={LI_STYLE}><Dot color="#F59E0B" /><strong style={{ color: '#e2e8f0' }}>Hallmarks</strong> — the 12 root causes of aging (Lopez-Otín 2013 + 2023). Largest nodes.</li>
            <li style={LI_STYLE}><Dot color="#3B82F6" /><strong style={{ color: '#e2e8f0' }}>Mechanisms</strong> — pathophysiological processes bridging hallmarks to disease (e.g. SASP, oxidative stress, neuroinflammation).</li>
            <li style={LI_STYLE}><Dot color="#EF4444" /><strong style={{ color: '#e2e8f0' }}>Diseases</strong> — 155 clinical diagnoses, each linked to multiple mechanisms and hallmarks simultaneously.</li>
          </ul>
          <p style={{ ...P_STYLE, marginTop: 10 }}>
            Cross-links are first-class: a disease like Alzheimer's connects to proteostasis failure,
            neuroinflammation, and mitochondrial dysfunction at the same time — reflecting the
            multi-hallmark reality of aging diseases.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <div style={H_STYLE}>Edge confidence scores</div>
          <p style={P_STYLE}>
            Every connection carries a confidence score (0–1) reflecting the strength of
            published evidence:
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
            <li style={LI_STYLE}><span style={{ color: '#22C55E', fontWeight: 700 }}>Green (&gt;85%)</span> — strong experimental or clinical evidence</li>
            <li style={LI_STYLE}><span style={{ color: '#EAB308', fontWeight: 700 }}>Yellow (60–85%)</span> — established association</li>
            <li style={LI_STYLE}><span style={{ color: '#F97316', fontWeight: 700 }}>Orange (&lt;60%)</span> — emerging or indirect evidence</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <div style={H_STYLE}>Data sources</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li style={LI_STYLE}>
              <strong style={{ color: '#e2e8f0' }}>Manual curation</strong> — 70 diseases and all 39 mechanisms
              were curated by hand against the primary aging literature.
            </li>
            <li style={LI_STYLE}>
              <strong style={{ color: '#e2e8f0' }}>PubTator3 NER</strong> — 85 additional diseases
              were discovered by mining co-occurrences of hallmark terms and disease entities
              across 4 800 PubMed abstracts (200 per hallmark × 2 search terms × 12 hallmarks).
            </li>
            <li style={LI_STYLE}>
              <strong style={{ color: '#e2e8f0' }}>NCBI Entrez / PubMed</strong> — used for
              bibliometric confidence calibration.
            </li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <div style={H_STYLE}>Disease selection criteria</div>
          <p style={P_STYLE}>
            PubTator-discovered diseases must pass a two-part threshold to be included:
            ≥ 20 co-occurrence mentions (absolute) and ≥ 0.1% relative frequency across
            the search corpus. Infectious diseases, pure biological processes (e.g. inflammation,
            carcinogenesis), and broad MESH categories are excluded. ICD-10-coded diagnoses
            are prioritised over generic syndrome labels.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <div style={H_STYLE}>References</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li style={{ ...LI_STYLE, color: '#64748b' }}>
              Lopez-Otín et al. (2013) <em>The Hallmarks of Aging.</em> Cell 153:1194–1217
            </li>
            <li style={{ ...LI_STYLE, color: '#64748b' }}>
              Lopez-Otín et al. (2023) <em>Hallmarks of Aging: An Expanding Universe.</em> Cell 186:243–278
            </li>
            <li style={{ ...LI_STYLE, color: '#64748b' }}>
              Wei et al. (2024) <em>PubTator3.</em> Nucleic Acids Research
            </li>
          </ul>
        </div>

      </div>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #334155', flexShrink: 0 }}>
        <a
          href="https://github.com/fredrsat/GeroExplorer"
          target="_blank" rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '8px 12px', borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', border: '1px solid #334155',
            color: '#94a3b8', fontSize: 12, fontWeight: 600, textDecoration: 'none',
            transition: 'background 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.09)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        >
          View on GitHub
        </a>
      </div>
    </aside>
  )
}
