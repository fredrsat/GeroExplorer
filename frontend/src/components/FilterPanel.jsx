import React, { useMemo } from 'react'

const DEFAULT_FILTERS = {
  showHallmarks: true,
  showMechanisms: true,
  showDiseases: true,
  minConfidence: 0,
  selectedSystem: 'all'
}

const NODE_TYPE_BUTTONS = [
  {
    key: 'showHallmarks',
    label: 'Hallmarks',
    color: '#F59E0B',
    darkColor: 'rgba(245,158,11,0.15)',
    borderColor: 'rgba(245,158,11,0.4)'
  },
  {
    key: 'showMechanisms',
    label: 'Mechanisms',
    color: '#3B82F6',
    darkColor: 'rgba(59,130,246,0.15)',
    borderColor: 'rgba(59,130,246,0.4)'
  },
  {
    key: 'showDiseases',
    label: 'Diseases',
    color: '#EF4444',
    darkColor: 'rgba(239,68,68,0.15)',
    borderColor: 'rgba(239,68,68,0.4)'
  }
]

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.8px',
      textTransform: 'uppercase',
      color: '#64748b',
      marginBottom: 8
    }}>
      {children}
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: '#0f172a', margin: '0 16px' }} />
}

export default function FilterPanel({ filters, onFiltersChange, graphData }) {
  // Disease categories (body systems) — graph.json uses `category` on disease nodes
  const systems = useMemo(() => {
    if (!graphData?.nodes) return []
    const set = new Set()
    graphData.nodes.forEach(n => {
      if (n.type === 'disease' && n.category) set.add(n.category)
    })
    return Array.from(set).sort()
  }, [graphData])

  function toggle(key) {
    onFiltersChange({ ...filters, [key]: !filters[key] })
  }

  function setConfidence(val) {
    onFiltersChange({ ...filters, minConfidence: Number(val) })
  }

  function setSystem(val) {
    onFiltersChange({ ...filters, selectedSystem: val })
  }

  function reset() {
    onFiltersChange({ ...DEFAULT_FILTERS })
  }

  const isDefault = (
    filters.showHallmarks === DEFAULT_FILTERS.showHallmarks &&
    filters.showMechanisms === DEFAULT_FILTERS.showMechanisms &&
    filters.showDiseases === DEFAULT_FILTERS.showDiseases &&
    filters.minConfidence === DEFAULT_FILTERS.minConfidence &&
    filters.selectedSystem === DEFAULT_FILTERS.selectedSystem
  )

  return (
    <div style={{ padding: '4px 0' }}>

      {/* ── Node Types ─────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 16px 12px' }}>
        <SectionTitle>Node Types</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {NODE_TYPE_BUTTONS.map(({ key, label, color, darkColor, borderColor }) => {
            const active = filters[key]
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${active ? borderColor : '#334155'}`,
                  background: active ? darkColor : 'transparent',
                  color: active ? color : '#64748b',
                  fontWeight: active ? 600 : 400,
                  fontSize: 13,
                  transition: 'all 0.15s',
                  textAlign: 'left',
                  width: '100%'
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: active ? color : '#475569',
                  flexShrink: 0,
                  transition: 'background 0.15s'
                }} />
                {label}
                {active && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.8 }}>✓</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <Divider />

      {/* ── Min Confidence ──────────────────────────────────────────────── */}
      <div style={{ padding: '12px 16px' }}>
        <SectionTitle>Min Confidence</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filters.minConfidence}
            onChange={e => setConfidence(e.target.value)}
            style={{ flex: 1, accentColor: '#3B82F6', cursor: 'pointer' }}
          />
          <span style={{
            fontSize: 12,
            color: '#e2e8f0',
            fontWeight: 600,
            minWidth: 36,
            textAlign: 'right'
          }}>
            ≥{filters.minConfidence}%
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#64748b' }}>
          <span><span style={{ color: '#22C55E' }}>●</span> &gt;85%</span>
          <span><span style={{ color: '#EAB308' }}>●</span> 60–85%</span>
          <span><span style={{ color: '#F97316' }}>●</span> &lt;60%</span>
        </div>
      </div>

      <Divider />

      {/* ── Disease System ───────────────────────────────────────────────── */}
      {filters.showDiseases && systems.length > 0 && (
        <>
          <div style={{ padding: '12px 16px' }}>
            <SectionTitle>Disease System</SectionTitle>
            <select
              value={filters.selectedSystem}
              onChange={e => setSystem(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 8,
                color: '#e2e8f0',
                fontSize: 12,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Systems</option>
              {systems.map(s => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <Divider />
        </>
      )}

      {/* ── Reset ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '12px 16px' }}>
        <button
          onClick={reset}
          disabled={isDefault}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${isDefault ? '#334155' : 'rgba(239,68,68,0.3)'}`,
            background: isDefault ? 'transparent' : 'rgba(239,68,68,0.08)',
            color: isDefault ? '#475569' : '#f87171',
            fontSize: 12,
            fontWeight: 600,
            transition: 'all 0.15s',
            cursor: isDefault ? 'not-allowed' : 'pointer'
          }}
        >
          Reset Filters
        </button>
      </div>
    </div>
  )
}
