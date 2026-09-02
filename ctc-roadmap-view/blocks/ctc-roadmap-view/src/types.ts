export type FeatureIcon =
	| { type: "emoji"; emoji: string }
	| { type: "url"; url: string }

export type QuarterRef = {
	year: number
	/** 1–4 */
	quarter: number
}

export type Feature = {
	id: string
	/** Resolved display name, e.g. "France". */
	countryName: string
	/** ISO 3166-1 alpha-2 code when it could be resolved, else null. */
	iso2: string | null
	scopes: string[]
	eta: QuarterRef | null
	icon?: FeatureIcon
}

/**
 * One row of the bound data source before filtering, with property values
 * still in whatever shape the host handed over.
 */
export type RawRow = {
	id: string
	title: unknown
	tags: unknown
	product: unknown
	eta: unknown
	country: unknown
	scopes: unknown
	salesStatus: unknown
}

/** Distinct countries per coverage lane, alphabetical. */
export type Coverage = {
	available: Feature[]
	roadmap: Feature[]
}

export type RoadmapDataState =
	| { status: "loading" }
	| { status: "unbound" }
	| { status: "empty"; unreadableProduct?: number }
	| {
			status: "ready"
			/** Kanban rows: tag + product filter, bucketed by ETA. */
			features: Feature[]
			/** Selectable filter values rendered from the database. */
			filterOptions: {
				tags: string[]
				products: string[]
				scopes: string[]
				statuses: string[]
			}
			/** Coverage lanes: product + sales-status filter, distinct countries. */
			coverage: Coverage
			/** False when the salesStatus slot has no mapped property. */
			statusBound: boolean
			/** True when the 999-row read limit cut the data off. */
			truncated?: boolean
			/** Rows dropped because their product relation could not be read. */
			unreadableProduct?: number
			/** Manifest filter slots with no mapped property (filter skipped). */
			unboundFilters?: string[]
	  }
