/**
 * Reading past the host's 999-row cap. A query returns at most 999 rows and
 * has no cursor, so when a (scoped) query reports more, the rest is read in
 * pages: rows sorted by a date (or number) property, each page starting at
 * the last value of the page before ("on or after"), one after the other,
 * plus one query for rows where that property is empty. Every page keeps the
 * scope's own filter. Pages are live subscriptions merged by row id.
 */
import { useEffect, useState } from "react"
import { customBlock } from "@notionhq/custom-blocks"
import { dateOf, numberOf } from "./filters/core"

export const PAGE = 999
const MAX_PAGES = 30

type Row = { id: string; propertiesById: Record<string, unknown> }
type Snap<R extends Row> = { items: R[]; isLoading: boolean; hasMore: boolean; error?: unknown }
export type PageKey = { id: string; kind: "date" | "number" }

/** The property to page by: the given date property, else the first date, else the first number. */
export function pageKey(schemas: Record<string, { type: string }>, prefer?: string | null): PageKey | null {
	if (prefer && schemas[prefer]?.type === "date") return { id: prefer, kind: "date" }
	const all = Object.entries(schemas)
	const d = all.find(([, s]) => s.type === "date")
	if (d) return { id: d[0], kind: "date" }
	const n = all.find(([, s]) => s.type === "number")
	return n ? { id: n[0], kind: "number" } : null
}

/** The paging value of a row: a date's start, or a number. */
export function valueOf(k: PageKey, r: Row): string | number | null {
	const v = r.propertiesById[k.id]
	return k.kind === "date" ? (dateOf(v)?.start ?? null) : numberOf(v)
}

/** Where the next page starts: the last value on this page (rows are sorted ascending, empties last). */
export function nextStart(k: PageKey, items: Row[]): string | number | null {
	for (let i = items.length - 1; i >= 0; i--) {
		const v = valueOf(k, items[i])
		if (v != null) return v
	}
	return null
}

export function filterFrom(k: PageKey, start: string | number): object {
	return k.kind === "date" ? { propertyId: k.id, date: { on_or_after: start } } : { propertyId: k.id, number: { greater_than_or_equal_to: start } }
}
export function filterEmpty(k: PageKey): object {
	return k.kind === "date" ? { propertyId: k.id, date: { is_empty: true } } : { propertyId: k.id, number: { is_empty: true } }
}

/** Both filters (the SDK takes one condition or one flat `and` of up to 25). */
export function both(a: object | undefined, b: object | undefined): object | undefined {
	if (!a) return b
	if (!b) return a
	const parts = (f: object) => ((f as { and?: object[] }).and ?? [f])
	return { and: [...parts(a), ...parts(b)] }
}

/** Merges pages by row id; later pages hold the fresher copy of a boundary row. */
export function mergeRows<R extends Row>(pages: R[][]): R[] {
	const out = new Map<string, R>()
	for (const p of pages) for (const r of p) out.set(r.id, r)
	return [...out.values()]
}

export type PagingOptions = { filter?: object; sortBy?: string | null; empty?: boolean }

/**
 * All rows of `key` matching `opts.filter` once `base` (the same query,
 * capped) reports more. Returns null while paging isn't needed or possible.
 */
export function useAllRows<R extends Row>(key: string, base: Snap<R> & { propertySchemasById: Record<string, { type: string }> }, enabled: boolean, opts: PagingOptions = {}): { items: R[]; truncated: boolean; loading: boolean } | null {
	const k = enabled && base.hasMore && !base.error ? pageKey(base.propertySchemasById, opts.sortBy) : null
	const [state, setState] = useState<{ pages: R[][]; loading: boolean; truncated: boolean } | null>(null)
	const kId = k ? `${k.id}:${k.kind}:${JSON.stringify(opts.filter ?? null)}:${opts.empty !== false}` : ""
	useEffect(() => {
		if (!k) return setState(null)
		let stopped = false
		const unsubs: (() => void)[] = []
		const pages: R[][] = []
		let truncated = false
		let open = 0
		const publish = () => !stopped && setState({ pages: [...pages], loading: open > 0, truncated })
		const subscribe = (index: number, filter: object | undefined, sorted: boolean, onFirst: (s: Snap<R>) => void) => {
			let first = true
			open++
			unsubs.push(
				customBlock.subscribeToDataSource({
					key,
					options: { limit: PAGE, ...(filter ? { filter: filter as never } : {}), ...(sorted ? { sorts: [{ propertyId: k.id, direction: "ascending" }] } : {}) },
					onSnapshot: (s) => {
						const snap = s as unknown as Snap<R>
						if (snap.isLoading && snap.items.length === 0) return
						pages[index] = snap.items
						if (first) {
							first = false
							open--
							onFirst(snap)
						}
						publish()
					},
				})
			)
		}
		// Rows without a value never show up in the "on or after" pages.
		if (opts.empty !== false)
			subscribe(0, both(opts.filter, filterEmpty(k)), false, (s) => {
				if (s.hasMore) truncated = true
			})
		// One page at a time: the next starts only once the one before has arrived.
		const page = (n: number, start: string | number | null) =>
			subscribe(n, both(opts.filter, start == null ? undefined : filterFrom(k, start)), true, (s) => {
				if (!s.hasMore) return
				const next = nextStart(k, s.items)
				// No progress (over 999 rows share one value) or too many pages: stop, and say so.
				if (next == null || next === start || n >= MAX_PAGES) truncated = true
				else page(n + 1, next)
			})
		page(1, null)
		return () => {
			stopped = true
			for (const u of unsubs) u()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, kId])
	if (!k || !state) return null
	return { items: mergeRows(state.pages.filter(Boolean)), truncated: state.truncated, loading: state.loading }
}
