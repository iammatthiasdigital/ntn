/**
 * Source snapshots: what a bound Notion data source looks like to the block,
 * the same shape whether it comes from the host or from the ?mock=1 harness.
 */
import type { FilterRow, Resolvers, SchemaLike } from "./filters/core"

export type SourceRow = {
	id: string
	propertiesById: Record<string, unknown>
	propertiesByKey: Record<string, unknown>
}

export type SourceSnapshot = {
	/** False when the slot isn't connected to a database (or failed to load). */
	bound: boolean
	items: SourceRow[]
	propertySchemasById: Record<string, SchemaLike>
	propertyIdsByKey: Record<string, string | undefined>
	/** More rows exist beyond the 999-row read limit. */
	truncated: boolean
	/** Rows are (re)loading, e.g. after the query changed. */
	loading?: boolean
}

export const EMPTY_SOURCE: SourceSnapshot = { bound: false, items: [], propertySchemasById: {}, propertyIdsByKey: {}, truncated: false }

/** A property value by manifest key (preferred) or raw id. */
export function prop(src: SourceSnapshot, row: SourceRow, key: string): unknown {
	if (key in row.propertiesByKey) return row.propertiesByKey[key]
	const id = src.propertyIdsByKey[key]
	return id ? row.propertiesById[id] : row.propertiesById[key]
}

export const filterRows = (src: SourceSnapshot): FilterRow[] => src.items.map((r) => ({ id: r.id, props: r.propertiesById }))

/** A property write, in the SDK's page-update shape (keyed by manifest key or raw id). */
export type PropertyWrite = Record<string, object>

export type Mutations = {
	/** Creates a row; resolves to an error message or null. */
	create: (source: string, properties: PropertyWrite) => Promise<string | null>
	update: (source: string, rowId: string, properties: PropertyWrite) => Promise<string | null>
	archive: (source: string, rowId: string) => Promise<string | null>
}

export type BlockData<K extends string> =
	| { status: "loading" }
	| { status: "unbound"; missing: K[] }
	| {
			status: "ready"
			sources: Record<K, SourceSnapshot>
			resolvers: Resolvers
			mutations: Mutations
			storageKey: string
			/** Changes which rows a data source reads (hosted only; the mock has everything). */
			setQuery?: (key: K, q: RowQuery) => void
			/** Loads one page of a data source by id, outside its query (hosted only). */
			fetchRow?: (key: K, id: string) => Promise<SourceRow | null>
	  }

/**
 * What a data source reads: up to `limit` rows (1 = just the schema)
 * matching `filter` (the SDK's filter shape). With more than 999 matching
 * rows, keys read in full page on by `sortBy` (a date property), leaving out
 * rows without one when `empty` is false.
 */
export type RowQuery = { limit: number; filter?: object; sortBy?: string | null; empty?: boolean }

/* ---- write helpers (Notion public API property shapes) ---- */

export const W = {
	title: (s: string) => ({ type: "title", title: [{ type: "text", text: { content: s } }] }),
	text: (s: string) => ({ type: "rich_text", rich_text: s ? [{ type: "text", text: { content: s } }] : [] }),
	number: (n: number | null) => ({ type: "number", number: n }),
	checkbox: (b: boolean) => ({ type: "checkbox", checkbox: b }),
	select: (name: string | null) => ({ type: "select", select: name ? { name } : null }),
	multi: (names: string[]) => ({ type: "multi_select", multi_select: names.map((name) => ({ name })) }),
	people: (ids: string[]) => ({ type: "people", people: ids.map((id) => ({ object: "user", id })) }),
	relation: (ids: string[]) => ({ type: "relation", relation: ids.map((id) => ({ id })) }),
	/** `start`/`end` as `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` (local time). */
	date: (start: string | null, end?: string | null) => ({
		type: "date",
		// Times are wall-clock: send them with the viewer's time zone.
		date: start ? { start, end: end ?? null, ...(start.includes("T") ? { time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}) } : null,
	}),
}
