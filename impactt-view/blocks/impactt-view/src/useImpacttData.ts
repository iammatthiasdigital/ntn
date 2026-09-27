import { useEffect, useMemo, useRef, useState } from "react"
import { pages, users } from "@notionhq/custom-blocks"
import { useBlockId, useCurrentUser, useDataSource } from "@notionhq/custom-blocks/react"
import { pointerIds, textOf } from "./filters/core"
import type { SourceRow, SourceSnapshot, Sources } from "./dataset"
import { GROWTH_NAMES, lastDayOf, TIMING_NAMES, type ImpacttData, type Writer } from "./sources"
import type { Growth, Timing } from "./model"

const LIMIT = 999
const CONCURRENCY = 5
/** Cap on per-id lookups (pages.get / users.get) for names of related pages and people. */
const MAX_LOOKUPS = 150

type QueryResult = ReturnType<typeof useDataSource>
type Row = QueryResult["items"][number]

function toSnapshot(q: QueryResult): SourceSnapshot {
	return {
		bound: !q.error && q.collectionSchema !== undefined,
		items: q.items.map((r) => ({
			id: r.id,
			propertiesById: r.propertiesById as Record<string, unknown>,
			propertiesByKey: r.propertiesByKey as Record<string, unknown>,
		})),
		propertySchemasById: q.propertySchemasById as SourceSnapshot["propertySchemasById"],
		propertyIdsByKey: q.propertyIdsByKey,
		truncated: q.hasMore,
		collectionId: q.collectionSchema?.id,
	}
}

async function mapLimited<T>(ids: string[], fn: (id: string) => Promise<T>): Promise<Map<string, T>> {
	const queue = [...ids]
	const out = new Map<string, T>()
	await Promise.all(
		Array.from({ length: CONCURRENCY }, async () => {
			for (;;) {
				const id = queue.shift()
				if (id === undefined) return
				try {
					out.set(id, await fn(id))
				} catch {
					// Leave it unresolved; the UI falls back to a placeholder.
				}
			}
		})
	)
	return out
}

function titleOfPage(page: { properties?: Record<string, unknown> }): string | undefined {
	for (const v of Object.values(page.properties ?? {})) {
		if (v && typeof v === "object" && (v as { type?: string }).type === "title") {
			const runs = (v as { title?: { plain_text?: string }[] }).title ?? []
			const t = runs.map((r) => r.plain_text ?? "").join("").trim()
			return t || undefined
		}
	}
	return undefined
}

function useSnapshot(q: QueryResult): SourceSnapshot {
	// eslint-disable-next-line react-hooks/exhaustive-deps
	return useMemo(() => toSnapshot(q), [q.items, q.propertySchemasById, q.propertyIdsByKey, q.hasMore, q.error, q.collectionSchema])
}

/** Ids referenced by every property of the given types, across rows. */
function referencedIds(snap: SourceSnapshot, types: string[]): string[] {
	const props = Object.entries(snap.propertySchemasById)
		.filter(([, s]) => types.includes(s.type))
		.map(([id]) => id)
	const ids = new Set<string>()
	for (const r of snap.items) for (const p of props) for (const id of pointerIds(r.propertiesById[p])) ids.add(id)
	return [...ids]
}

/**
 * Real data layer: the three bound data sources, names for people and
 * related pages referenced by initiatives (resolved lazily, bounded), and
 * write-backs through each row's `update` helper.
 */
export function useImpacttData(): ImpacttData {
	const iq = useDataSource("initiatives", { limit: LIMIT })
	const kq = useDataSource("kpis", { limit: LIMIT })
	const mq = useDataSource("impacts", { limit: LIMIT })
	const me = useCurrentUser()
	const blockId = useBlockId()

	const ini = useSnapshot(iq)
	const kpi = useSnapshot(kq)
	const imp = useSnapshot(mq)
	const sources = useMemo<Sources>(() => ({ initiatives: ini, kpis: kpi, impacts: imp }), [ini, kpi, imp])
	// Writers read the latest query results without changing identity.
	const latest = useRef({ iq, kq })
	latest.current = { iq, kq }

	/* ---- people ---- */
	const [userNames, setUserNames] = useState<ReadonlyMap<string, string>>(new Map())
	const listedRef = useRef(false)
	const askedUsersRef = useRef(new Set<string>())
	const personIds = useMemo(() => referencedIds(sources.initiatives, ["people", "created_by", "last_edited_by"]), [sources.initiatives])
	useEffect(() => {
		if (personIds.length === 0) return
		let cancelled = false
		void (async () => {
			const found = new Map<string, string>()
			if (!listedRef.current) {
				listedRef.current = true
				let cursor: string | undefined
				for (let page = 0; page < 10; page++) {
					const res = await users.list(cursor ? { pageSize: 100, startCursor: cursor } : { pageSize: 100 }).catch(() => null)
					if (!res || res.status !== "success") break
					for (const u of res.list.results) if (u.name) found.set(u.id, u.name)
					if (!res.list.has_more || !res.list.next_cursor) break
					cursor = res.list.next_cursor
				}
			}
			const missing = personIds.filter((id) => !found.has(id) && !userNames.has(id) && !askedUsersRef.current.has(id)).slice(0, MAX_LOOKUPS)
			for (const id of missing) askedUsersRef.current.add(id)
			const got = await mapLimited(missing, async (id) => {
				const res = await users.get(id as Parameters<typeof users.get>[0])
				return res.status === "success" ? res.user.name : undefined
			})
			for (const [id, name] of got) if (name) found.set(id, name)
			if (!cancelled && found.size) setUserNames((prev) => new Map([...prev, ...found]))
		})()
		return () => {
			cancelled = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [personIds.join("\n")])

	/* ---- related pages ---- */
	const knownTitles = useMemo(() => {
		const m = new Map<string, string>()
		for (const snap of [sources.initiatives, sources.kpis, sources.impacts]) {
			const titleId = Object.entries(snap.propertySchemasById).find(([, s]) => s.type === "title")?.[0]
			for (const r of snap.items) {
				const t = textOf(titleId ? r.propertiesById[titleId] : r.propertiesByKey.name).trim()
				if (t) m.set(r.id, t)
			}
		}
		return m
	}, [sources])
	const [fetchedTitles, setFetchedTitles] = useState<ReadonlyMap<string, string>>(new Map())
	const askedPagesRef = useRef(new Set<string>())
	const relationIds = useMemo(
		() => [...new Set([...referencedIds(sources.initiatives, ["relation"]), ...referencedIds(sources.impacts, ["relation"])])],
		[sources.initiatives, sources.impacts]
	)
	useEffect(() => {
		const missing = relationIds.filter((id) => !knownTitles.has(id) && !askedPagesRef.current.has(id)).slice(0, MAX_LOOKUPS)
		if (missing.length === 0) return
		for (const id of missing) askedPagesRef.current.add(id)
		let cancelled = false
		void mapLimited(missing, async (id) => {
			const res = await pages.get(id as Parameters<typeof pages.get>[0])
			return res.status === "success" ? titleOfPage(res.page as { properties?: Record<string, unknown> }) : undefined
		}).then((got) => {
			const found = [...got].filter((e): e is [string, string] => !!e[1])
			if (!cancelled && found.length) setFetchedTitles((prev) => new Map([...prev, ...found]))
		})
		return () => {
			cancelled = true
		}
	}, [relationIds, knownTitles])

	/* ---- writes ---- */
	const writer = useMemo<Writer>(() => {
		const find = (q: QueryResult, id: string): Row | undefined => q.items.find((r) => r.id === id)
		const optionName = (q: QueryResult, key: string, test: RegExp, fallback: string) => {
			const s = q.propertySchemasByKey[key] as { options?: { name: string }[] } | undefined
			return s?.options?.find((o) => test.test(o.name))?.name ?? fallback
		}
		const run = async (which: "iq" | "kq", id: string, key: string, value: object): Promise<string | null> => {
			const q = latest.current[which]
			if (q.propertyIdsByKey[key] === undefined) return `The ${key} property isn't connected.`
			const row = find(q, id)
			if (!row) return "That row is no longer in the database."
			const res = await row.update({ properties: { [key]: value } as never })
			return res.status === "success" ? null : res.error.message
		}
		return {
			setTiming: (id, v: Timing | null) =>
				run("iq", id, "timing", {
					type: "select",
					select: v ? { name: optionName(latest.current.iq, "timing", v === "fixed" ? /impact|fixed/i : /timeline|flex/i, TIMING_NAMES[v]) } : null,
				}),
			setGrowth: (id, v: Growth) =>
				run("iq", id, "growth", {
					type: "select",
					select: { name: optionName(latest.current.iq, "growth", v === "exp" ? /exp/i : /lin/i, GROWTH_NAMES[v]) },
				}),
			setGoal: (id, v) => run("kq", id, "goal", { type: "number", number: v }),
			setGoalBy: (id, ym) => run("kq", id, "goalBy", { type: "date", date: { start: lastDayOf(ym) } }),
		}
	}, [])

	const loading = [iq, kq, mq].some((q) => q.isLoading && q.items.length === 0 && !q.error)
	return useMemo<ImpacttData>(() => {
		const missing = (Object.keys(sources) as (keyof Sources)[]).filter((k) => !sources[k].bound)
		if (loading && missing.length === 0) return { status: "loading" }
		// KPIs is optional: KPI names can come from a select column in Impacts.
		if (!sources.initiatives.bound || !sources.impacts.bound) return { status: "unbound", missing: missing.filter((m) => m !== "kpis") }
		return {
			status: "ready",
			sources,
			writer,
			storageKey: `impactt:${blockId}`,
			resolvers: {
				userName: (id) => userNames.get(id) ?? (id === me.id ? me.name : undefined),
				pageTitle: (id) => knownTitles.get(id) ?? fetchedTitles.get(id),
				meId: me.id,
			},
		}
	}, [sources, loading, writer, blockId, userNames, me, knownTitles, fetchedTitles])
}

export type { SourceRow }
