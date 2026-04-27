'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useDashboardStore } from '@/lib/store'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'

// Well-known parent geographies (continents / macro-regions).
// Any geography in the flat list that matches one of these names becomes a
// collapsible parent; all subsequent entries (until the next parent) are its
// children. Add more here if your data uses different region names.
const KNOWN_PARENT_GEOS = new Set([
  // Do not list "Global" here — it would incorrectly nest all regions under it in the flat list.
  'North America', 'South America', 'Latin America', 'Central America',
  'Europe', 'Western Europe', 'Eastern Europe', 'Central Europe',
  'Asia Pacific', 'Asia-Pacific', 'APAC', 'East Asia', 'South Asia',
  'Southeast Asia', 'Central Asia',
  'Middle East & Africa', 'Middle East', 'MENA', 'MEA', 'Africa',
  'Sub-Saharan Africa', 'North Africa', 'GCC Countries',
  'Oceania', 'Rest of the World',
])

interface GeoNode {
  name: string
  children: string[]
}

/**
 * Convert a flat ordered list of geographies into a tree:
 *   continent / macro-region → [country / sub-region, ...]
 *
 * Geographies that appear before ANY known parent are treated as "global"
 * standalone items (rendered without indentation).
 */
function buildHierarchy(geoList: string[]): {
  standaloneItems: string[]
  tree: GeoNode[]
} {
  const standaloneItems: string[] = []
  const tree: GeoNode[] = []
  let current: GeoNode | null = null

  for (const geo of geoList) {
    if (KNOWN_PARENT_GEOS.has(geo)) {
      current = { name: geo, children: [] }
      tree.push(current)
    } else if (current) {
      current.children.push(geo)
    } else {
      standaloneItems.push(geo)
    }
  }

  return { standaloneItems, tree }
}

export function GeographyMultiSelect() {
  const { data, filters, updateFilters } = useDashboardStore()
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const flatOptions = useMemo(
    () => data?.dimensions?.geographies?.all_geographies ?? [],
    [data]
  )

  const { standaloneItems, tree } = useMemo(
    () => buildHierarchy(flatOptions),
    [flatOptions]
  )

  const searchResults = useMemo(() => {
    if (!searchTerm) return null
    const s = searchTerm.toLowerCase()
    return flatOptions.filter(g => g.toLowerCase().includes(s))
  }, [searchTerm, flatOptions])

  const toggleExpand = (region: string) => {
    setExpandedRegions(prev => {
      const next = new Set(prev)
      next.has(region) ? next.delete(region) : next.add(region)
      return next
    })
  }

  const handleToggle = (geography: string) => {
    const cur = filters.geographies
    updateFilters({
      geographies: cur.includes(geography)
        ? cur.filter(g => g !== geography)
        : [...cur, geography],
    })
  }

  const handleSelectAll = () => {
    if (!data) return
    updateFilters({ geographies: data.dimensions.geographies.all_geographies })
  }

  const handleClearAll = () => updateFilters({ geographies: [] })

  if (!data) return null

  const selectedCount = filters.geographies.length
  const sel = filters.geographies

  // ── renderers ────────────────────────────────────────────────────────────────

  const renderCountryRow = (geo: string, indent = 1) => (
    <label
      key={geo}
      className="flex items-center py-1 hover:bg-blue-50 cursor-pointer select-none"
      style={{ paddingLeft: `${8 + indent * 20}px`, paddingRight: '12px' }}
    >
      <input
        type="checkbox"
        checked={sel.includes(geo)}
        onChange={() => handleToggle(geo)}
        className="mr-2 h-3.5 w-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
      />
      <span className="text-xs text-gray-700 flex-1">{geo}</span>
      {sel.includes(geo) && <Check className="h-3 w-3 text-blue-600 flex-shrink-0" />}
    </label>
  )

  const renderRegionRow = (node: GeoNode) => {
    const isExpanded = expandedRegions.has(node.name)
    const hasChildren = node.children.length > 0
    const regionSelected = sel.includes(node.name)
    const childrenSelectedCount = node.children.filter(g => sel.includes(g)).length

    return (
      <div key={node.name}>
        {/* Region header row */}
        <div className="flex items-center hover:bg-blue-50">
          {/* expand / collapse chevron */}
          {hasChildren ? (
            <button
              onClick={e => { e.stopPropagation(); toggleExpand(node.name) }}
              className="p-1 ml-1 hover:bg-gray-200 rounded flex-shrink-0"
            >
              {isExpanded
                ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                : <ChevronRight className="h-3.5 w-3.5 text-gray-500" />}
            </button>
          ) : (
            <span className="w-6 flex-shrink-0" />
          )}

          {/* region checkbox — only toggles the region itself */}
          <label className="flex items-center py-1.5 cursor-pointer flex-1 select-none pr-3">
            <input
              type="checkbox"
              checked={regionSelected}
              onChange={() => handleToggle(node.name)}
              className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <span className="text-sm font-semibold text-black flex-1">{node.name}</span>
            {childrenSelectedCount > 0 && (
              <span className="text-[10px] text-blue-500 ml-1">
                +{childrenSelectedCount} sub
              </span>
            )}
          </label>
        </div>

        {/* Children — each independently selectable */}
        {isExpanded && hasChildren && (
          <div className="border-l-2 border-blue-100 ml-4">
            {node.children.map(c => renderCountryRow(c, 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 text-left bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
      >
        <span className="text-sm text-black">
          {selectedCount === 0 ? 'Select geographies…' : `${selectedCount} selected`}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-96 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-3 border-b flex-shrink-0">
            <input
              type="text"
              placeholder="Search geographies…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Bulk actions */}
          <div className="px-3 py-2 bg-gray-50 border-b flex gap-2 flex-shrink-0">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
            >
              Select All
            </button>
            <button
              onClick={handleClearAll}
              className="px-3 py-1 text-xs bg-gray-100 text-black rounded hover:bg-gray-200"
            >
              Clear All
            </button>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {searchResults !== null ? (
              searchResults.length === 0 ? (
                <div className="px-3 py-4 text-sm text-center text-gray-500">
                  No geographies found
                </div>
              ) : (
                searchResults.map(g => renderCountryRow(g, 0))
              )
            ) : (
              <>
                {standaloneItems.map(g => renderCountryRow(g, 0))}
                {standaloneItems.length > 0 && tree.length > 0 && (
                  <div className="border-t border-gray-200 my-1" />
                )}
                {tree.map(node => renderRegionRow(node))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
