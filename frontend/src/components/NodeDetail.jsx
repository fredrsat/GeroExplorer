import React, { useMemo } from 'react'

const TYPE_COLORS = {
  hallmark: '#F59E0B',
  mechanism: '#3B82F6',
  disease: '#EF4444'
}

const TYPE_LABELS = {
  hallmark: 'HALLMARK',
  mechanism: 'MECHANISM',
  disease: 'DISEASE'
}

// hallmark categories
const HALLMARK_CATEGORY_COLORS = {
  primary: '#6366f1',
  antagonistic: '#f97316',
  integrative: '#22c55e'
}

// disease categories (body systems)
const SYSTEM_COLORS = {
  neurological: '#a78bfa',
  cardiovascular: '#f43f5e',
  metabolic: '#fb923c',
  endocrine: '#facc15',
  musculoskeletal: '#34d399',
  cancer: '#ef4444',
  pulmonary: '#38bdf8',
  gastrointestinal: '#a3e635',
  immunological: '#c084fc',
  dermatological: '#fda4af',
  ophthalmological: '#67e8f9',
  psychiatric: '#818cf8',
  renal: '#22d3ee',
  hematological: '#fb7185',
  reproductive: '#f9a8d4'
}

// Link type labels
const EDGE_GROUP_LABELS = {
  hallmark_to_mechanism: 'Linked Mechanisms',
  mechanism_to_disease: 'Associated Diseases',
  hallmark_to_disease: 'Associated Diseases',
  related: 'Related Nodes'
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Badge({ label, color = '#0f172a', bg = '#94a3b8' }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      color,
      background: bg,
      flexShrink: 0,
      whiteSpace: 'nowrap'
    }}>
      {label}
    </span>
  )
}

function GeneBadge({ gene }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      color: '#93c5fd',
      background: 'rgba(59,130,246,0.15)',
      border: '1px solid rgba(59,130,246,0.25)',
      margin: '2px'
    }}>
      {gene}
    </span>
  )
}

function ConfidenceBar({ confidence }) {
  const pct = Math.round(confidence * 100)
  const color = confidence > 0.85 ? '#22C55E' : confidence >= 0.6 ? '#EAB308' : '#F97316'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1,
        height: 4,
        background: '#334155',
        borderRadius: 2,
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 0.3s'
        }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600, flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

function SectionHeading({ children, count }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.8px',
      textTransform: 'uppercase',
      color: '#64748b',
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }}>
      {children}
      {count != null && (
        <span style={{
          background: '#334155',
          borderRadius: 10,
          padding: '1px 6px',
          fontSize: 10,
          color: '#94a3b8',
          fontWeight: 600,
          textTransform: 'none',
          letterSpacing: 0
        }}>
          {count}
        </span>
      )}
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────
export default function NodeDetail({ node, allNodes, allEdges, onClose, onNodeSelect }) {
  const nodeMap = useMemo(() => {
    const m = new Map()
    allNodes.forEach(n => m.set(n.id, n))
    return m
  }, [allNodes])

  // Group connections by edge type
  const connections = useMemo(() => {
    if (!node) return {}
    const groups = {}
    allEdges.forEach(e => {
      const srcId = typeof e.source === 'object' ? e.source.id : e.source
      const tgtId = typeof e.target === 'object' ? e.target.id : e.target
      let otherId = null
      if (srcId === node.id) otherId = tgtId
      else if (tgtId === node.id) otherId = srcId
      if (!otherId) return
      const other = nodeMap.get(otherId)
      if (!other) return
      // graph.json uses `type` not `edge_type`
      const groupKey = e.type ?? e.edge_type ?? 'related'
      if (!groups[groupKey]) groups[groupKey] = []
      groups[groupKey].push({ node: other, confidence: e.confidence })
    })
    Object.values(groups).forEach(arr => arr.sort((a, b) => b.confidence - a.confidence))
    return groups
  }, [node, allEdges, nodeMap])

  const pubmedUrl = useMemo(() => {
    if (!node) return null
    const terms = node.pubmed_search_terms
    if (!terms?.length) return null
    return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(terms[0])}`
  }, [node])

  if (!node) return null

  const typeColor = TYPE_COLORS[node.type] ?? '#94a3b8'
  const totalConnections = Object.values(connections).reduce((s, arr) => s + arr.length, 0)

  // Category badge for hallmarks
  const hallmarkCatBg = HALLMARK_CATEGORY_COLORS[node.category]
  // System badge for diseases
  const systemBg = SYSTEM_COLORS[node.category]

  return (
    <aside style={{
      width: 320,
      height: '100%',
      background: '#1e293b',
      borderLeft: '1px solid #334155',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden'
    }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '16px', borderBottom: '1px solid #334155', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            <Badge
              label={TYPE_LABELS[node.type] ?? node.type}
              color={node.type === 'hallmark' ? '#0f172a' : '#ffffff'}
              bg={typeColor}
            />
            {node.type === 'hallmark' && hallmarkCatBg && (
              <Badge label={node.category} color='#ffffff' bg={hallmarkCatBg} />
            )}
            {node.type === 'disease' && node.category && (
              <Badge
                label={node.category}
                color='#0f172a'
                bg={systemBg ?? '#94a3b8'}
              />
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28, height: 28,
              borderRadius: '50%',
              background: '#334155',
              color: '#94a3b8',
              fontSize: 18,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s, color 0.15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#475569'; e.currentTarget.style.color = '#f1f5f9' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#334155'; e.currentTarget.style.color = '#94a3b8' }}
          >
            ×
          </button>
        </div>

        <h2 style={{
          fontSize: 15,
          fontWeight: 700,
          color: '#f1f5f9',
          lineHeight: 1.35,
          marginBottom: 6
        }}>
          {node.label}
        </h2>

        {/* Hallmark: year */}
        {node.type === 'hallmark' && node.year_added && (
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
            Hallmark since <span style={{ color: '#94a3b8' }}>{node.year_added}</span>
          </div>
        )}

        {/* Disease: ICD-10 */}
        {node.type === 'disease' && node.icd10 && (
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
            ICD-10: <span style={{ color: '#e2e8f0', fontFamily: 'monospace', letterSpacing: 1 }}>{node.icd10}</span>
          </div>
        )}

        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
          {totalConnections} connection{totalConnections !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

        {/* Description */}
        {node.description && (
          <section style={{ marginBottom: 16 }}>
            <p style={{
              fontSize: 12,
              color: '#94a3b8',
              lineHeight: 1.65,
              display: '-webkit-box',
              WebkitLineClamp: 7,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {node.description}
            </p>
          </section>
        )}

        {/* Key genes */}
        {node.key_genes?.length > 0 && (
          <section style={{ marginBottom: 16 }}>
            <SectionHeading count={node.key_genes.length}>Key Genes</SectionHeading>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {node.key_genes.slice(0, 24).map(g => (
                <GeneBadge key={g} gene={g} />
              ))}
              {node.key_genes.length > 24 && (
                <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center', marginLeft: 4 }}>
                  +{node.key_genes.length - 24} more
                </span>
              )}
            </div>
          </section>
        )}

        {/* Connections grouped by edge type */}
        {Object.entries(connections).map(([groupKey, items]) => (
          <section key={groupKey} style={{ marginBottom: 16 }}>
            <SectionHeading count={items.length}>
              {EDGE_GROUP_LABELS[groupKey] ?? 'Related'}
            </SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(({ node: other, confidence }) => (
                <div
                  key={other.id}
                  onClick={() => onNodeSelect?.(other)}
                  style={{
                    background: '#0f172a',
                    borderRadius: 8,
                    padding: '8px 10px',
                    border: '1px solid #334155',
                    cursor: onNodeSelect ? 'pointer' : 'default',
                    transition: 'border-color 0.15s, background 0.15s'
                  }}
                  onMouseEnter={e => {
                    if (!onNodeSelect) return
                    e.currentTarget.style.borderColor = TYPE_COLORS[other.type] ?? '#64748b'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#334155'
                    e.currentTarget.style.background = '#0f172a'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 6 }}>
                    <span style={{
                      width: 7, height: 7,
                      borderRadius: '50%',
                      background: TYPE_COLORS[other.type] ?? '#94a3b8',
                      flexShrink: 0,
                      marginTop: 4
                    }} />
                    <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 500, lineHeight: 1.35 }}>
                      {other.label}
                    </span>
                  </div>
                  <ConfidenceBar confidence={confidence} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #334155',
        flexShrink: 0,
        display: 'flex',
        gap: 8
      }}>
        {pubmedUrl && (
          <a
            href={pubmedUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              background: 'rgba(59,130,246,0.12)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 8,
              color: '#93c5fd',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'background 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.22)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(59,130,246,0.12)'}
          >
            PubMed Search →
          </a>
        )}
      </div>
    </aside>
  )
}
