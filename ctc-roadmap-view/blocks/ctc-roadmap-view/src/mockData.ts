import { rowsToFeatures } from "./roadmap"
import type { Feature, RawRow } from "./types"

/**
 * Sample rows shaped like raw data-source rows so the standalone harness
 * exercises the same filter/transform pipeline as the hosted block —
 * including relation-shaped products resolved through a title map. The set
 * mirrors the 2026 mandate slide and includes decoys that the filter must
 * drop, plus 2025/2027 rows to exercise the year selector.
 */
type MockSpec = {
	country: string | string[]
	scopes: string[]
	eta: string
	tags?: string[]
	product?: unknown
}

const CTC_PRODUCT = [{ id: "prod-ctc", table: "block" }]
const TAX_PRODUCT = [{ id: "prod-tax", table: "block" }]

/** Relation titles the mock resolver would have fetched via pages.get. */
export const MOCK_PRODUCT_TITLES: ReadonlyMap<string, string | null> = new Map([
	// Singular on purpose: the matcher accepts transaction(s).
	["prod-ctc", "Compliance Transaction"],
	["prod-tax", "Tax Reporting"],
])

const SPECS: MockSpec[] = [
	// Q1 2026
	{ country: "PE", scopes: ["E-transport"], eta: "2026-01-15" },
	{ country: "Poland", scopes: ["B2B"], eta: "2026-02-01" },
	{ country: "IN", scopes: ["B2B", "B2G", "eT"], eta: "2026-03-01" },
	{ country: "Switzerland", scopes: ["B2G"], eta: "2026-02-20" },
	// Q2 2026
	{ country: "AU", scopes: ["B2B", "B2G"], eta: "2026-04-10" },
	{ country: "France", scopes: ["B2B", "B2G", "B2C"], eta: "Q2 2026" },
	{ country: "SG", scopes: ["B2B", "B2G"], eta: "2026-06-01" },
	// Q3 2026
	{ country: "Greece", scopes: ["B2B", "B2G"], eta: "2026-07-01" },
	{ country: "JP", scopes: ["B2B", "B2G"], eta: "2026-07-15" },
	{ country: "Latvia", scopes: ["B2G"], eta: "2026-08-01" },
	{ country: "New Zealand", scopes: ["B2G", "B2B"], eta: "2026-08-15" },
	{ country: "PH", scopes: ["B2B", "B2G"], eta: "2026-09-01" },
	{ country: "Portugal", scopes: ["B2B", "B2G", "ER"], eta: "2026-09-10" },
	{ country: "UAE", scopes: ["B2B", "B2G"], eta: "2026-09-15" },
	{ country: "USA", scopes: ["DBNA"], eta: "2026-09-20" },
	{ country: "Mexico", scopes: ["B2B", "B2G", "B2C"], eta: "2026-09-25" },
	// Q4 2026 — with the country spellings that used to trip resolution
	{ country: "AR", scopes: ["B2B", "B2G", "B2C"], eta: "2026-10-01" },
	{ country: "Brazil", scopes: ["B2B", "B2G", "B2C"], eta: "2026-10-15" },
	{ country: "IL", scopes: ["B2B"], eta: "2026-11-01" },
	{ country: "China", scopes: ["B2B", "B2G", "B2C"], eta: "2026-11-15" },
	// Rich text split into runs — must still read as "KR".
	{ country: ["K", "R"], scopes: ["B2B", "B2G"], eta: "2026-12-01" },
	{ country: "TR - Türkiye", scopes: ["B2B", "B2G", "B2C", "ET"], eta: "2026-Q4" },
	{ country: " sk ", scopes: ["B2B"], eta: "2026-12-10" },
	{ country: "Serbia", scopes: ["E-transport"], eta: "2026-12-15" },
	// Other years, to exercise the year selector
	{ country: "Romania", scopes: ["B2B", "B2G"], eta: "2025-07-01" },
	{ country: "Malaysia", scopes: ["B2B"], eta: "2025-10-01" },
	{ country: "ES", scopes: ["B2B"], eta: "2027-01-01" },
	{ country: "Belgium", scopes: ["B2B", "B2G"], eta: "2027-04-01" },
	// Decoys that the filter must drop
	{ country: "DE", scopes: ["B2B"], eta: "2026-05-01", tags: ["invoicing"] },
	{ country: "IT", scopes: ["B2B"], eta: "2026-05-01", product: TAX_PRODUCT },
]

export const MOCK_ROWS: RawRow[] = SPECS.map((spec, index) => ({
	id: `mock-${index}`,
	title: Array.isArray(spec.country) ? spec.country.join("") : spec.country,
	tags: (spec.tags ?? ["Mandate", "compliance"]).map((name) => ({ name })),
	product: spec.product ?? CTC_PRODUCT,
	eta: { start: spec.eta },
	country: spec.country,
	scopes: spec.scopes.map((name) => ({ name })),
}))

export const MOCK_FEATURES: Feature[] = rowsToFeatures(MOCK_ROWS, {
	tagsBound: true,
	productBound: true,
	productTitleById: MOCK_PRODUCT_TITLES,
}).features
