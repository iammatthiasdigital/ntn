/**
 * Org model. Pure: People rows in, people with managers out; filtering keeps
 * the chart connected by linking each shown person to their nearest shown
 * manager. People with an exit date are never shown, for anyone: their
 * reports move up to the next manager as if they had never been there.
 */
import { pointerIds, textOf } from "./kit/filters/core"
import { prop, type SourceRow, type SourceSnapshot } from "./kit/sources"
import { buildForest } from "./tree"

export type Person = {
	id: string
	name: string
	role: string
	managerIds: string[]
	/** Hidden managers skipped between this person and the shown one (filtering). */
	skipped: number
	/** Name of the direct manager when filters hide them. */
	via?: string
	/** Has an exit date. */
	left: boolean
	row: SourceRow
}

const EXIT_NAME = /\b(exit|leav|left|offboard|austritt|end of employment)/i

/** The Exit date property: the mapped one, else a date property named like it. */
export function exitDateId(src: SourceSnapshot): string | undefined {
	const mapped = src.propertyIdsByKey.exitDate
	if (mapped) return mapped
	return Object.entries(src.propertySchemasById).find(([, s]) => s.type === "date" && EXIT_NAME.test(s.name ?? ""))?.[0]
}

const isEmpty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && !(v as { start_date?: string; start?: string }).start_date && !(v as { start?: string }).start)

export function readPeople(src: SourceSnapshot): Person[] {
	const exit = exitDateId(src)
	const out: Person[] = []
	for (const r of src.items) {
		const name = textOf(prop(src, r, "name")).trim()
		if (!name) continue
		const left = exit ? !isEmpty(r.propertiesById[exit]) : false
		out.push({ id: r.id, name, role: textOf(prop(src, r, "role")).trim(), managerIds: pointerIds(prop(src, r, "reportsTo")), skipped: 0, left, row: r })
	}
	return out
}

/** Everyone without an exit date; reports of a leaver report to the leaver's manager. */
export function current(people: Person[]): Person[] {
	if (!people.some((p) => p.left)) return people
	const keep = new Set(people.filter((p) => !p.left).map((p) => p.id))
	return prune(people, keep).map((p) => ({ ...p, skipped: 0, via: undefined }))
}

/**
 * The people in `keep`, each reporting to their nearest kept manager
 * (cycles and dangling pointers already broken by the forest).
 */
export function prune(people: Person[], keep: ReadonlySet<string>): Person[] {
	const { parentById } = buildForest(people)
	const byId = new Map(people.map((p) => [p.id, p]))
	return people
		.filter((p) => keep.has(p.id))
		.map((p) => {
			const boss = parentById.get(p.id) ?? null
			const via = boss !== null && !keep.has(boss) ? byId.get(boss)?.name : undefined
			let cur = boss
			let skipped = 0
			const seen = new Set([p.id])
			while (cur !== null && !keep.has(cur) && !seen.has(cur)) {
				seen.add(cur)
				skipped++
				cur = parentById.get(cur) ?? null
			}
			return { ...p, managerIds: cur !== null && keep.has(cur) ? [cur] : [], skipped: cur !== null && keep.has(cur) ? skipped : 0, via }
		})
}

/** Ids of everyone with reports, for "open everything". */
export function managers(people: Person[]): Set<string> {
	const { parentById } = buildForest(people)
	const out = new Set<string>()
	for (const m of parentById.values()) if (m !== null) out.add(m)
	return out
}

/** People whose tree depth is below `levels` (0 = roots only), for "open N levels". */
export function openToLevel(people: Person[], levels: number): Set<string> {
	const { roots } = buildForest(people)
	const out = new Set<string>()
	const walk = (n: (typeof roots)[number], d: number) => {
		if (d >= levels) return
		if (n.children.length) out.add(n.person.id)
		for (const c of n.children) walk(c, d + 1)
	}
	for (const r of roots) walk(r, 0)
	return out
}

export const initials = (name: string): string => {
	const p = name.trim().split(/\s+/)
	return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toUpperCase()
}

const HUES = ["blue", "green", "purple", "red", "orange", "pink", "yellow", "brown"] as const
/** Stable per-person tint. */
export function hueFor(seed: string): (typeof HUES)[number] {
	let h = 5381
	for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0
	return HUES[Math.abs(h) % HUES.length]
}
