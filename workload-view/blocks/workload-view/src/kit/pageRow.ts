/**
 * A page from `pages.get` (Notion's public API shape) as a data-source row:
 * values flattened the way `useDataSource` returns them and keyed by the
 * data source's raw property ids (matched by name, then by id). Formulas,
 * rollups and Created by aren't returned by `pages.get`, so they're missing.
 */
import type { SourceRow } from "./sources"

type Prop = { id?: string; type?: string; [k: string]: unknown }
const plain = (runs: unknown) => (Array.isArray(runs) ? runs.map((r) => (r as { plain_text?: string; text?: { content?: string } }).plain_text ?? (r as { text?: { content?: string } }).text?.content ?? "").join("") : "")
const nameOf = (o: unknown) => (o && typeof o === "object" ? ((o as { name?: string }).name ?? null) : null)

export function flatValue(p: Prop): unknown {
	const v = p.type ? p[p.type] : undefined
	switch (p.type) {
		case "title":
		case "rich_text":
			return plain(v)
		case "number":
		case "checkbox":
		case "url":
		case "email":
		case "phone_number":
			return v ?? null
		case "select":
		case "status":
			return nameOf(v)
		case "multi_select":
			return Array.isArray(v) ? v.map(nameOf).filter(Boolean) : []
		case "people":
			return Array.isArray(v) ? v.map((u) => ({ id: (u as { id: string }).id, table: "notion_user" })) : []
		case "relation":
			return Array.isArray(v) ? v.map((r) => ({ id: (r as { id: string }).id, table: "block" })) : []
		case "date": {
			const d = v as { start?: string; end?: string | null } | null
			if (!d?.start) return null
			const split = (s: string) => ({ date: s.slice(0, 10), time: s.length > 10 ? s.slice(11, 16) : undefined })
			const a = split(d.start)
			const b = d.end ? split(d.end) : null
			return {
				type: b ? (a.time ? "datetimerange" : "daterange") : a.time ? "datetime" : "date",
				start_date: a.date,
				...(a.time ? { start_time: a.time } : {}),
				...(b ? { end_date: b.date, ...(b.time ? { end_time: b.time } : {}) } : {}),
			}
		}
		default:
			return undefined
	}
}

export function pageToRow(page: { id: string; properties?: Record<string, Prop> }, schemas: Record<string, { name?: string; type: string }>): SourceRow {
	const byName = new Map(Object.entries(schemas).map(([id, s]) => [s.name ?? id, id]))
	const propertiesById: Record<string, unknown> = {}
	for (const [name, p] of Object.entries(page.properties ?? {})) {
		const id = byName.get(name) ?? (p.id && schemas[p.id] ? p.id : p.id ? decodeURIComponent(p.id) : name)
		const v = flatValue(p)
		if (v !== undefined) propertiesById[id] = v
	}
	return { id: page.id, propertiesById, propertiesByKey: {} }
}
