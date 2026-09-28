/**
 * Scope: which tasks the block loads. Task databases can be huge, so nothing
 * is loaded until a project or a person is picked, and then only their tasks:
 *
 * - "link": a row of the Projects (or People) database links to its tasks
 *   through a relation; those tasks are loaded one by one. (Notion can't
 *   filter a query by relation or person, but it can hand over a page.)
 * - "option": a select, status or multi-select of the tasks (e.g. Project);
 *   the query itself is filtered, in Notion.
 */
import { asStrings, pointerIds, textOf } from "./kit/filters/core"
import type { SourceRow, SourceSnapshot } from "./kit/sources"

export type ScopeKind = "project" | "person"
export type Scope = { kind: ScopeKind; id: string; label: string }
/** Where a kind's list comes from: "link:<relation id>" on Projects/People, or "opt:<property id>" on the tasks. */
export type Via = { via: "link"; source: "projects" | "people"; prop: string } | { via: "option"; prop: string; type: string }
export type ViaOption = { key: string; label: string; via: Via }

const OPTION_TYPES = ["select", "status", "multi_select"]
const LINK = /task|ticket|work|alloc|assign|item|aufgab|issue/i
const NAMES: Record<ScopeKind, RegExp> = { project: /project|projekt|client|kunde|initiative|epic/i, person: /person|owner|assignee|who|member|resource|mitarbeit/i }

const cols = (s: SourceSnapshot | undefined, types: string[]) => (s?.bound ? Object.entries(s.propertySchemasById).filter(([, p]) => types.includes(p.type)) : [])

/** Every way to list a kind: links from its own database first, then options of the tasks. */
export function viaOptions(kind: ScopeKind, tasks: SourceSnapshot, own: SourceSnapshot | undefined): ViaOption[] {
	const source: "projects" | "people" = kind === "project" ? "projects" : "people"
	const links = cols(own, ["relation"])
		.sort(([, a], [, b]) => Number(LINK.test(b.name ?? "")) - Number(LINK.test(a.name ?? "")))
		.map(([id, p]) => ({ key: `link:${id}`, label: `${source === "projects" ? "Projects" : "People"} → ${p.name ?? id}`, via: { via: "link" as const, source, prop: id } }))
	const opts = cols(tasks, OPTION_TYPES)
		.sort(([, a], [, b]) => Number(NAMES[kind].test(b.name ?? "")) - Number(NAMES[kind].test(a.name ?? "")))
		.map(([id, p]) => ({ key: `opt:${id}`, label: `Tasks → ${p.name ?? id}`, via: { via: "option" as const, prop: id, type: p.type } }))
	return [...links, ...opts]
}

/** The chosen way (null = automatic, "" = none): a link named like tasks, else an option named like the kind. */
export function resolveVia(kind: ScopeKind, pick: string | null, tasks: SourceSnapshot, own: SourceSnapshot | undefined): ViaOption | null {
	if (pick === "") return null
	const all = viaOptions(kind, tasks, own)
	const chosen = pick ? all.find((o) => o.key === pick) : undefined
	if (chosen) return chosen
	const named = (o: ViaOption) => (o.via.via === "link" ? LINK.test(o.label) : NAMES[kind].test(o.label))
	return all.find(named) ?? null
}

const titleOf = (s: SourceSnapshot, r: SourceRow) => {
	const t = Object.entries(s.propertySchemasById).find(([, p]) => p.type === "title")?.[0]
	return (t ? textOf(r.propertiesById[t]) : textOf(r.propertiesByKey.name)).trim() || "Untitled"
}

/** What can be picked: rows of the linked database, or the options of the task property. */
export function choices(v: ViaOption | null, tasks: SourceSnapshot, own: SourceSnapshot | undefined): { id: string; label: string; count?: number }[] {
	if (!v) return []
	if (v.via.via === "link") {
		const prop = v.via.prop
		return (own?.items ?? []).map((r) => ({ id: r.id, label: titleOf(own!, r), count: pointerIds(r.propertiesById[prop]).length })).sort((a, b) => a.label.localeCompare(b.label))
	}
	const schema = tasks.propertySchemasById[v.via.prop] as { options?: ({ name: string } | string)[] } | undefined
	return (schema?.options ?? []).map((o) => (typeof o === "string" ? o : o.name)).map((n) => ({ id: n, label: n }))
}

/** The Notion filter for an option scope. */
export function optionFilter(v: Via, value: string): object | null {
	if (v.via !== "option") return null
	if (v.type === "multi_select") return { propertyId: v.prop, multi_select: { contains: value } }
	if (v.type === "status") return { propertyId: v.prop, status: { equals: value } }
	return { propertyId: v.prop, select: { equals: value } }
}

/** Whether a task is in an option scope (the mock has no query filters). */
export function inOption(v: Via, row: SourceRow, value: string): boolean {
	if (v.via !== "option") return true
	const x = row.propertiesById[v.prop]
	return v.type === "multi_select" ? asStrings(x).includes(value) : textOf(x).trim() === value
}

/** The tasks a linked row points to. */
export function linkedIds(v: Via, own: SourceSnapshot | undefined, rowId: string): string[] {
	if (v.via !== "link") return []
	const row = own?.items.find((r) => r.id === rowId)
	return row ? pointerIds(row.propertiesById[v.prop]) : []
}
