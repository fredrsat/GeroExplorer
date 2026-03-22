import React, { useMemo, useState, useCallback, useEffect } from 'react'

const TYPE_COLORS = {
  hallmark:  '#F59E0B',
  mechanism: '#3B82F6',
  disease:   '#EF4444'
}

const TYPE_LABELS = {
  hallmark:  'HALLMARK',
  mechanism: 'MECHANISM',
  disease:   'DISEASE'
}

const HALLMARK_CATEGORY_COLORS = {
  primary:      '#6366f1',
  antagonistic: '#f97316',
  integrative:  '#22c55e'
}

const SYSTEM_COLORS = {
  neurological:   '#a78bfa',
  cardiovascular: '#f43f5e',
  metabolic:      '#fb923c',
  endocrine:      '#facc15',
  musculoskeletal:'#34d399',
  cancer:         '#ef4444',
  oncological:    '#ef4444',
  pulmonary:      '#38bdf8',
  gastrointestinal:'#a3e635',
  immunological:  '#c084fc',
  dermatological: '#fda4af',
  ophthalmic:     '#67e8f9',
  ophthalmological:'#67e8f9',
  psychiatric:    '#818cf8',
  renal:          '#22d3ee',
  hematological:  '#fb7185',
  reproductive:   '#f9a8d4',
  hepatic:        '#fbbf24',
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function Badge({ label, color = '#0f172a', bg = '#94a3b8' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
      textTransform: 'uppercase', color, background: bg,
      flexShrink: 0, whiteSpace: 'nowrap'
    }}>
      {label}
    </span>
  )
}

function GeneBadge({ gene }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, color: '#93c5fd',
      background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)',
      margin: '2px'
    }}>
      {gene}
    </span>
  )
}

function ConfidenceBar({ confidence }) {
  const pct   = Math.round((confidence ?? 0) * 100)
  const color = (confidence ?? 0) > 0.85 ? '#22C55E' : (confidence ?? 0) >= 0.6 ? '#EAB308' : '#F97316'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: '#334155', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
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
      fontSize: 10, fontWeight: 700, letterSpacing: '0.8px',
      textTransform: 'uppercase', color: '#64748b',
      marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6
    }}>
      {children}
      {count != null && (
        <span style={{
          background: '#334155', borderRadius: 10, padding: '1px 6px',
          fontSize: 10, color: '#94a3b8', fontWeight: 600,
          textTransform: 'none', letterSpacing: 0
        }}>
          {count}
        </span>
      )}
    </div>
  )
}

// Label for a connection group based on the OTHER node's type — avoids
// duplicate "Associated Diseases" headings when a disease node has both
// hallmark_to_disease and mechanism_to_disease edges.
function connectionGroupLabel(otherType) {
  if (otherType === 'hallmark')   return 'Linked Hallmarks'
  if (otherType === 'mechanism')  return 'Linked Mechanisms'
  if (otherType === 'disease')    return 'Associated Diseases'
  return 'Related'
}

// Short label describing the nature of the edge, from the perspective of
// the currently viewed node (thisType) toward the other node (otherType).
function relationLabel(edgeType, thisType, otherType) {
  if (edgeType === 'hallmark_to_mechanism') {
    if (thisType === 'hallmark')   return 'Drives this mechanism'
    if (thisType === 'mechanism')  return 'Root hallmark driver'
  }
  if (edgeType === 'hallmark_to_disease') {
    if (thisType === 'hallmark')   return 'Directly promotes disease'
    if (thisType === 'disease')    return 'Root cause hallmark'
  }
  if (edgeType === 'mechanism_to_disease') {
    if (thisType === 'mechanism')  return 'Mediates this disease'
    if (thisType === 'disease')    return 'Contributing mechanism'
  }
  return null
}

// ─── DescriptionBlock: collapsible description ────────────────────────────────
function DescriptionBlock({ text }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null

  const isLong = text.length > 220
  const displayed = (!isLong || expanded) ? text : text.slice(0, 220).trimEnd() + '…'

  return (
    <section style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.65, margin: 0 }}>
        {displayed}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: 6, background: 'none', border: 'none', padding: 0,
            color: '#3B82F6', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            letterSpacing: '0.2px'
          }}
        >
          {expanded ? 'Show less ↑' : 'Read more ↓'}
        </button>
      )}
    </section>
  )
}

// ─── main component ───────────────────────────────────────────────────────────
export default function NodeDetail({ node, allNodes, allEdges, onClose, onNodeSelect }) {
  const [showSiblings, setShowSiblings] = useState(false)
  useEffect(() => { setShowSiblings(false) }, [node?.id])

  const nodeMap = useMemo(() => {
    const m = new Map()
    allNodes.forEach(n => m.set(n.id, n))
    return m
  }, [allNodes])

  // Group connections by the OTHER node's type (not edge type)
  // This prevents duplicate section headings like "Associated Diseases" twice
  const connections = useMemo(() => {
    if (!node) return {}
    const groups = {}  // otherType → [{node, confidence, edgeType}]
    allEdges.forEach(e => {
      const srcId = typeof e.source === 'object' ? e.source.id : e.source
      const tgtId = typeof e.target === 'object' ? e.target.id : e.target
      let otherId = null
      if (srcId === node.id) otherId = tgtId
      else if (tgtId === node.id) otherId = srcId
      if (!otherId) return
      const other = nodeMap.get(otherId)
      if (!other) return
      const key = other.type ?? 'related'
      if (!groups[key]) groups[key] = []
      groups[key].push({ node: other, confidence: e.confidence, edgeType: e.type })
    })
    // Sort each group by confidence desc
    Object.values(groups).forEach(arr => arr.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)))
    return groups
  }, [node, allEdges, nodeMap])

  // Sibling diseases: other diseases that share a mechanism with this disease node
  // Grouped by mechanism, sorted by number of siblings desc. Only for disease nodes.
  const siblingsByMech = useMemo(() => {
    if (node?.type !== 'disease') return []

    // Find mechanisms this disease connects to
    const myMechIds = new Set()
    allEdges.forEach(e => {
      if (e.type !== 'mechanism_to_disease') return
      const srcId = typeof e.source === 'object' ? e.source.id : e.source
      const tgtId = typeof e.target === 'object' ? e.target.id : e.target
      if (srcId === node.id || tgtId === node.id) {
        const mechId = nodeMap.get(srcId)?.type === 'mechanism' ? srcId : tgtId
        if (nodeMap.get(mechId)?.type === 'mechanism') myMechIds.add(mechId)
      }
    })

    // For each mechanism, collect sibling diseases
    const mechMap = {}  // mechId → {mechNode, siblings: {diseaseId → confidence}}
    allEdges.forEach(e => {
      if (e.type !== 'mechanism_to_disease') return
      const srcId = typeof e.source === 'object' ? e.source.id : e.source
      const tgtId = typeof e.target === 'object' ? e.target.id : e.target
      const mechId = nodeMap.get(srcId)?.type === 'mechanism' ? srcId : tgtId
      const disId  = nodeMap.get(srcId)?.type === 'mechanism' ? tgtId : srcId
      if (!myMechIds.has(mechId)) return
      if (disId === node.id) return  // skip self
      const disNode = nodeMap.get(disId)
      if (!disNode) return
      if (!mechMap[mechId]) mechMap[mechId] = { mechNode: nodeMap.get(mechId), siblings: {} }
      // keep highest confidence if disease appears via multiple edges
      if ((e.confidence ?? 0) > (mechMap[mechId].siblings[disId]?.confidence ?? 0)) {
        mechMap[mechId].siblings[disId] = { node: disNode, confidence: e.confidence ?? 0 }
      }
    })

    return Object.values(mechMap)
      .map(({ mechNode, siblings }) => ({
        mechNode,
        diseases: Object.values(siblings).sort((a, b) => b.confidence - a.confidence).slice(0, 5)
      }))
      .filter(g => g.diseases.length > 0)
      .sort((a, b) => b.diseases.length - a.diseases.length)
      .slice(0, 5)
  }, [node, allEdges, nodeMap])

  const pubmedUrl = useMemo(() => {
    const terms = node?.pubmed_search_terms
    if (!terms?.length) return null
    return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(terms[0])}`
  }, [node])

  if (!node) return null

  const typeColor      = TYPE_COLORS[node.type] ?? '#94a3b8'
  const totalConns     = Object.values(connections).reduce((s, arr) => s + arr.length, 0)
  const hallmarkCatBg  = HALLMARK_CATEGORY_COLORS[node.category]
  const systemBg       = SYSTEM_COLORS[node.category]

  // Section order: hallmarks first, then mechanisms, then diseases
  const sectionOrder = ['hallmark', 'mechanism', 'disease']
  const sortedGroups = Object.entries(connections).sort(([a], [b]) => {
    const ai = sectionOrder.indexOf(a), bi = sectionOrder.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  return (
    <aside style={{
      width: 320, height: '100%', background: '#1e293b',
      borderLeft: '1px solid #334155', display: 'flex',
      flexDirection: 'column', flexShrink: 0, overflow: 'hidden'
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
              <Badge label={node.category} color='#0f172a' bg={systemBg ?? '#94a3b8'} />
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 28, height: 28, borderRadius: '50%', background: '#334155',
              color: '#94a3b8', fontSize: 18, lineHeight: 1, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              transition: 'background 0.15s, color 0.15s', border: 'none', cursor: 'pointer'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#475569'; e.currentTarget.style.color = '#f1f5f9' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#334155'; e.currentTarget.style.color = '#94a3b8' }}
          >
            ×
          </button>
        </div>

        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.35, marginBottom: 6 }}>
          {node.label}
        </h2>

        {node.type === 'hallmark' && node.year_added && (
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
            Hallmark since <span style={{ color: '#94a3b8' }}>{node.year_added}</span>
          </div>
        )}
        {node.type === 'disease' && node.icd10 && node.icd10 !== 'TBD' && (
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
            ICD-10: <span style={{ color: '#e2e8f0', fontFamily: 'monospace', letterSpacing: 1 }}>{node.icd10}</span>
          </div>
        )}
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
          {totalConns} connection{totalConns !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

        <DescriptionBlock text={node.description} />

        {node.key_genes?.length > 0 && (
          <section style={{ marginBottom: 16 }}>
            <SectionHeading count={node.key_genes.length}>Key Genes</SectionHeading>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {node.key_genes.slice(0, 24).map(g => <GeneBadge key={g} gene={g} />)}
              {node.key_genes.length > 24 && (
                <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center', marginLeft: 4 }}>
                  +{node.key_genes.length - 24} more
                </span>
              )}
            </div>
          </section>
        )}

        {siblingsByMech.length > 0 && (
          <section style={{ marginBottom: 16 }}>
            <button
              onClick={() => setShowSiblings(v => !v)}
              style={{
                width: '100%', background: 'none', border: 'none', padding: 0,
                cursor: 'pointer', textAlign: 'left', marginBottom: showSiblings ? 10 : 0
              }}
            >
              <SectionHeading count={siblingsByMech.reduce((s, g) => s + g.diseases.length, 0)}>
                <span style={{ color: '#64748b' }}>Related Diseases</span>
                <span style={{ fontSize: 10, color: '#475569', fontWeight: 400, marginLeft: 4 }}>
                  {showSiblings ? '▲' : '▼'}
                </span>
              </SectionHeading>
            </button>
            {showSiblings && siblingsByMech.map(({ mechNode, diseases }) => (
              <div key={mechNode.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#3B82F6', fontStyle: 'italic', marginBottom: 5, paddingLeft: 2 }}>
                  via {mechNode.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {diseases.map(({ node: sib, confidence }) => (
                    <div
                      key={sib.id}
                      onClick={() => onNodeSelect?.(sib)}
                      style={{
                        background: '#0f172a', borderRadius: 6, padding: '6px 10px',
                        border: '1px solid #1e3a5f', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        transition: 'border-color 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = '#EF4444'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#1e3a5f'}
                    >
                      <span style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 500 }}>{sib.label}</span>
                      <span style={{ fontSize: 10, color: '#475569', flexShrink: 0, marginLeft: 6 }}>
                        {Math.round((confidence ?? 0) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {sortedGroups.map(([otherType, items]) => (
          <section key={otherType} style={{ marginBottom: 16 }}>
            <SectionHeading count={items.length}>
              {connectionGroupLabel(otherType)}
            </SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(({ node: other, confidence, edgeType }) => (
                <div
                  key={other.id}
                  onClick={() => onNodeSelect?.(other)}
                  style={{
                    background: '#0f172a', borderRadius: 8, padding: '8px 10px',
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
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 4 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: TYPE_COLORS[other.type] ?? '#94a3b8',
                      flexShrink: 0, marginTop: 4
                    }} />
                    <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 500, lineHeight: 1.35 }}>
                      {other.label}
                    </span>
                  </div>
                  {relationLabel(edgeType, node.type, other.type) && (
                    <div style={{ fontSize: 10, color: '#475569', fontStyle: 'italic', marginBottom: 6, paddingLeft: 14 }}>
                      {relationLabel(edgeType, node.type, other.type)}
                    </div>
                  )}
                  <ConfidenceBar confidence={confidence} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid #334155',
        flexShrink: 0, display: 'flex', gap: 8
      }}>
        {pubmedUrl && (
          <a
            href={pubmedUrl} target="_blank" rel="noopener noreferrer"
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: '8px 12px',
              background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 8, color: '#93c5fd', fontSize: 12, fontWeight: 600,
              textDecoration: 'none', transition: 'background 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.22)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(59,130,246,0.12)'}
          >
            PubMed →
          </a>
        )}
      </div>
    </aside>
  )
}
