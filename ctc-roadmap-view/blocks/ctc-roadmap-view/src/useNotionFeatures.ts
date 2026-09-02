import { useEffect, useMemo, useRef, useState } from "react"
import { pages } from "@notionhq/custom-blocks"
import { useDataSource } from "@notionhq/custom-blocks/react"
import { joinedText, makeContext, relationIds, rowsToCoverage, rowsToFeatures } from "./roadmap"
import type { BlockSettings } from "./settings"
import type { Feature, FeatureIcon, RawRow, RoadmapDataState } from "./types"

const FEATURES_KEY = "features"
const PRODUCTS_KEY = "products"
const FETCH_CONCURRENCY = 5

/**
 * Real data layer: reads the `features` data source, resolves product
 * relation pointers to names — first through the `products` data source
 * (whose row ids are the pages the relation points at), then via pages.get
 * for ids outside it — applies the kanban and coverage filters from the
 * block settings, and lazily resolves page icons for visible rows.
 */
export function useNotionFeatures(settings: BlockSettings): RoadmapDataState {
	const { items, isLoading, error, hasMore, propertyIdsByKey } = useDataSource(
		FEATURES_KEY,
		{ limit: 999 }
	)
	const products = useDataSource(PRODUCTS_KEY, { limit: 999 })
	const [icons, setIcons] = useState<ReadonlyMap<string, FeatureIcon | null>>(
		new Map()
	)
	const [fetchedTitles, setFetchedTitles] = useState<
		ReadonlyMap<string, string | null>
	>(new Map())
	const requestedIconsRef = useRef<Set<string>>(new Set())
	const requestedProductsRef = useRef<Set<string>>(new Set())

	const tagsBound = propertyIdsByKey.tags !== undefined
	const productBound = propertyIdsByKey.product !== undefined
	const statusBound = propertyIdsByKey.salesStatus !== undefined

	const rows = useMemo<RawRow[]>(
		() =>
			items.map((item) => {
				const props = item.propertiesByKey as Record<string, unknown>
				return {
					id: item.id,
					title: props.name,
					tags: props.tags,
					product: props.product,
					eta: props.eta,
					country: props.country,
					scopes: props.scopes,
					salesStatus: props.salesStatus,
				}
			}),
		[items]
	)

	// The distinct product pages behind relation-shaped values — usually a
	// handful shared across all rows.
	const productIds = useMemo(() => {
		if (!productBound) return []
		const ids = new Set<string>()
		for (const row of rows) {
			for (const id of relationIds(row.product)) ids.add(id)
		}
		return [...ids]
	}, [rows, productBound])

	// Primary resolution: the bound products source (row id = related page id).
	const productTitles = useMemo(() => {
		const map = new Map<string, string | null>()
		for (const item of products.items) {
			const name = joinedText(
				(item.propertiesByKey as Record<string, unknown>).name
			)
			if (name !== "") map.set(item.id, name)
		}
		for (const [id, title] of fetchedTitles) {
			if (!map.has(id)) map.set(id, title)
		}
		return map
	}, [products.items, fetchedTitles])

	// The products source is "settled" once it either loaded or errored
	// (unbound slot). Only then is a missing id worth a pages.get fetch.
	const productsSettled = !products.isLoading || products.error !== undefined

	useEffect(() => {
		if (!productsSettled) return
		const pending = productIds.filter(
			(id) => !productTitles.has(id) && !requestedProductsRef.current.has(id)
		)
		if (pending.length === 0) return
		for (const id of pending) requestedProductsRef.current.add(id)
		let cancelled = false
		void fetchInBatches(pending, async (id) => {
			try {
				const result = await pages.get(id as Parameters<typeof pages.get>[0])
				return result.status === "success" ? pageTitle(result.page) : null
			} catch {
				return null
			}
		}).then((found) => {
			if (cancelled || found.size === 0) return
			setFetchedTitles((prev) => {
				const next = new Map(prev)
				for (const [id, title] of found) next.set(id, title)
				return next
			})
		})
		return () => {
			cancelled = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [productIds.join("\n"), productsSettled, productTitles])

	// Completed fetches land in the merged map even when they failed (null),
	// so "pending" is simply an id the map doesn't cover yet.
	const productsPending =
		productIds.length > 0 &&
		(!productsSettled || productIds.some((id) => !productTitles.has(id)))

	const context = useMemo(
		() =>
			makeContext({
				tagsBound,
				productBound,
				statusBound,
				tagTerm: settings.tagTerm,
				productTerm: settings.productTerm,
				availableTerm: settings.availableTerm,
				roadmapTerm: settings.roadmapTerm,
				productTitleById: productTitles,
			}),
		[
			tagsBound,
			productBound,
			statusBound,
			settings.tagTerm,
			settings.productTerm,
			settings.availableTerm,
			settings.roadmapTerm,
			productTitles,
		]
	)

	const board = useMemo(() => rowsToFeatures(rows, context), [rows, context])
	const coverage = useMemo(() => rowsToCoverage(rows, context), [rows, context])

	const visibleFeatures = useMemo(
		() => [...board.features, ...coverage.available, ...coverage.roadmap],
		[board, coverage]
	)
	const ids = visibleFeatures.map((feature) => feature.id).join("\n")

	useEffect(() => {
		const pending = visibleFeatures
			.map((feature) => feature.id)
			.filter((id) => !requestedIconsRef.current.has(id))
		if (pending.length === 0) return
		for (const id of pending) requestedIconsRef.current.add(id)
		let cancelled = false
		void fetchInBatches(pending, async (id) => {
			try {
				const result = await pages.get(id as Parameters<typeof pages.get>[0])
				return result.status === "success" ? toFeatureIcon(result.page.icon) : null
			} catch {
				return null
			}
		}).then((found) => {
			if (cancelled || found.size === 0) return
			setIcons((prev) => {
				const next = new Map(prev)
				for (const [id, icon] of found) next.set(id, icon)
				return next
			})
		})
		return () => {
			cancelled = true
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ids])

	return useMemo<RoadmapDataState>(() => {
		if (error) return { status: "unbound" }
		if (isLoading && items.length === 0) return { status: "loading" }
		// Filtering is only correct once the product relations are readable.
		if (productsPending) return { status: "loading" }
		const unreadableProduct = Math.max(
			board.unreadableProduct,
			coverage.unreadableProduct
		)
		if (
			board.features.length === 0 &&
			coverage.available.length === 0 &&
			coverage.roadmap.length === 0
		) {
			return { status: "empty", unreadableProduct }
		}
		const withIcon = (feature: Feature): Feature => ({
			...feature,
			icon: icons.get(feature.id) ?? undefined,
		})
		const unboundFilters = [
			...(tagsBound ? [] : ["Tags"]),
			...(productBound ? [] : ["Product"]),
		]
		return {
			status: "ready",
			features: board.features.map(withIcon),
			coverage: {
				available: coverage.available.map(withIcon),
				roadmap: coverage.roadmap.map(withIcon),
			},
			statusBound,
			truncated: hasMore,
			unreadableProduct,
			unboundFilters: unboundFilters.length > 0 ? unboundFilters : undefined,
		}
	}, [
		items.length,
		isLoading,
		error,
		hasMore,
		productsPending,
		board,
		coverage,
		icons,
		tagsBound,
		productBound,
		statusBound,
	])
}

/** Run `fetchOne` over ids with bounded concurrency; collect the results. */
async function fetchInBatches<T>(
	ids: string[],
	fetchOne: (id: string) => Promise<T>
): Promise<Map<string, T>> {
	const queue = [...ids]
	const found = new Map<string, T>()
	async function drain(): Promise<void> {
		for (;;) {
			const id = queue.shift()
			if (id === undefined) return
			found.set(id, await fetchOne(id))
		}
	}
	await Promise.all(
		Array.from({ length: FETCH_CONCURRENCY }, () => drain())
	)
	return found
}

type NotionPageLike = {
	icon?: NotionPageIconLike
	properties?: Record<string, unknown>
}

/** Join the plain text of a page's title property (public API shape). */
function pageTitle(page: NotionPageLike): string | null {
	if (!page.properties) return null
	for (const value of Object.values(page.properties)) {
		if (
			value !== null &&
			typeof value === "object" &&
			(value as { type?: unknown }).type === "title"
		) {
			const runs = (value as { title?: unknown }).title
			if (!Array.isArray(runs)) continue
			const text = runs
				.map((run) =>
					run !== null &&
					typeof run === "object" &&
					typeof (run as { plain_text?: unknown }).plain_text === "string"
						? (run as { plain_text: string }).plain_text
						: ""
				)
				.join("")
				.trim()
			return text === "" ? null : text
		}
	}
	return null
}

type NotionPageIconLike =
	| { type: "emoji"; emoji: string }
	| { type: "external"; external: { url: string } }
	| { type: "file"; file: { url: string } }
	| { type: string }
	| null
	| undefined

function toFeatureIcon(icon: NotionPageIconLike): FeatureIcon | null {
	if (!icon) return null
	if (icon.type === "emoji" && "emoji" in icon) {
		return { type: "emoji", emoji: icon.emoji }
	}
	if (icon.type === "external" && "external" in icon) {
		return { type: "url", url: icon.external.url }
	}
	if (icon.type === "file" && "file" in icon) {
		return { type: "url", url: icon.file.url }
	}
	return null
}
