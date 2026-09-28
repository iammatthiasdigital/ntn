/**
 * Hosted data layer shared by the blocks: reads each bound data source,
 * resolves names of people and related pages (lazily, bounded), and wraps
 * the SDK's create / update / archive calls.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { pages, users } from "@notionhq/custom-blocks"
import { useBlockId, useCurrentUser, useDataSource } from "@notionhq/custom-blocks/react"
import { useAllRows } from "./allRows"
import { pointerIds, textOf } from "./filters/core"
import { pageToRow } from "./pageRow"
import type { BlockData, Mutations, RowQuery, SourceSnapshot } from "./sources"

const LIMIT = 999
const CONCURRENCY = 5
const MAX_LOOKUPS = 150

type QueryResult = ReturnType<typeof useDataSource>

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
		loading: q.isLoading,
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

function referencedIds(snaps: SourceSnapshot[], types: string[]): string[] {
	const ids = new Set<string>()
	for (const snap of snaps) {
		const props = Object.entries(snap.propertySchemasById)
			.filter(([, s]) => types.includes(s.type))
			.map(([id]) => id)
		for (const r of snap.items) for (const p of props) for (const id of pointerIds(r.propertiesById[p])) ids.add(id)
	}
	return [...ids]
}

/**
 * `keys` must be a constant list (hooks are called once per key, in order).
 * `required` are the keys the block can't work without.
 * `complete` are keys read in full past the 999-row cap (see allRows).
 * `initial` sets what a key reads at first (e.g. `{ limit: 1 }`: just the
 * schema, until the block asks for rows with `setQuery`).
 */
export function useBlockData<K extends string>(keys: readonly K[], required: readonly K[], storagePrefix: string, complete: readonly K[] = [], initial: Partial<Record<K, RowQuery>> = {}): BlockData<K> {
	const [rq, setRq] = useState<Partial<Record<K, RowQuery>>>(initial)
	const optsOf = (k: K) => {
		const q = rq[k]
		return q ? { limit: Math.max(1, Math.min(LIMIT, q.limit)), ...(q.filter ? { filter: q.filter as never } : {}) } : { limit: LIMIT }
	}
	// Stable options per query, so a subscription is only replaced when its query really changes.
	const optJson = keys.map((k) => JSON.stringify(optsOf(k)))
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const opts = useMemo(() => keys.map(optsOf), optJson)
	const queries = keys.map((k, i) => useDataSource(k, opts[i]))
	const full = keys.map((k, i) => useAllRows(k, queries[i], complete.includes(k) && opts[i].limit >= LIMIT, { filter: rq[k]?.filter, sortBy: rq[k]?.sortBy, empty: rq[k]?.empty }))
	const setQuery = useMemo(
		() => (key: K, q: RowQuery) =>
			setRq((prev) => (JSON.stringify(prev[key] ?? null) === JSON.stringify(q) ? prev : { ...prev, [key]: q })),
		[]
	)
	const me = useCurrentUser()
	const blockId = useBlockId()
	const snaps = useMemo(
		() =>
			queries.map((q, i) => {
				const f = full[i]
				return f ? toSnapshot({ ...q, items: f.items, hasMore: f.truncated, isLoading: q.isLoading || f.loading }) : toSnapshot(q)
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[...queries.flatMap((q) => [q.items, q.propertySchemasById, q.propertyIdsByKey, q.hasMore, q.error, q.collectionSchema, q.isLoading]), ...full.flatMap((f) => [f?.items, f?.truncated, f?.loading])]
	)
	const sources = useMemo(() => Object.fromEntries(keys.map((k, i) => [k, snaps[i]])) as Record<K, SourceSnapshot>, [snaps, keys])
	const latest = useRef(queries)
	latest.current = queries.map((q, i) => (full[i] ? { ...q, items: full[i]!.items } : q))

	/* ---- people ---- */
	const [userNames, setUserNames] = useState<ReadonlyMap<string, string>>(new Map())
	const listedRef = useRef(false)
	const askedUsersRef = useRef(new Set<string>())
	const personIds = useMemo(() => referencedIds(snaps, ["people", "created_by", "last_edited_by"]), [snaps])
	useEffect(() => {
		if (personIds.length === 0 && listedRef.current) return
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
		for (const snap of snaps) {
			const titleId = Object.entries(snap.propertySchemasById).find(([, s]) => s.type === "title")?.[0]
			for (const r of snap.items) {
				const t = textOf(titleId ? r.propertiesById[titleId] : r.propertiesByKey.name).trim()
				if (t) m.set(r.id, t)
			}
		}
		return m
	}, [snaps])
	const [fetchedTitles, setFetchedTitles] = useState<ReadonlyMap<string, string>>(new Map())
	const askedPagesRef = useRef(new Set<string>())
	const relationIds = useMemo(() => referencedIds(snaps, ["relation"]), [snaps])
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
	const mutations = useMemo<Mutations>(() => {
		const q = (source: string) => latest.current[keys.indexOf(source as K)]
		const row = (source: string, id: string) => q(source)?.items.find((r) => r.id === id)
		return {
			create: async (source, properties) => {
				const res = await pages.create({ parent: { type: "data_source_key", key: source }, properties: properties as never })
				return res.status === "success" ? null : res.error.message
			},
			update: async (source, id, properties) => {
				const r = row(source, id)
				if (!r) return "That row is no longer in the database."
				const res = await r.update({ properties: properties as never })
				return res.status === "success" ? null : res.error.message
			},
			archive: async (source, id) => {
				const r = row(source, id)
				if (!r) return "That row is no longer in the database."
				const res = await r.archive()
				return res.status === "success" ? null : res.error.message
			},
		}
	}, [keys])

	// Only the first load (no schema yet) blocks the view; later query changes load in place.
	const loading = queries.some((q) => q.isLoading && q.items.length === 0 && !q.error && q.collectionSchema === undefined)
	const fetchRow = useMemo(
		() => async (key: K, id: string) => {
			const res = await pages.get(id as Parameters<typeof pages.get>[0]).catch(() => null)
			if (!res || res.status !== "success") return null
			const schemas = latest.current[keys.indexOf(key)]?.propertySchemasById ?? {}
			return pageToRow(res.page as never, schemas as never)
		},
		[keys]
	)
	return useMemo<BlockData<K>>(() => {
		const missing = keys.filter((k) => !sources[k].bound)
		if (loading && missing.length === 0) return { status: "loading" }
		const missingRequired = missing.filter((k) => required.includes(k))
		if (missingRequired.length) return { status: "unbound", missing: missingRequired }
		return {
			status: "ready",
			sources,
			mutations,
			storageKey: `${storagePrefix}:${blockId}`,
			setQuery,
			fetchRow,
			resolvers: {
				userName: (id) => userNames.get(id) ?? (id === me.id ? me.name : undefined),
				pageTitle: (id) => knownTitles.get(id) ?? fetchedTitles.get(id),
				meId: me.id,
			},
		}
	}, [keys, required, sources, loading, mutations, storagePrefix, blockId, userNames, me, knownTitles, fetchedTitles, setQuery, fetchRow])
}
