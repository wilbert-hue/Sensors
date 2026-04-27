'use client'

import { useDashboardStore } from '@/lib/store'
import { GeographyMultiSelect } from './GeographyMultiSelect'
import { BusinessTypeFilter } from './BusinessTypeFilter'
import { SegmentMultiSelect } from './SegmentMultiSelect'
import { YearRangeSlider } from './YearRangeSlider'
import { AggregationLevelSelector } from './AggregationLevelSelector'
import { RotateCcw } from 'lucide-react'

export function FilterPanel() {
  const { filters, updateFilters, resetFilters } = useDashboardStore()

  const handleViewModeChange = (viewMode: 'segment-mode' | 'geography-mode' | 'matrix') => {
    updateFilters({ viewMode })
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-6 sticky top-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <h2 className="text-lg font-semibold text-black">Filters</h2>
        <button
          onClick={resetFilters}
          className="flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-100 text-black rounded hover:bg-gray-200 transition-colors"
          title="Reset all filters"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      {/* View Mode Selector */}
      <div>
        <label className="block text-sm font-medium text-black mb-2">
          View Mode
        </label>
        <select
          value={filters.viewMode}
          onChange={(e) => handleViewModeChange(e.target.value as any)}
          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        >
          <option value="segment-mode">Segment Mode</option>
          <option value="geography-mode">Geography Mode</option>
          <option value="matrix">Matrix View</option>
        </select>
        <p className="mt-1 text-xs text-black">
          {filters.viewMode === 'segment-mode' && 'Compare segments across geographies'}
          {filters.viewMode === 'geography-mode' && 'Compare geographies within a segment'}
          {filters.viewMode === 'matrix' && 'Multi-dimensional comparison'}
        </p>
      </div>


      {/* Geography Filter */}
      <div className="border-t pt-4">
        <GeographyMultiSelect />
      </div>

      {/* Business Type Filter */}
      <div className="border-t pt-4">
        <BusinessTypeFilter />
      </div>

      {/* Segment Filter */}
      <div className="border-t pt-4">
        <SegmentMultiSelect />
      </div>

      {/* Year Range Filter */}
      <div className="border-t pt-4">
        <YearRangeSlider />
      </div>

      {/* Aggregation Level Selector */}
      <div className="border-t pt-4">
        <AggregationLevelSelector />
      </div>

      {/* Filter Summary */}
      <div className="border-t pt-4">
        <h3 className="text-xs font-medium text-black mb-2">Active Filters</h3>
        <div className="space-y-1 text-xs text-black">
          <div>
            <span className="font-medium">Geographies:</span>{' '}
            {filters.geographies.length || 'All'}
          </div>
          <div>
            <span className="font-medium">Segments:</span>{' '}
            {filters.segments.length || 'All'}
          </div>
          <div>
            <span className="font-medium">Years:</span>{' '}
            {filters.yearRange[0]}-{filters.yearRange[1]}
          </div>
          <div>
            <span className="font-medium">Business Type:</span>{' '}
            {filters.businessType}
          </div>
          <div>
            <span className="font-medium">Aggregation Level:</span>{' '}
            {filters.aggregationLevel === null ? 'All Levels' : `Level ${filters.aggregationLevel}`}
          </div>
        </div>
      </div>
    </div>
  )
}

