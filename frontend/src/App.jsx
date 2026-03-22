import React, { useState, useCallback, useEffect } from 'react'
import ForceGraph from './components/ForceGraph.jsx'
import NodeDetail from './components/NodeDetail.jsx'
import FilterPanel from './components/FilterPanel.jsx'
import Legend from './components/Legend.jsx'

const DEFAULT_FILTERS = {
  showHallmarks: true,
  showMechanisms: true,
  showDiseases: true,
  minConfidence: 0,
  selectedSystem: 'all'
}

export default function App() {
  const [selectedNode, setSelectedNode] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [searchQuery, setSearchQuery] = useState('')
  const [graphData, setGraphData] = useState(null)
  const [nodeCount, setNodeCount] = useState({ hallmarks: 0, mechanisms: 0, diseases: 0 })

  // Load graph data once so FilterPanel and NodeDetail can use it
  useEffect(() => {
    fetch('/graph.json')
      .then(r => r.json())
      .then(data => {
        const counts = { hallmarks: 0, mechanisms: 0, diseases: 0 }
        data.nodes.forEach(n => {
          if (n.type === 'hallmark') counts.hallmarks++
          else if (n.type === 'mechanism') counts.mechanisms++
          else if (n.type === 'disease') counts.diseases++
        })
        setNodeCount(counts)
        // Normalise: graph.json uses `links` key — expose as both for consumers
        setGraphData({ ...data, edges: data.links ?? [] })
      })
      .catch(() => {})
  }, [])

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node)
  }, [])

  const handleNodeHover = useCallback((node) => {
    setHoveredNode(node)
  }, [])

  const handleFilterChange = useCallback((newFilters) => {
    setFilters(newFilters)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedNode(null)
  }, [])

  return (
    <div className="app-layout">
      {/* Left sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">GeroExplorer</div>
          <div className="sidebar-subtitle">Aging Disease Network</div>
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
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          selectedNodeId={selectedNode?.id ?? null}
        />

        {/* Stats bar */}
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

      {/* Right detail panel */}
      {selectedNode && (
        <NodeDetail
          node={selectedNode}
          allNodes={graphData?.nodes ?? []}
          allEdges={graphData?.edges ?? []}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  )
}
