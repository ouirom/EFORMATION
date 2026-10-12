import { describe, expect, it } from 'vitest'
import {
  directionState,
  hasSomethingToCreate,
  selectAll,
  selectionPayload,
  summaryParts,
  toggleDirection,
  toggleService,
  type CopyDirectionNode,
} from './structureCopy'

const SOURCE: CopyDirectionNode[] = [
  { id: 1, name: 'Commerciale', services: [{ id: 10, name: 'Ventes' }, { id: 11, name: 'Marketing' }] },
  { id: 2, name: 'RH', services: [{ id: 20, name: 'Paie' }] },
  { id: 3, name: 'Audit', services: [] },
]

describe('structure copy selection', () => {
  it('ticks everything by default', () => {
    const selection = selectAll(SOURCE)
    expect(SOURCE.map((d) => directionState(selection, d))).toEqual(['all', 'all', 'all'])
    expect(selectionPayload(selection, SOURCE)).toEqual({ directionIds: [1, 2, 3], serviceIds: [10, 11, 20] })
  })

  it('shows a direction as partly ticked when one of its services is unticked', () => {
    const selection = toggleService(selectAll(SOURCE), SOURCE[0], 11, false)
    expect(directionState(selection, SOURCE[0])).toBe('partial')
    expect(selectionPayload(selection, SOURCE).serviceIds).toEqual([10, 20])
  })

  it('unticks a direction with all its services, and re-ticks them together', () => {
    let selection = toggleDirection(selectAll(SOURCE), SOURCE[0], false)
    expect(directionState(selection, SOURCE[0])).toBe('none')
    expect(selectionPayload(selection, SOURCE)).toEqual({ directionIds: [2, 3], serviceIds: [20] })
    selection = toggleDirection(selection, SOURCE[0], true)
    expect(directionState(selection, SOURCE[0])).toBe('all')
  })

  it('ticks the direction again when one of its services is ticked', () => {
    let selection = toggleDirection(selectAll(SOURCE), SOURCE[1], false)
    selection = toggleService(selection, SOURCE[1], 20, true)
    expect(directionState(selection, SOURCE[1])).toBe('all')
  })

  it('never sends the services of an unticked direction', () => {
    const selection = { directions: new Set([2]), services: new Set([10, 20]) }
    expect(selectionPayload(selection, SOURCE)).toEqual({ directionIds: [2], serviceIds: [20] })
  })
})

describe('structure copy summary', () => {
  it('lists the non-zero counts in order', () => {
    expect(summaryParts({ directionsCreated: 3, directionsMerged: 1, servicesCreated: 7, servicesSkipped: 0 })).toEqual([
      { key: 'directionsCreated', count: 3 },
      { key: 'directionsMerged', count: 1 },
      { key: 'servicesCreated', count: 7 },
    ])
  })

  it('knows when there is nothing to create', () => {
    expect(hasSomethingToCreate({ directionsCreated: 0, directionsMerged: 2, servicesCreated: 0, servicesSkipped: 3 })).toBe(false)
    expect(hasSomethingToCreate({ directionsCreated: 0, directionsMerged: 1, servicesCreated: 1, servicesSkipped: 0 })).toBe(true)
    expect(hasSomethingToCreate(undefined)).toBe(false)
  })
})
