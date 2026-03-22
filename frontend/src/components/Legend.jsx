import React, { useState } from 'react'

export default function Legend() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{
      position: 'absolute',
      bottom: 56,
      right: 16,
      background: 'rgba(15, 23, 42, 0.9)',
      border: '1px solid #334155',
      borderRadius: 10,
      padding: collapsed ? '8px 12px' : '12px 14px',
      backdropFilter: 'blur(8px)',
      fontSize: 11,
      color: '#94a3b8',
      minWidth: 180,
      zIndex: 20,
      boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      transition: 'padding 0.2s'
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: collapsed ? 0 : 10,
          cursor: 'pointer',
          userSelect: 'none'
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#64748b' }}>
          Legend
        </span>
        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>
          {collapsed ? '▲' : '▼'}
        </span>
      </div>

      {!collapsed && (
        <>
          {/* Node types */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>
              Node Type
            </div>
            {[
              { color: '#F59E0B', label: 'Hallmark' },
              { color: '#3B82F6', label: 'Mechanism' },
              { color: '#EF4444', label: 'Disease' }
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: color,
                  flexShrink: 0,
                  display: 'inline-block'
                }} />
                <span style={{ fontSize: 11 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Edge confidence */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 }}>
              Edge Confidence
            </div>
            {[
              { color: '#22C55E', label: 'High (>85%)' },
              { color: '#EAB308', label: 'Medium (60–85%)' },
              { color: '#F97316', label: 'Low (<60%)' }
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <span style={{
                  width: 20,
                  height: 3,
                  background: color,
                  borderRadius: 2,
                  flexShrink: 0,
                  display: 'inline-block'
                }} />
                <span style={{ fontSize: 11 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Instructions */}
          <div style={{
            borderTop: '1px solid #1e293b',
            paddingTop: 8,
            fontSize: 10,
            color: '#475569',
            lineHeight: 1.6
          }}>
            Click node for details<br />
            Scroll to zoom • Drag to pan<br />
            Double-click to deselect
          </div>
        </>
      )}
    </div>
  )
}
