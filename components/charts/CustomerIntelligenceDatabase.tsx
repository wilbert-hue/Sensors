'use client'

import { useEffect, useMemo, useState } from 'react'

interface CustomerColumn {
  key: string
  header: string
  /** Top header row label from Excel (Customer Information, Contact Details, …) */
  group?: string
}

interface CustomerDbPayload {
  meta?: { sourceFile?: string; sheet?: string }
  columns: CustomerColumn[]
  records: Record<string, string | number>[]
}

function cellIsHttpLink(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

function columnIsLinkByHeader(header: string): boolean {
  const h = header.toLowerCase()
  return (
    h.includes('linkedin') ||
    (h.includes('website') && h.includes('url')) ||
    h === 'website url' ||
    h.includes('email address')
  )
}

/** Matches Excel-style category strip colors (light tints) */
function groupTopHeaderClass(group: string): string {
  const g = group.trim()
  switch (g) {
    case 'S.No.':
      return 'bg-gray-200 text-gray-900'
    case 'Customer Information':
      return 'bg-orange-100 text-gray-900'
    case 'Contact Details':
      return 'bg-sky-100 text-gray-900'
    case 'Professional Drivers':
      return 'bg-teal-100 text-gray-900'
    case 'Purchasing Behaviour Metrics':
      return 'bg-purple-100 text-gray-900'
    case 'Solution Requirements':
      return 'bg-amber-100 text-gray-900'
    case 'CMI Insights':
      return 'bg-indigo-100 text-gray-900'
    default:
      return 'bg-gray-200 text-gray-900'
  }
}

function groupSubHeaderClass(group: string): string {
  const g = group.trim()
  switch (g) {
    case 'S.No.':
      return 'bg-gray-50 text-gray-900'
    case 'Customer Information':
      return 'bg-orange-50 text-gray-900'
    case 'Contact Details':
      return 'bg-sky-50 text-gray-900'
    case 'Professional Drivers':
      return 'bg-teal-50 text-gray-900'
    case 'Purchasing Behaviour Metrics':
      return 'bg-purple-50 text-gray-900'
    case 'Solution Requirements':
      return 'bg-amber-50 text-gray-900'
    case 'CMI Insights':
      return 'bg-indigo-50 text-gray-900'
    default:
      return 'bg-gray-50 text-gray-900'
  }
}

function buildMergedGroupRow(columns: CustomerColumn[]): { label: string; colspan: number }[] {
  if (!columns.some(c => c.group != null && String(c.group).trim() !== '')) {
    return []
  }
  const groups = columns.map(c => c.group || '—')
  if (groups.length === 0) return []
  const merged: { label: string; colspan: number }[] = []
  let i = 0
  while (i < groups.length) {
    const label = groups[i]
    let span = 1
    while (i + span < groups.length && groups[i + span] === label) {
      span++
    }
    merged.push({ label, colspan: span })
    i += span
  }
  return merged
}

interface Props {
  title?: string
  height?: number
}

export default function CustomerIntelligenceDatabase(_props: Props) {
  const [payload, setPayload] = useState<CustomerDbPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/data/customer_database.json')
      .then(r => {
        if (!r.ok) throw new Error('Could not load customer database')
        return r.json()
      })
      .then((data: CustomerDbPayload) => {
        if (!cancelled) setPayload(data)
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Load error')
      })
    return () => { cancelled = true }
  }, [])

  const groupRow = useMemo(() => {
    if (!payload?.columns) return []
    return buildMergedGroupRow(payload.columns)
  }, [payload])

  if (error) {
    return (
      <div className="p-6 text-red-600 text-sm">
        {error}
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="p-6 text-gray-600 text-sm">
        Loading customer database…
      </div>
    )
  }

  const { columns, records, meta } = payload
  if (!columns?.length || !records?.length) {
    return (
      <div className="p-6 text-gray-600 text-sm">
        No customer records found.
      </div>
    )
  }

  const sourceLabel = meta?.sourceFile || 'Customer Database_Spectral Sensors Market.xlsx'

  return (
    <div className="w-full">
      <h2 className="text-xl font-bold text-black mb-2">Customer Intelligence Database</h2>
      <p className="text-sm text-gray-600 mb-6">
        Spectral Sensors Market — verified directory and insight on customers (source: {sourceLabel}
        {meta?.sheet ? `, sheet “${meta.sheet}”` : ''}).
      </p>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            {groupRow.length > 0 && (
              <tr>
                {groupRow.map((cell, gi) => (
                  <th
                    key={`g-${gi}-${cell.label}`}
                    colSpan={cell.colspan}
                    className={`border border-gray-300 px-2 py-2 text-center text-[11px] font-bold align-middle ${groupTopHeaderClass(
                      cell.label
                    )}`}
                  >
                    {cell.label}
                  </th>
                ))}
              </tr>
            )}
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`border border-gray-300 px-2 py-2 text-left font-semibold align-top min-w-[100px] max-w-[320px] ${groupSubHeaderClass(
                    c.group || '—'
                  )}`}
                >
                  {c.header || c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {columns.map((c) => {
                  const v = row[c.key]
                  const str = v != null ? String(v) : ''
                  const linkByHeader = columnIsLinkByHeader(c.header)
                  const showHttp = linkByHeader && cellIsHttpLink(str)
                  const showMail =
                    linkByHeader && str.includes('@') && !cellIsHttpLink(str) && !str.includes(' ')

                  return (
                    <td key={c.key} className="border border-gray-300 px-2 py-2 text-black align-top break-words">
                      {showHttp ? (
                        <a href={str} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {str}
                        </a>
                      ) : showMail ? (
                        <a href={`mailto:${str}`} className="text-blue-600 hover:underline">{str}</a>
                      ) : !linkByHeader && cellIsHttpLink(str) ? (
                        <a href={str} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {str}
                        </a>
                      ) : !linkByHeader && str.includes('@') && !str.includes(' ') && str.length < 200 ? (
                        <a href={`mailto:${str}`} className="text-blue-600 hover:underline">{str}</a>
                      ) : (
                        str
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
