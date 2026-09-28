/**
 * What gets loaded. Task databases can be huge, so nothing is loaded until a
 * filter in the filter bar names a project or a person, and then only those
 * tasks:
 *
 * - A select, status or multi-select of the tasks (e.g. Project, Person):
 *   the query itself is filtered, in Notion.
 * - A Projects (or People) database whose rows relate to their tasks: its
 *   rows are offered as a Project (Person) filter even before any task is
 *   loaded, and the picked rows' tasks are loaded one by one. (Notion can't
 *   filter a query by relation or person, but it can hand over a page.)
 *
 * Once loaded, every rule of the filter bar applies to the tasks as usual.
 */
import { pointerIds, textOf, type FilterProperty, type Rule } from "./kit/filters/core"
import type { SourceRow, SourceSnapshot } from "./kit/sources"

export type ScopeKind = "project" | "person"
/** A filter property backed by a Projects/People database: `own` rows link to tasks through `link`. */
export type LinkProp = { id: string; name: string; kind: ScopeKind; source: "projects" | "people"; link: string; virtual: boolean }

const OPTION_TYPES = ["select", "status", "multi_select"]
const LINK = /task|ticket|work|alloc|assign|item|aufgab|issue/i
const NAMES: Record<ScopeKind, RegExp> = { project: /project|projekt|client|kunde|initiative|epic/i, person: /person|owner|assignee|who|member|resource|mitarbeit/i }
const relations = (s: SourceSnapshot | undefined) => (s?.bound ? Object.entries(s.propertySchemasById).filter(([, p]) => p.type === "relation") : [])

/** The relations of a Projects/People database that could point to the tasks, likeliest first. */
export function linkChoices(own: SourceSnapshot | undefined): { id: string; name: string }[] {
	return relations(own)
		.map(([id, p]) => ({ id, name: p.name ?? id }))
		.sort((a, b) => Number(LINK.test(b.name)) - Number(LINK.test(a.name)))
}

/**
 * The Project and Person filters backed by a database. A relation of the tasks
 * named like the kind is reused (its values are the same pages); otherwise a
 * virtual property is added. `picks` choose the link relation (null = auto, "" = none).
 */
export function linkProps(tasks: SourceSnapshot, dbs: { projects?: SourceSnapshot; people?: SourceSnapshot }, picks: { project: string | null; person: string | null }): LinkProp[] {
	const out: LinkProp[] = []
	for (const kind of ["project", "person"] as const) {
		const source = kind === "project" ? "projects" : "people"
		const own = dbs[source]
		const pick = picks[kind]
		if (pick === "" || !own?.bound) continue
		const choices = linkChoices(own)
		const link = (pick && choices.find((c) => c.id === pick)) || choices.find((c) => LINK.test(c.name)) || (choices.length === 1 && kind === "project" ? choices[0] : undefined)
		if (!link) continue
		const real = relations(tasks).find(([, p]) => NAMES[kind].test(p.name ?? ""))
		if (real) {
			out.push({ id: real[0], name: real[1].name ?? real[0], kind, source, link: link.id, virtual: false })
			continue
		}
		// A task property of the same name would make two "Project" entries: say which one this is.
		const plain = kind === "project" ? "Project" : "Person"
		const taken = Object.values(tasks.propertySchemasById).some((p) => (p.name ?? "").toLowerCase() === plain.toLowerCase())
		out.push({ id: `__${kind}`, name: taken ? `${plain} (${source === "projects" ? "Projects" : "People"} database)` : plain, kind, source, link: link.id, virtual: true })
	}
	return out
}

/** Task properties a query can be filtered by in Notion. */
export function optionProps(tasks: SourceSnapshot): string[] {
	return Object.entries(tasks.propertySchemasById)
		.filter(([, p]) => OPTION_TYPES.includes(p.type))
		.map(([id]) => id)
}

const titleOf = (s: SourceSnapshot, r: SourceRow) => {
	const t = Object.entries(s.propertySchemasById).find(([, p]) => p.type === "title")?.[0]
	return (t ? textOf(r.propertiesById[t]) : textOf(r.propertiesByKey.name)).trim() || "Untitled"
}

/** The rows of a Projects/People database as filter options. */
export function linkOptions(own: SourceSnapshot | undefined): { value: string; label: string }[] {
	return (own?.items ?? []).map((r) => ({ value: r.id, label: titleOf(own!, r) })).sort((a, b) => a.label.localeCompare(b.label))
}

/** task id → the Projects/People rows linking to it (the values of a virtual property). */
export function reverseLinks(own: SourceSnapshot | undefined, link: string): Map<string, string[]> {
	const m = new Map<string, string[]>()
	for (const r of own?.items ?? []) for (const t of pointerIds(r.propertiesById[link])) m.set(t, [...(m.get(t) ?? []), r.id])
	return m
}

const values = (r: Rule): string[] => (Array.isArray(r.value) ? r.value.filter((v): v is string => typeof v === "string") : [])
/** "is" / "contains" with at least one value: the rules that say what to load. */
const loading = (r: Rule) => (r.operator === "is" || r.operator === "contains") && values(r).length > 0

export type Plan = { kind: "none" } | { kind: "query"; filter: object } | { kind: "link"; ids: string[]; more: number }

/**
 * How to load from the filter bar's rules: option rules become the Notion
 * query; otherwise the first database-backed rule loads its rows' tasks.
 */
export function planLoad(rules: Rule[], tasks: SourceSnapshot, links: LinkProp[], dbs: { projects?: SourceSnapshot; people?: SourceSnapshot }, max: number): Plan {
	const opts = new Set(optionProps(tasks))
	const conds: object[] = []
	for (const r of rules) {
		if (!loading(r) || !opts.has(r.propertyId)) continue
		const type = tasks.propertySchemasById[r.propertyId]?.type
		const v = values(r)
		// Notion's option filters take several names and match any of them.
		conds.push(type === "multi_select" ? { propertyId: r.propertyId, multi_select: { contains: v } } : { propertyId: r.propertyId, [type === "status" ? "status" : "select"]: { equals: v.length === 1 ? v[0] : v } })
	}
	if (conds.length) return { kind: "query", filter: conds.length === 1 ? conds[0] : { and: conds.slice(0, 25) } }
	for (const r of rules) {
		const lp = links.find((l) => l.id === r.propertyId)
		if (!lp || !loading(r)) continue
		const own = dbs[lp.source]
		const ids = new Set<string>()
		for (const v of values(r)) for (const t of pointerIds(own?.items.find((x) => x.id === v)?.propertiesById[lp.link])) ids.add(t)
		const all = [...ids]
		return { kind: "link", ids: all.slice(0, max), more: Math.max(0, all.length - max) }
	}
	return { kind: "none" }
}

/** Filter properties with the databases' rows as options (nothing is loaded yet to list them from). */
export function withLinkOptions(props: FilterProperty[], links: LinkProp[], dbs: { projects?: SourceSnapshot; people?: SourceSnapshot }): FilterProperty[] {
	const out = props.map((p) => {
		const lp = links.find((l) => l.id === p.id)
		return lp ? { ...p, name: lp.virtual ? lp.name : p.name, options: linkOptions(dbs[lp.source]) } : p
	})
	// Scope filters first in the "Add filter" menu.
	const rank = (p: FilterProperty) => (links.some((l) => l.id === p.id) ? 0 : 1)
	return out.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(({ p }) => p)
}
