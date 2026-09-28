/**
 * Reading past the host's 999-row cap. A query returns at most 999 rows and
 * has no cursor, so large databases are read in parts, each a live
 * subscription (edits keep flowing in), merged by row id:
 *
 * - With a window (a date property and a range): one query per week of the
 *   range by start date, one for the latest rows starting before it (still
 *   running into the range), and one for rows without a date.
 * - Without: pages sorted by a date (or number) property, each starting at
 *   the last value of the page before ("on or after"), plus the empty ones.
 */
import { useEffect, useState } from "react"
import { customBlock } from "@notionhq/custom-blocks"
import { dateOf, numberOf } from "./filters/core"
import type { Window } from "./sources"

export const PAGE = 999
const MAX_PAGES = 60

type Row = { id: string; propertiesById: Record<string, unknown> }
type Snap<R extends Row> = { items: R[]; isLoading: boolean; hasMore: boolean; error?: unknown }
export type PageKey = { id: string; kind: "date" | "number" }

/** The property to page by: the first date property, else the first number. */
export function pageKey(schemas: Record<string, { type: string }>): PageKey | null {
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

const dayMs = 86400000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
/** Monday-based weeks covering [from, to], as [start, next start) ISO days. */
export function weeksOf(from: string, to: string, max = 160): [string, string][] {
	const a = Date.parse(from.slice(0, 10) + "T00:00:00Z")
	const b = Date.parse(to.slice(0, 10) + "T00:00:00Z")
	if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return []
	const monday = a - (((new Date(a).getUTCDay() + 6) % 7) * dayMs)
	const out: [string, string][] = []
	for (let t = monday; t <= b && out.length < max; t += 7 * dayMs) out.push([iso(t), iso(t + 7 * dayMs)])
	return out
}
export function weekFilter(prop: string, [start, next]: [string, string]): object {
	return { and: [{ propertyId: prop, date: { on_or_after: start } }, { propertyId: prop, date: { before: next } }] }
}

/** Merges pages by row id; later pages hold the fresher copy of a boundary row. */
export function mergeRows<R extends Row>(pages: R[][]): R[] {
	const out = new Map<string, R>()
	for (const p of pages) for (const r of p) out.set(r.id, r)
	return [...out.values()]
}

/**
 * All rows of `key` once `base` (the ordinary capped query) reports more.
 * Returns null while paging isn't needed or possible.
 */
export function useAllRows<R extends Row>(key: string, base: Snap<R> & { propertySchemasById: Record<string, { type: string }> }, enabled: boolean, win: Window | null = null): { items: R[]; truncated: boolean; loading: boolean } | null {
	const on = enabled && base.hasMore && !base.error
	const w = on && win && base.propertySchemasById[win.dateProp]?.type === "date" ? win : null
	const k = on ? (w ? { id: w.dateProp, kind: "date" as const } : pageKey(base.propertySchemasById)) : null
	const [state, setState] = useState<{ pages: R[][]; loading: boolean; truncated: boolean } | null>(null)
	const kId = k ? `${k.id}:${k.kind}:${w ? `${w.from}/${w.to}` : ""}` : ""
	useEffect(() => {
		if (!k) return setState(null)
		let stopped = false
		const unsubs: (() => void)[] = []
		const pages: R[][] = []
		let truncated = false
		let open = 0
		const publish = () => !stopped && setState({ pages: [...pages], loading: open > 0, truncated })
		const subscribe = (index: number, filter: object | undefined, sorted: boolean | "descending", onFirst: (s: Snap<R>) => void) => {
			let first = true
			open++
			unsubs.push(
				customBlock.subscribeToDataSource({
					key,
					options: { limit: PAGE, ...(filter ? { filter: filter as never } : {}), ...(sorted ? { sorts: [{ propertyId: k.id, direction: sorted === "descending" ? "descending" : "ascending" }] } : {}) },
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
		const mark = (s: Snap<R>) => {
			if (s.hasMore) truncated = true
		}
		// Rows without a value never show up in the date filters.
		subscribe(0, filterEmpty(k), false, mark)
		if (w) {
			// Tasks that started before the range can still run into it: the latest 999 of them.
			subscribe(1, { propertyId: k.id, date: { before: w.from.slice(0, 10) } }, "descending", () => {})
			weeksOf(w.from, w.to).forEach((week, i) => subscribe(2 + i, weekFilter(k.id, week), false, mark))
			return () => {
				stopped = true
				for (const u of unsubs) u()
			}
		}
		const page = (n: number, start: string | number | null) =>
			subscribe(n, start == null ? undefined : filterFrom(k, start), true, (s) => {
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
