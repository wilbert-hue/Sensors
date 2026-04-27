'use client'

import { useMemo, useState } from 'react'
import { useDashboardStore } from '@/lib/store'
import { filterData } from '@/lib/data-processor'
import { ArrowUp, ArrowDown, Download } from 'lucide-react'

/** Comparison table: single-year value at 2026; CAGR, growth, share, trend = 2026–2033 */
const COMPARISON_VALUE_YEAR = 2026
const COMPARISON_PERIOD_START = 2026
const COMPARISON_PERIOD_END = 2033

interface ComparisonTableProps {
  title?: string
  height?: number
}

export function ComparisonTable({ title, height = 600 }: ComparisonTableProps) {
  const { data, filters } = useDashboardStore()
  const [sortField, setSortField] = useState<string>('geography')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const tableData = useMemo(() => {
    if (!data) return []

    // Get the appropriate dataset
    const dataset = filters.dataType === 'value'
      ? data.data.value.geography_segment_matrix
      : data.data.volume.geography_segment_matrix

    // Filter data
    const filtered = filterData(dataset, filters)

    // CAGR: (V2033/V2026)^(1/7) − 1
    const cagr2026to2033 = (ts: Record<number, number>) => {
      const a = ts[COMPARISON_PERIOD_START] ?? 0
      const b = ts[COMPARISON_PERIOD_END] ?? 0
      const n = COMPARISON_PERIOD_END - COMPARISON_PERIOD_START
      if (a <= 0 || b <= 0 || n <= 0) return 0
      return (Math.pow(b / a, 1 / n) - 1) * 100
    }

    // Share %: mean 2026–2033 for this segment ÷ sum of those means within the same geography only
    // (multi-region selection must not pool denominators across countries)
    const yearIndices: number[] = []
    for (let y = COMPARISON_PERIOD_START; y <= COMPARISON_PERIOD_END; y++) {
      yearIndices.push(y)
    }
    const periodAvg = (ts: Record<number, number>) => {
      if (yearIndices.length === 0) return 0
      return yearIndices.reduce((s, y) => s + (ts[y] || 0), 0) / yearIndices.length
    }
    const avgs = filtered.map(r => periodAvg(r.time_series))
    const periodAvgSumByGeography = new Map<string, number>()
    for (let i = 0; i < filtered.length; i++) {
      const g = filtered[i]!.geography
      periodAvgSumByGeography.set(g, (periodAvgSumByGeography.get(g) ?? 0) + avgs[i]!)
    }

    // Growth %: total change 2026 → 2033 (aligned with CAGR window)
    const growth2026to2033 = (ts: Record<number, number>) => {
      const a = ts[COMPARISON_PERIOD_START] ?? 0
      const b = ts[COMPARISON_PERIOD_END] ?? 0
      if (a <= 0) return 0
      return ((b - a) / a) * 100
    }

    return filtered.map((record, i) => {
      const geoShareDenom = periodAvgSumByGeography.get(record.geography) ?? 0
      return {
        geography: record.geography,
        segment: record.segment,
        segmentType: record.segment_type,
        currentValue: record.time_series[COMPARISON_VALUE_YEAR] || 0,
        startValue: record.time_series[COMPARISON_PERIOD_START] || 0,
        endValue: record.time_series[COMPARISON_PERIOD_END] || 0,
        growth: growth2026to2033(record.time_series),
        cagr: cagr2026to2033(record.time_series),
        marketShare: geoShareDenom > 0 ? (avgs[i]! / geoShareDenom) * 100 : 0,
        sparkline: Object.entries(record.time_series)
          .filter(([y]) => {
            const yi = parseInt(y, 10)
            return yi >= COMPARISON_PERIOD_START && yi <= COMPARISON_PERIOD_END
          })
          .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
          .map(([, value]) => value)
      }
    })
  }, [data, filters])

  const sortedData = useMemo(() => {
    const sorted = [...tableData].sort((a, b) => {
      const aValue = a[sortField as keyof typeof a]
      const bValue = b[sortField as keyof typeof b]
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
      }
      
      return 0
    })
    return sorted
  }, [tableData, sortField, sortDirection])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const exportToCSV = () => {
    const headers = ['Geography', 'Segment', 'Type', `Value (${COMPARISON_VALUE_YEAR})`, 'Growth % (2026–2033)', 'CAGR % (2026–2033)', 'Share % (mean 2026–2033)']
    const rows = sortedData.map(row => [
      row.geography,
      row.segment,
      row.segmentType,
      row.currentValue.toFixed(2),
      row.growth.toFixed(2),
      typeof row.cagr === 'number' ? row.cagr.toFixed(2) : '0.00',
      row.marketShare.toFixed(2)
    ])
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `comparison-data-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const renderSparkline = (values: number[]) => {
    if (values.length === 0) return null
    const max = Math.max(...values)
    const min = Math.min(...values)
    const range = max - min || 1
    
    return (
      <div className="flex items-end h-8 gap-0.5">
        {values.map((value, i) => (
          <div
            key={i}
            className="flex-1 bg-blue-400 min-w-[3px] rounded-t"
            style={{
              height: `${((value - min) / range) * 100}%`,
              minHeight: '2px'
            }}
          />
        ))}
      </div>
    )
  }

  if (!data || tableData.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-black">No data to display</p>
          <p className="text-sm text-black mt-1">
            Select filters to view the comparison table
          </p>
        </div>
      </div>
    )
  }

  const valueUnit = filters.dataType === 'value' 
    ? `${data.metadata.currency} ${data.metadata.value_unit}`
    : data.metadata.volume_unit

  return (
    <div className="w-full min-w-0 overflow-hidden">
      <div className="mb-4 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-black">
            {title || 'Data Comparison Table'}
          </h3>
          <p className="text-sm text-black mt-1">
            Value: {COMPARISON_VALUE_YEAR} | {valueUnit} | Growth &amp; CAGR: {COMPARISON_PERIOD_START}–{COMPARISON_PERIOD_END} | Trend bars: {COMPARISON_PERIOD_START}–{COMPARISON_PERIOD_END}
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="overflow-auto border rounded-lg" style={{ maxHeight: height }}>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('geography')}
              >
                <div className="flex items-center gap-1">
                  Geography
                  {sortField === 'geography' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('segment')}
              >
                <div className="flex items-center gap-1">
                  Segment
                  {sortField === 'segment' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-black uppercase tracking-wider">
                Type
              </th>
              <th 
                className="px-4 py-3 text-right text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('currentValue')}
              >
                <div className="flex items-center justify-end gap-1">
                  Value ({COMPARISON_VALUE_YEAR})
                  {sortField === 'currentValue' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-black uppercase tracking-wider">
                Trend
              </th>
              <th 
                className="px-4 py-3 text-right text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('growth')}
              >
                <div className="flex items-center justify-end gap-1">
                  Growth % ({COMPARISON_PERIOD_START}–{COMPARISON_PERIOD_END})
                  {sortField === 'growth' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('cagr')}
              >
                <div className="flex items-center justify-end gap-1">
                  CAGR % ({COMPARISON_PERIOD_START}–{COMPARISON_PERIOD_END})
                  {sortField === 'cagr' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right text-xs font-medium text-black uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('marketShare')}
              >
                <div className="flex items-center justify-end gap-1">
                  Share % (mean {COMPARISON_PERIOD_START}–{COMPARISON_PERIOD_END})
                  {sortField === 'marketShare' && (
                    sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.map((row, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-black">
                  {row.geography}
                </td>
                <td className="px-4 py-3 text-sm text-black">
                  {row.segment}
                </td>
                <td className="px-4 py-3 text-sm text-black">
                  {row.segmentType}
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium text-black">
                  {row.currentValue.toFixed(2)}
                </td>
                <td className="px-4 py-3 w-24">
                  {renderSparkline(row.sparkline)}
                </td>
                <td className={`px-4 py-3 text-sm text-right font-medium ${
                  row.growth > 0 ? 'text-green-600' : row.growth < 0 ? 'text-red-600' : 'text-black'
                }`}>
                  {row.growth > 0 && '+'}{row.growth.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-sm text-right text-black">
                  {typeof row.cagr === 'number' ? row.cagr.toFixed(1) : '0.0'}%
                </td>
                <td className="px-4 py-3 text-sm text-right text-black">
                  {typeof row.marketShare === 'number' ? row.marketShare.toFixed(1) : '0.0'}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-center text-sm text-black">
        Showing {sortedData.length} records | Analysis period {COMPARISON_PERIOD_START}–{COMPARISON_PERIOD_END} (value column = {COMPARISON_VALUE_YEAR})
      </div>
    </div>
  )
}
