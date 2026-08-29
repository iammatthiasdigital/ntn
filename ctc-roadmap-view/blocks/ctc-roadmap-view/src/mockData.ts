import { rowsToFeatures } from "./roadmap"
import type { Feature, RawRow } from "./types"

/**
 * Sample rows shaped like raw data-source rows so the standalone harness
 * exercises the same filter/transform pipeline as the hosted block. The set
 * mirrors the 2026 mandate slide and includes decoys that the filter must
 * drop, plus 2025/2027 rows to exercise the year selector.
 */
type MockSpec = {
	country: string
	scopes: string[]
	eta: string
	tags?: string[]
	product?: string
}

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
	// Q4 2026
	{ country: "AR", scopes: ["B2B", "B2G", "B2C"], eta: "2026-10-01" },
	{ country: "Brazil", scopes: ["B2B", "B2G", "B2C"], eta: "2026-10-15" },
	{ country: "IL", scopes: ["B2B"], eta: "2026-11-01" },
	{ country: "China", scopes: ["B2B", "B2G", "B2C"], eta: "2026-11-15" },
	{ country: "South Korea", scopes: ["B2B", "B2G"], eta: "2026-12-01" },
	{ country: "Türkiye", scopes: ["B2B", "B2G", "B2C", "ET"], eta: "2026-Q4" },
	{ country: "SK", scopes: ["B2B"], eta: "2026-12-10" },
	{ country: "Serbia", scopes: ["E-transport"], eta: "2026-12-15" },
	// Other years, to exercise the year selector
	{ country: "Romania", scopes: ["B2B", "B2G"], eta: "2025-07-01" },
	{ country: "Malaysia", scopes: ["B2B"], eta: "2025-10-01" },
	{ country: "ES", scopes: ["B2B"], eta: "2027-01-01" },
	{ country: "Belgium", scopes: ["B2B", "B2G"], eta: "2027-04-01" },
	// Decoys that the filter must drop
	{ country: "DE", scopes: ["B2B"], eta: "2026-05-01", tags: ["invoicing"] },
	{
		country: "IT",
		scopes: ["B2B"],
		eta: "2026-05-01",
		product: "Tax reporting",
	},
]

export const MOCK_ROWS: RawRow[] = SPECS.map((spec, index) => ({
	id: `mock-${index}`,
	title: spec.country,
	tags: (spec.tags ?? ["Mandate", "compliance"]).map((name) => ({ name })),
	product: { name: spec.product ?? "Compliance Transactions" },
	eta: { start: spec.eta },
	country: spec.country,
	scopes: spec.scopes.map((name) => ({ name })),
}))

export const MOCK_FEATURES: Feature[] = rowsToFeatures(MOCK_ROWS)
