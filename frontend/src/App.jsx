import React, { useState, useCallback, useEffect } from 'react'
import ForceGraph from './components/ForceGraph.jsx'
import NodeDetail from './components/NodeDetail.jsx'
import FilterPanel from './components/FilterPanel.jsx'
import Legend from './components/Legend.jsx'
import About from './components/About.jsx'

const DEFAULT_FILTERS = {
  showHallmarks: true,
  showMechanisms: true,
  showDiseases: true,
  minConfidence: 0,
  selectedSystem: 'all'
}

export default function App() {
  const [selectedNode, setSelectedNode] = useState(null)
  const [filters, setFilters]           = useState(DEFAULT_FILTERS)
  const [searchQuery, setSearchQuery]   = useState('')
  const [graphData, setGraphData]       = useState(null)
  const [nodeCount, setNodeCount]       = useState({ hallmarks: 0, mechanisms: 0, diseases: 0 })
  const [showAbout, setShowAbout]       = useState(false)

  useEffect(() => {
    fetch('/graph.json')
      .then(r => r.json())
      .then(data => {
        const counts = { hallmarks: 0, mechanisms: 0, diseases: 0 }
        data.nodes.forEach(n => {
          if (n.type === 'hallmark')        counts.hallmarks++
          else if (n.type === 'mechanism')  counts.mechanisms++
          else if (n.type === 'disease')    counts.diseases++
        })
        setNodeCount(counts)
        setGraphData({ ...data, edges: data.links ?? [] })
      })
      .catch(() => {})
  }, [])

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node)
    if (node) setShowAbout(false)
  }, [])

  const handleFilterChange  = useCallback((f) => setFilters(f), [])
  const handleCloseDetail   = useCallback(() => setSelectedNode(null), [])
  const handleToggleAbout   = useCallback(() => {
    setShowAbout(v => !v)
    setSelectedNode(null)
  }, [])

  return (
    <div className="app-layout">
      {/* Left sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div className="sidebar-title">GeroExplorer</div>
              <div className="sidebar-subtitle">Aging Disease Network</div>
            </div>
            <button
              onClick={handleToggleAbout}
              title="About"
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: showAbout ? '#3B82F6' : '#334155',
                color: showAbout ? '#fff' : '#94a3b8',
                fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'background 0.15s, color 0.15s',
                marginTop: 2
              }}
              onMouseEnter={e => { if (!showAbout) e.currentTarget.style.background = '#475569' }}
              onMouseLeave={e => { if (!showAbout) e.currentTarget.style.background = '#334155' }}
            >
              ?
            </button>
          </div>
        </div>

        <div className="sidebar-search">
          <div className="search-wrapper">
            <span className="search-icon">⌕</span>
            <input
              className="search-input"
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="sidebar-filters">
          <FilterPanel
            filters={filters}
            onFiltersChange={handleFilterChange}
            graphData={graphData}
          />
        </div>
      </aside>

      {/* Main graph area */}
      <main className="graph-area">
        <ForceGraph
          filters={filters}
          searchQuery={searchQuery}
          onNodeHover={() => {}}
          onNodeClick={handleNodeClick}
          selectedNodeId={selectedNode?.id ?? null}
        />

        <div className="stats-bar">
          <span className="stat-item">
            <span className="stat-dot" style={{ background: '#F59E0B' }} />
            {nodeCount.hallmarks} Hallmarks
          </span>
          <span className="stat-item">
            <span className="stat-dot" style={{ background: '#3B82F6' }} />
            {nodeCount.mechanisms} Mechanisms
          </span>
          <span className="stat-item">
            <span className="stat-dot" style={{ background: '#EF4444' }} />
            {nodeCount.diseases} Diseases
          </span>
        </div>

        <Legend />
      </main>

      {/* Right panels — About or NodeDetail, mutually exclusive */}
      {showAbout && (
        <About onClose={() => setShowAbout(false)} />
      )}
      {!showAbout && selectedNode && (
        <NodeDetail
          node={selectedNode}
          allNodes={graphData?.nodes ?? []}
          allEdges={graphData?.edges ?? []}
          onClose={handleCloseDetail}
          onNodeSelect={handleNodeClick}
        />
      )}
    </div>
  )
}
