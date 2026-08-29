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
}

export type RoadmapDataState =
	| { status: "loading" }
	| { status: "unbound" }
	| { status: "empty" }
	| { status: "ready"; features: Feature[] }
