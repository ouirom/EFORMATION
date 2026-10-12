/**
 * Selection logic of the "copy the structure to another subsidiary" dialog: which
 * directions/services of the source are ticked. Kept free of React so it can be
 * unit-tested.
 */

export interface CopyServiceNode {
  id: number
  name: string
}
export interface CopyDirectionNode {
  id: number
  name: string
  services: CopyServiceNode[]
}

export interface CopySelection {
  directions: Set<number>
  services: Set<number>
}

export interface CopySummary {
  directionsCreated: number
  directionsMerged: number
  servicesCreated: number
  servicesSkipped: number
}

/** Everything ticked: the default when the dialog opens. */
export function selectAll(directions: CopyDirectionNode[]): CopySelection {
  return {
    directions: new Set(directions.map((d) => d.id)),
    services: new Set(directions.flatMap((d) => d.services.map((s) => s.id))),
  }
}

/** Ticking a direction ticks all its services; unticking it unticks them all. */
export function toggleDirection(selection: CopySelection, direction: CopyDirectionNode, checked: boolean): CopySelection {
  const directions = new Set(selection.directions)
  const services = new Set(selection.services)
  if (checked) directions.add(direction.id)
  else directions.delete(direction.id)
  for (const service of direction.services) {
    if (checked) services.add(service.id)
    else services.delete(service.id)
  }
  return { directions, services }
}

/** Ticking a service also ticks its direction; unticking it keeps the direction (copied without it). */
export function toggleService(selection: CopySelection, direction: CopyDirectionNode, serviceId: number, checked: boolean): CopySelection {
  const directions = new Set(selection.directions)
  const services = new Set(selection.services)
  if (checked) {
    services.add(serviceId)
    directions.add(direction.id)
  } else {
    services.delete(serviceId)
  }
  return { directions, services }
}

/** Tri-state of a direction's checkbox: partly = ticked but some of its services aren't. */
export function directionState(selection: CopySelection, direction: CopyDirectionNode): 'all' | 'partial' | 'none' {
  if (!selection.directions.has(direction.id)) return 'none'
  return direction.services.every((s) => selection.services.has(s.id)) ? 'all' : 'partial'
}

/** Request body ids (only services whose direction is ticked). */
export function selectionPayload(selection: CopySelection, directions: CopyDirectionNode[]) {
  const picked = directions.filter((d) => selection.directions.has(d.id))
  return {
    directionIds: picked.map((d) => d.id),
    serviceIds: picked.flatMap((d) => d.services.filter((s) => selection.services.has(s.id)).map((s) => s.id)),
  }
}

/** The non-zero parts of a preview summary, in display order (as i18n key + count). */
export function summaryParts(summary: CopySummary): { key: keyof CopySummary; count: number }[] {
  return (['directionsCreated', 'directionsMerged', 'servicesCreated', 'servicesSkipped'] as const)
    .map((key) => ({ key, count: summary[key] }))
    .filter((part) => part.count > 0)
}

/** Whether applying the copy would create anything at all. */
export const hasSomethingToCreate = (summary?: CopySummary | null) =>
  !!summary && summary.directionsCreated + summary.servicesCreated > 0
