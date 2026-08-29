import { useEffect, useMemo, useRef, useState } from "react"
import { pages } from "@notionhq/custom-blocks"
import { useDataSource } from "@notionhq/custom-blocks/react"
import { rowsToFeatures } from "./roadmap"
import type { FeatureIcon, RawRow, RoadmapDataState } from "./types"

const DATA_SOURCE_KEY = "features"
const ICON_FETCH_CONCURRENCY = 5

/**
 * Real data layer: reads the `features` data source, applies the board
 * filter, and lazily resolves each matching row's page icon (rows from
 * useDataSource don't carry icons — the flags live on the pages).
 */
export function useNotionFeatures(): RoadmapDataState {
	const { items, isLoading, error } = useDataSource(DATA_SOURCE_KEY, {
		limit: 999,
	})
	const [icons, setIcons] = useState<ReadonlyMap<string, FeatureIcon | null>>(
		new Map()
	)
	const requestedRef = useRef<Set<string>>(new Set())

	const features = useMemo(() => {
		const rows: RawRow[] = items.map((item) => {
			const props = item.propertiesByKey as Record<string, unknown>
			return {
				id: item.id,
				title: props.name,
				tags: props.tags,
				product: props.product,
				eta: props.eta,
				country: props.country,
				scopes: props.scopes,
			}
		})
		return rowsToFeatures(rows)
	}, [items])

	const ids = features.map((feature) => feature.id).join("\n")

	useEffect(() => {
		let cancelled = false
		const pending = features
			.map((feature) => feature.id)
			.filter((id) => !requestedRef.current.has(id))
		if (pending.length === 0) return
		for (const id of pending) requestedRef.current.add(id)

		const queue = [...pending]
		const found = new Map<string, FeatureIcon | null>()
		async function drain(): Promise<void> {
			for (;;) {
				const id = queue.shift()
				if (id === undefined || cancelled) return
				try {
					const result = await pages.get(id as Parameters<typeof pages.get>[0])
					if (result.status === "success") {
						found.set(id, toFeatureIcon(result.page.icon))
					} else {
						found.set(id, null)
					}
				} catch {
					found.set(id, null)
				}
			}
		}
		void Promise.all(
			Array.from({ length: ICON_FETCH_CONCURRENCY }, () => drain())
		).then(() => {
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
		if (features.length === 0) return { status: "empty" }
		return {
			status: "ready",
			features: features.map((feature) => ({
				...feature,
				icon: icons.get(feature.id) ?? undefined,
			})),
		}
	}, [items.length, isLoading, error, features, icons])
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
