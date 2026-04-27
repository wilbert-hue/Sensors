/**
 * Utility functions for Filter Presets
 * Handles dynamic calculation of top regions and segments
 */

import type { ComparisonData, DataRecord, FilterState } from './types'

/**
 * Calculate top regions based on market value for a specific year
 * @param data - The comparison data
 * @param year - The year to evaluate (default 2024)
 * @param topN - Number of top regions to return (default 3)
 * @returns Array of top region names
 */
/**
 * Top-level region names — presets should only pick these so they never
 * accidentally mix a parent region with its own child country in the same set.
 */
const TOP_LEVEL_REGIONS = new Set([
  'North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East & Africa'
])

export function getTopRegionsByMarketValue(
  data: ComparisonData | null,
  year: number = 2023,
  topN: number = 3
): string[] {
  if (!data) return []

  const records = data.data.value.geography_segment_matrix
  const geographyTotals = new Map<string, number>()

  records.forEach((record: DataRecord) => {
    const geography = record.geography
    if (geography === 'Global') return
    // Only accumulate top-level regions so presets never surface U.S. alongside North America
    if (!TOP_LEVEL_REGIONS.has(geography)) return

    const value = record.time_series[year] || 0
    geographyTotals.set(geography, (geographyTotals.get(geography) || 0) + value)
  })

  return Array.from(geographyTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([geography]) => geography)
}

/**
 * Get all first-level segments for a given segment type
 * @param data - The comparison data
 * @param segmentType - The segment type to get segments for
 * @returns Array of first-level segment names
 */
export function getFirstLevelSegments(
  data: ComparisonData | null,
  segmentType: string
): string[] {
  if (!data) return []

  const segmentDimension = data.dimensions.segments[segmentType]
  if (!segmentDimension) return []

  const hierarchy = segmentDimension.hierarchy || {}
  const allSegments = segmentDimension.items || []

  // Find root segments (those that are parents but not children of any other segment)
  const allChildren = new Set(Object.values(hierarchy).flat())
  const firstLevelSegments: string[] = []

  // Add all segments that have children but are not children themselves
  Object.keys(hierarchy).forEach(parent => {
    if (!allChildren.has(parent) && hierarchy[parent].length > 0) {
      firstLevelSegments.push(parent)
    }
  })

  // Also add standalone segments that are neither parents nor children
  allSegments.forEach(segment => {
    if (!allChildren.has(segment) && !hierarchy[segment]) {
      firstLevelSegments.push(segment)
    }
  })

  return firstLevelSegments.sort()
}

/**
 * Get the first available segment type from the data
 * @param data - The comparison data
 * @returns The first segment type name or null
 */
const SEGMENT_TYPE_ORDER = [
  'By Product Type',
  'By Offering',
  'By Technology',
  'By Spectral Range',
  'By Form Factor',
  'By End User',
  'By Region',
  'By Country'
]

export function getFirstSegmentType(data: ComparisonData | null): string | null {
  if (!data || !data.dimensions.segments) return null
  const segmentTypes = Object.keys(data.dimensions.segments)
  for (const preferred of SEGMENT_TYPE_ORDER) {
    if (segmentTypes.includes(preferred)) return preferred
  }
  return segmentTypes.length > 0 ? segmentTypes[0] : null
}

/**
 * Calculate top regions based on CAGR (Compound Annual Growth Rate)
 * @param data - The comparison data
 * @param topN - Number of top regions to return (default 2)
 * @returns Array of top region names sorted by CAGR
 */
export function getTopRegionsByCAGR(
  data: ComparisonData | null,
  topN: number = 2
): string[] {
  if (!data) return []

  const records = data.data.value.geography_segment_matrix
  const geographyCAGRs = new Map<string, number[]>()

  records.forEach((record: DataRecord) => {
    const geography = record.geography
    if (geography === 'Global') return
    // Only top-level regions for "Growth Leaders"
    if (!TOP_LEVEL_REGIONS.has(geography)) return

    if (record.cagr !== undefined && record.cagr !== null) {
      const cagrs = geographyCAGRs.get(geography) || []
      cagrs.push(record.cagr)
      geographyCAGRs.set(geography, cagrs)
    }
  })

  return Array.from(geographyCAGRs.entries())
    .map(([geography, cagrs]) => ({
      geography,
      avgCAGR: cagrs.reduce((a, b) => a + b, 0) / cagrs.length
    }))
    .sort((a, b) => b.avgCAGR - a.avgCAGR)
    .slice(0, topN)
    .map(item => item.geography)
}

/**
 * Calculate top countries based on CAGR (Compound Annual Growth Rate)
 * @param data - The comparison data
 * @param topN - Number of top countries to return (default 5)
 * @returns Array of top country names sorted by CAGR
 */
export function getTopCountriesByCAGR(
  data: ComparisonData | null,
  topN: number = 5
): string[] {
  if (!data) return []

  const records = data.data.value.geography_segment_matrix
  const geographyCAGRs = new Map<string, number[]>()

  records.forEach((record: DataRecord) => {
    const geography = record.geography
    if (geography === 'Global') return
    // Emerging markets = countries/sub-regions only (not top-level regions)
    if (TOP_LEVEL_REGIONS.has(geography)) return

    if (record.cagr !== undefined && record.cagr !== null) {
      const cagrs = geographyCAGRs.get(geography) || []
      cagrs.push(record.cagr)
      geographyCAGRs.set(geography, cagrs)
    }
  })

  return Array.from(geographyCAGRs.entries())
    .map(([geography, cagrs]) => ({
      geography,
      avgCAGR: cagrs.reduce((a, b) => a + b, 0) / cagrs.length
    }))
    .sort((a, b) => b.avgCAGR - a.avgCAGR)
    .slice(0, topN)
    .map(item => item.geography)
}

/**
 * Create dynamic filter configuration for Top Market preset
 * @param data - The comparison data
 * @returns Partial FilterState with dynamic values
 */
export function createTopMarketFilters(data: ComparisonData | null): Partial<FilterState> {
  const topRegions = getTopRegionsByMarketValue(data, 2023, 3)
  const firstSegmentType = getFirstSegmentType(data)
  const firstLevelSegments = firstSegmentType
    ? getFirstLevelSegments(data, firstSegmentType)
    : []

  return {
    viewMode: 'geography-mode', // Geography on X-axis, segments as series
    geographies: topRegions,
    segments: firstLevelSegments,
    segmentType: firstSegmentType || 'By Technology',
    yearRange: [2023, 2027],
    dataType: 'value'
  }
}

/**
 * Create dynamic filter configuration for Growth Leaders preset
 * Identifies top 2 regions with highest CAGR and uses first segment type with all first-level segments
 */
export function createGrowthLeadersFilters(data: ComparisonData | null): Partial<FilterState> {
  if (!data) return {
    viewMode: 'geography-mode',
    yearRange: [2025, 2031],
    dataType: 'value'
  }

  // Get top 2 regions with highest CAGR
  const topRegions = getTopRegionsByCAGR(data, 2)
  const firstSegmentType = getFirstSegmentType(data)
  const firstLevelSegments = firstSegmentType
    ? getFirstLevelSegments(data, firstSegmentType)
    : []

  return {
    viewMode: 'geography-mode', // Geography on X-axis, segments as series
    geographies: topRegions,
    segments: firstLevelSegments,
    segmentType: firstSegmentType || 'By Technology',
    yearRange: [2025, 2031],
    dataType: 'value'
  }
}

/**
 * Create dynamic filter configuration for Emerging Markets preset
 * Identifies top 5 countries with highest CAGR and uses first segment type with all first-level segments
 */
export function createEmergingMarketsFilters(data: ComparisonData | null): Partial<FilterState> {
  if (!data) return {
    viewMode: 'geography-mode',
    yearRange: [2025, 2031],
    dataType: 'value'
  }

  // Get top 5 countries with highest CAGR
  const topCountries = getTopCountriesByCAGR(data, 5)
  const firstSegmentType = getFirstSegmentType(data)
  const firstLevelSegments = firstSegmentType
    ? getFirstLevelSegments(data, firstSegmentType)
    : []

  return {
    viewMode: 'geography-mode', // Geography on X-axis, segments as series
    geographies: topCountries,
    segments: firstLevelSegments,
    segmentType: firstSegmentType || 'By Technology',
    yearRange: [2025, 2031],
    dataType: 'value'
  }
}
