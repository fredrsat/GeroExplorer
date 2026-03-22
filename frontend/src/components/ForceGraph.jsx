import React, { useRef, useEffect, useCallback, useState } from 'react'
import * as d3 from 'd3'

// ─── Visual constants ─────────────────────────────────────────────────────────
const NODE_COLORS = {
  hallmark: '#F59E0B',
  mechanism: '#3B82F6',
  disease: '#EF4444'
}

const BASE_NODE_SIZE = {
  hallmark: 20,
  mechanism: 14,
  disease: 10
}

function edgeColor(confidence) {
  if (confidence > 0.85) return '#22C55E'
  if (confidence >= 0.6) return '#EAB308'
  return '#F97316'
}

function edgeOpacity(confidence) {
  return confidence * 0.8 + 0.1
}

function edgeWidth(confidence) {
  return 0.5 + confidence * 3
}

function nodeManyBodyStrength(type) {
  if (type === 'hallmark') return -300
  if (type === 'mechanism') return -150
  return -80
}

function linkDistance(linkType) {
  if (linkType === 'hallmark_to_mechanism') return 120
  if (linkType === 'mechanism_to_disease') return 80
  return 150 // hallmark_to_disease
}

function nodeRadius(node) {
  const base = node.size ?? BASE_NODE_SIZE[node.type] ?? 10
  return Math.min(base, 36)
}

// ─── component ────────────────────────────────────────────────────────────────
export default function ForceGraph({ filters, searchQuery, onNodeHover, onNodeClick, selectedNodeId }) {
  const svgRef = useRef(null)
  const simRef = useRef(null)
  const gRef = useRef(null)
  const nodesDataRef = useRef([])
  const allNodesRef = useRef([])
  const allLinksRef = useRef([])
  const tooltipRef = useRef(null)
  const selectedNodeIdRef = useRef(selectedNodeId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  selectedNodeIdRef.current = selectedNodeId

  // ── Filter helper ──────────────────────────────────────────────────────────
  const getFilteredData = useCallback((allNodes, allLinks, filt, query) => {
    const q = query.trim().toLowerCase()

    const visibleIds = new Set()
    allNodes.forEach(n => {
      if (n.type === 'hallmark' && !filt.showHallmarks) return
      if (n.type === 'mechanism' && !filt.showMechanisms) return
      if (n.type === 'disease' && !filt.showDiseases) return
      if (n.type === 'disease' && filt.selectedSystem !== 'all') {
        // diseases use `category` as the system field
        if (n.category !== filt.selectedSystem) return
      }
      if (q) {
        const inLabel = n.label.toLowerCase().includes(q)
        const inDesc = (n.description ?? '').toLowerCase().includes(q)
        if (!inLabel && !inDesc) return
      }
      visibleIds.add(n.id)
    })

    const filteredNodes = allNodes.filter(n => visibleIds.has(n.id))

    const filteredLinks = allLinks.filter(l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target
      if (!visibleIds.has(srcId) || !visibleIds.has(tgtId)) return false
      if (l.confidence < filt.minConfidence / 100) return false
      return true
    })

    return { filteredNodes, filteredLinks }
  }, [])

  // ── Selection style helper ─────────────────────────────────────────────────
  const applySelectionStyle = useCallback((svg, selId) => {
    if (!svg || svg.empty()) return

    if (!selId) {
      svg.selectAll('.link-line')
        .attr('stroke-opacity', d => edgeOpacity(d.confidence))
        .attr('stroke-width', d => edgeWidth(d.confidence))
      svg.selectAll('.node-circle')
        .attr('stroke-width', d => d.type === 'hallmark' ? 2.5 : 1.5)
        .attr('stroke', d => d3.color(NODE_COLORS[d.type]).brighter(0.5))
      return
    }

    const connectedIds = new Set([selId])
    svg.selectAll('.link-line').each(function(d) {
      const s = typeof d.source === 'object' ? d.source.id : d.source
      const t = typeof d.target === 'object' ? d.target.id : d.target
      if (s === selId || t === selId) {
        connectedIds.add(s)
        connectedIds.add(t)
      }
    })

    svg.selectAll('.link-line')
      .attr('stroke-opacity', function(d) {
        const s = typeof d.source === 'object' ? d.source.id : d.source
        const t = typeof d.target === 'object' ? d.target.id : d.target
        return (s === selId || t === selId) ? edgeOpacity(d.confidence) : 0.04
      })
      .attr('stroke-width', function(d) {
        const s = typeof d.source === 'object' ? d.source.id : d.source
        const t = typeof d.target === 'object' ? d.target.id : d.target
        return (s === selId || t === selId) ? edgeWidth(d.confidence) * 1.6 : 0.5
      })

    svg.selectAll('.node-circle')
      .attr('stroke-width', d => {
        if (d.id === selId) return 4
        if (connectedIds.has(d.id)) return 2.5
        return 1
      })
      .attr('stroke', d => {
        if (d.id === selId) return '#ffffff'
        if (connectedIds.has(d.id)) return d3.color(NODE_COLORS[d.type]).brighter(1)
        return d3.color(NODE_COLORS[d.type]).brighter(0.5)
      })
  }, [])

  // ── One-time SVG setup & data load ─────────────────────────────────────────
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const svg = d3.select(el)
    const w = el.clientWidth
    const h = el.clientHeight

    svg.attr('width', w).attr('height', h)

    // Defs (glow filter)
    const defs = svg.append('defs')
    const filter = defs.append('filter').attr('id', 'node-glow')
    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur')
    const feMerge = filter.append('feMerge')
    feMerge.append('feMergeNode').attr('in', 'coloredBlur')
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Root group (zoom target)
    const g = svg.append('g').attr('class', 'graph-root')
    g.append('g').attr('class', 'links-layer')
    g.append('g').attr('class', 'nodes-layer')
    gRef.current = g

    // Zoom
    const zoom = d3.zoom()
      .scaleExtent([0.08, 12])
      .on('zoom', ev => g.attr('transform', ev.transform))

    svg.call(zoom)
    // Centre the graph with a comfortable initial zoom
    svg.call(zoom.transform, d3.zoomIdentity.translate(w / 2, h / 2).scale(0.55))

    // Disable default dblclick zoom; use it to deselect
    svg.on('dblclick.zoom', null)
    svg.on('dblclick', ev => {
      if (ev.target === el || ev.target.tagName === 'svg') onNodeClick(null)
    })

    // Tooltip
    const tip = d3.select(el.parentElement)
      .append('div')
      .attr('class', 'graph-tooltip')
      .style('display', 'none')
    tooltipRef.current = tip

    // Resize
    const ro = new ResizeObserver(() => {
      if (!svgRef.current) return
      const nw = svgRef.current.clientWidth
      const nh = svgRef.current.clientHeight
      svg.attr('width', nw).attr('height', nh)
      simRef.current?.force('center', d3.forceCenter(0, 0)).alpha(0.1).restart()
    })
    ro.observe(el.parentElement)

    // Load graph data
    fetch('/graph.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} — ${r.statusText}`)
        return r.json()
      })
      .then(data => {
        allNodesRef.current = data.nodes.map(n => ({ ...n }))
        allLinksRef.current = (data.links ?? data.edges ?? []).map(l => ({ ...l }))
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })

    return () => {
      ro.disconnect()
      simRef.current?.stop()
      tip.remove()
      svg.selectAll('*').remove()
      svg.on('.zoom', null).on('dblclick', null)
    }
  }, []) // intentionally run once

  // ── Rebuild simulation when data ready or filters change ───────────────────
  useEffect(() => {
    if (loading || error || !allNodesRef.current.length) return
    const svg = d3.select(svgRef.current)
    const g = gRef.current
    if (!g) return

    const { filteredNodes, filteredLinks } = getFilteredData(
      allNodesRef.current,
      allLinksRef.current,
      filters,
      searchQuery
    )

    // Preserve positions from previous run
    const posMap = new Map()
    nodesDataRef.current.forEach(n => {
      if (n.x != null) posMap.set(n.id, { x: n.x, y: n.y, vx: n.vx ?? 0, vy: n.vy ?? 0 })
    })

    const isFirstRun = posMap.size === 0

    filteredNodes.forEach(n => {
      const prev = posMap.get(n.id)
      if (prev) {
        n.x = prev.x; n.y = prev.y; n.vx = prev.vx; n.vy = prev.vy
      } else if (!isFirstRun) {
        n.x = (Math.random() - 0.5) * 300
        n.y = (Math.random() - 0.5) * 300
      }
      // else: let d3 place randomly on first run (undefined x/y)
    })

    nodesDataRef.current = filteredNodes

    // Stop previous sim
    simRef.current?.stop()

    // ── Simulation ────────────────────────────────────────────────────────
    const sim = d3.forceSimulation(filteredNodes)
      .force('link',
        d3.forceLink(filteredLinks)
          .id(d => d.id)
          .distance(d => linkDistance(d.type))
          .strength(0.35)
      )
      .force('charge',
        d3.forceManyBody()
          .strength(d => nodeManyBodyStrength(d.type))
          .distanceMax(600)
      )
      .force('center', d3.forceCenter(0, 0).strength(0.04))
      .force('collide',
        d3.forceCollide()
          .radius(d => nodeRadius(d) + 6)
          .iterations(2)
      )
      .alphaDecay(0.018)
      .velocityDecay(0.38)

    simRef.current = sim

    // ── Links ──────────────────────────────────────────────────────────────
    const linksLayer = g.select('.links-layer')
    linksLayer.selectAll('.link-line').remove()

    const linkSel = linksLayer
      .selectAll('.link-line')
      .data(filteredLinks)
      .join('line')
      .attr('class', 'link-line')
      .attr('stroke', d => edgeColor(d.confidence))
      .attr('stroke-opacity', d => edgeOpacity(d.confidence))
      .attr('stroke-width', d => edgeWidth(d.confidence))
      .attr('stroke-linecap', 'round')

    // ── Nodes ──────────────────────────────────────────────────────────────
    const nodesLayer = g.select('.nodes-layer')
    nodesLayer.selectAll('.node-group').remove()

    const nodeGroups = nodesLayer
      .selectAll('.node-group')
      .data(filteredNodes, d => d.id)
      .join('g')
      .attr('class', 'node-group')
      .style('cursor', 'pointer')

    nodeGroups.append('circle')
      .attr('class', 'node-circle')
      .attr('r', d => nodeRadius(d))
      .attr('fill', d => NODE_COLORS[d.type])
      .attr('stroke', d => d3.color(NODE_COLORS[d.type]).brighter(0.6))
      .attr('stroke-width', d => d.type === 'hallmark' ? 2.5 : 1.5)
      .attr('fill-opacity', 0.85)

    // Labels: always for hallmarks, conditionally for mechanisms
    nodeGroups.append('text')
      .attr('class', 'node-label')
      .attr('dy', d => nodeRadius(d) + 12)
      .attr('text-anchor', 'middle')
      .attr('fill', '#cbd5e1')
      .attr('font-size', d => d.type === 'hallmark' ? 11 : 9)
      .attr('font-weight', d => d.type === 'hallmark' ? 600 : 400)
      .attr('pointer-events', 'none')
      .style('display', d => {
        if (d.type === 'hallmark') return null
        if (d.type === 'mechanism' && nodeRadius(d) > 16) return null
        return 'none'
      })
      .text(d => {
        const words = d.label.split(' ')
        return words.length <= 3 ? d.label : words.slice(0, 3).join(' ') + '…'
      })

    // ── Drag ───────────────────────────────────────────────────────────────
    const drag = d3.drag()
      .on('start', function(ev, d) {
        if (!ev.active) sim.alphaTarget(0.3).restart()
        d.fx = d.x; d.fy = d.y
        d3.select(this).raise()
      })
      .on('drag', function(ev, d) {
        d.fx = ev.x; d.fy = ev.y
      })
      .on('end', function(ev, d) {
        if (!ev.active) sim.alphaTarget(0)
        d.fx = null; d.fy = null
      })

    nodeGroups.call(drag)

    // ── Hover / click ──────────────────────────────────────────────────────
    nodeGroups
      .on('mouseenter', function(ev, d) {
        onNodeHover(d)
        tooltipRef.current
          ?.style('display', 'block')
          .html(`<div class="tooltip-name">${d.label}</div><div class="tooltip-type">${d.type}</div>`)
        d3.select(this).raise()
        d3.select(this).select('.node-circle')
          .attr('filter', 'url(#node-glow)')
          .attr('fill-opacity', 1)
          .attr('r', nodeRadius(d) * 1.1)
      })
      .on('mousemove', function(ev) {
        if (!tooltipRef.current || !svgRef.current) return
        const rect = svgRef.current.parentElement.getBoundingClientRect()
        tooltipRef.current
          .style('left', (ev.clientX - rect.left + 14) + 'px')
          .style('top', (ev.clientY - rect.top - 10) + 'px')
      })
      .on('mouseleave', function(ev, d) {
        onNodeHover(null)
        tooltipRef.current?.style('display', 'none')
        d3.select(this).select('.node-circle')
          .attr('filter', null)
          .attr('fill-opacity', 0.85)
          .attr('r', nodeRadius(d))
      })
      .on('click', function(ev, d) {
        ev.stopPropagation()
        onNodeClick(d)
      })
      .on('dblclick', function(ev) {
        ev.stopPropagation()
        onNodeClick(null)
      })

    // ── Tick ───────────────────────────────────────────────────────────────
    sim.on('tick', () => {
      linkSel
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)

      nodeGroups.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    // Apply any existing selection highlight
    applySelectionStyle(svg, selectedNodeIdRef.current)

    return () => { sim.stop() }
  }, [loading, error, filters, searchQuery])

  // ── Re-apply selection style when selectedNodeId prop changes ──────────────
  useEffect(() => {
    if (!svgRef.current) return
    applySelectionStyle(d3.select(svgRef.current), selectedNodeId)
  }, [selectedNodeId, applySelectionStyle])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">Loading network data…</div>
        </div>
      )}
      {error && (
        <div className="error-overlay">
          <div className="error-title">Could not load graph data</div>
          <div className="error-message">
            <p>{error}</p>
            <p style={{ marginTop: 8 }}>
              Make sure you have run <code>python scripts/build_graph.py</code> first,
              then start the dev server from the <code>frontend/</code> directory with <code>npm run dev</code>.
            </p>
          </div>
        </div>
      )}
      <svg ref={svgRef} className="graph-canvas" />
    </div>
  )
}
