/**
 * Standalone harness data: dev-shell seed files turned into the same source
 * snapshots the Notion host delivers (option colors, status groups, built-in
 * properties), plus in-memory mutations so edits round-trip like in Notion.
 */
import type { SchemaLike } from "./filters/core"
import type { Mutations, PropertyWrite, SourceRow, SourceSnapshot } from "./sources"

export type Seed = {
	/** `colors` pins option colors by position (Notion color names). */
	schema: Record<string, { name: string; type: string; options?: string[]; colors?: string[] }>
	rows: ({ id: string } & Record<string, unknown>)[]
}

const COLORS = ["blue", "green", "orange", "purple", "pink", "red", "yellow", "brown", "gray"]
const STATUS_GROUPS = [
	{ id: "g-todo", name: "To-do", color: "gray", match: /not started|to.?do|backlog|planned/i },
	{ id: "g-prog", name: "In progress", color: "blue", match: /progress|doing|review/i },
	{ id: "g-done", name: "Complete", color: "green", match: /done|complete|shipped/i },
]
const STATUS_COLORS: Record<string, string> = { "g-todo": "default", "g-prog": "blue", "g-done": "green" }

export const MOCK_USERS: Record<string, string> = {
	"user-ada-lovelace": "Ada Lovelace",
	"user-grace-hopper": "Grace Hopper",
	"user-alan-turing": "Alan Turing",
	"user-margaret-hamilton": "Margaret Hamilton",
	"user-hedy-lamarr": "Hedy Lamarr",
	"user-radia-perlman": "Radia Perlman",
}
export const MOCK_ME = "user-ada-lovelace"

export function seedSnapshot(seed: Seed, withBuiltins = false): SourceSnapshot {
	const schemas: Record<string, SchemaLike> = {}
	for (const [key, s] of Object.entries(seed.schema)) {
		const sch: SchemaLike = { name: s.name, type: s.type }
		if (s.type === "select" || s.type === "multi_select" || s.type === "status") {
			const names: string[] = [...(s.options ?? [])]
			for (const r of seed.rows) {
				const v = r[key]
				for (const n of Array.isArray(v) ? v : typeof v === "string" ? [v] : []) if (typeof n === "string" && !names.includes(n)) names.push(n)
			}
			if (s.type === "status") {
				const opts = names.map((n, i) => ({ id: `${key}-${i}`, name: n, group: STATUS_GROUPS.find((g) => g.match.test(n))?.id ?? "g-todo" }))
				sch.options = opts.map((o) => ({ id: o.id, name: o.name, color: STATUS_COLORS[o.group] }))
				sch.groups = STATUS_GROUPS.map((g) => ({ id: g.id, name: g.name, color: g.color, option_ids: opts.filter((o) => o.group === g.id).map((o) => o.id) }))
			} else {
				sch.options = names.map((n, i) => ({ id: `${key}-${i}`, name: n, color: s.colors?.[i] ?? COLORS[i % COLORS.length] }))
			}
		}
		schemas[key] = sch
	}
	if (withBuiltins) {
		schemas.created_time = { name: "Created time", type: "created_time" }
		schemas.created_by = { name: "Created by", type: "created_by" }
	}
	const users = Object.keys(MOCK_USERS)
	const items: SourceRow[] = seed.rows.map((r, i) => {
		const { id, ...values } = r
		const byId: Record<string, unknown> = { ...values }
		if (withBuiltins) {
			byId.created_time = { type: "datetime", start_date: `2026-0${1 + (i % 8)}-${String(1 + ((i * 3) % 27)).padStart(2, "0")}`, start_time: "09:30" }
			byId.created_by = [{ id: users[i % users.length], table: "notion_user" }]
		}
		return { id, propertiesById: byId, propertiesByKey: { ...values } }
	})
	const propertyIdsByKey: Record<string, string> = {}
	for (const key of Object.keys(seed.schema)) propertyIdsByKey[key] = key
	return { bound: true, items, propertySchemasById: schemas, propertyIdsByKey, truncated: false }
}

export function mockTitle(sources: Record<string, SourceSnapshot>, id: string): string | undefined {
	for (const s of Object.values(sources)) {
		const row = s.items.find((r) => r.id === id)
		if (row && typeof row.propertiesByKey.name === "string") return row.propertiesByKey.name
	}
	return undefined
}

/** Converts a write (Notion API shape) back to the read shape the host delivers. */
function readShape(w: Record<string, unknown>): unknown {
	switch (w.type) {
		case "title":
		case "rich_text":
			return ((w[w.type as string] as { text: { content: string } }[]) ?? []).map((t) => t.text.content).join("")
		case "number":
			return w.number ?? undefined
		case "checkbox":
			return w.checkbox
		case "select":
		case "status":
			return (w[w.type as string] as { name: string } | null)?.name ?? undefined
		case "multi_select":
			return (w.multi_select as { name: string }[]).map((o) => o.name)
		case "people":
			return (w.people as { id: string }[]).map((p) => ({ id: p.id, table: "notion_user" }))
		case "relation":
			return (w.relation as { id: string }[]).map((p) => ({ id: p.id, table: "block" }))
		case "date": {
			const d = w.date as { start: string; end?: string | null } | null
			if (!d) return undefined
			const [sd, st] = d.start.split("T")
			const [ed, et] = (d.end ?? "").split("T")
			const timed = !!st
			const range = !!d.end
			return {
				type: timed ? (range ? "datetimerange" : "datetime") : range ? "daterange" : "date",
				start_date: sd,
				...(st ? { start_time: st.slice(0, 5) } : {}),
				...(range ? { end_date: ed } : {}),
				...(et ? { end_time: et.slice(0, 5) } : {}),
			}
		}
		default:
			return undefined
	}
}

let seq = 0

/** In-memory mutations for the harness. */
export function mockMutations<K extends string>(setSources: (f: (s: Record<K, SourceSnapshot>) => Record<K, SourceSnapshot>) => void): Mutations {
	const apply = (row: SourceRow, props: PropertyWrite): SourceRow => {
		const byKey = { ...row.propertiesByKey }
		const byId = { ...row.propertiesById }
		for (const [k, w] of Object.entries(props)) {
			const v = readShape(w as Record<string, unknown>)
			if (v === undefined) {
				delete byKey[k]
				delete byId[k]
			} else {
				byKey[k] = v
				byId[k] = v
			}
		}
		return { ...row, propertiesByKey: byKey, propertiesById: byId }
	}
	const edit = (source: string, f: (items: SourceRow[]) => SourceRow[]) =>
		setSources((s) => {
			const snap = s[source as K]
			return { ...s, [source]: { ...snap, items: f(snap.items) } }
		})
	return {
		create: async (source, props) => (edit(source, (items) => [...items, apply({ id: `new-${Date.now().toString(36)}-${seq++}`, propertiesById: {}, propertiesByKey: {} }, props)]), null),
		update: async (source, id, props) => (edit(source, (items) => items.map((r) => (r.id === id ? apply(r, props) : r))), null),
		archive: async (source, id) => (edit(source, (items) => items.filter((r) => r.id !== id)), null),
	}
}
