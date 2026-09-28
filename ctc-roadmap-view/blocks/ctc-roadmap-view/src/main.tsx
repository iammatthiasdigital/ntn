import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { NotionCustomBlock, useTheme } from "@notionhq/custom-blocks/react"
import { RoadmapView, type Keys } from "./RoadmapView"
import { fallbackLabel } from "./kit/filters/core"
import { ErrorBoundary } from "./kit/ErrorBoundary"
import { MOCK_ME, MOCK_USERS, mockMutations, mockTitle, seedSnapshot, type Seed } from "./kit/mock"
import type { BlockData, SourceSnapshot } from "./kit/sources"
import { useBlockData } from "./kit/useBlockData"
import featuresSeed from "../../../data/worker_features.json"
import productsSeed from "../../../data/worker_products.json"
import "@fontsource/manrope/400.css"
import "@fontsource/manrope/500.css"
import "@fontsource/manrope/700.css"
import "@fontsource/manrope/800.css"
import "./kit/base.css"
import "./roadmap.css"
import "./slide.css"

/** Replaced at build time: false in production builds. */
declare const __MOCK__: boolean
const params = new URLSearchParams(window.location.search)
const KEYS = ["features", "products"] as const
const REQUIRED = ["features"] as const

/** Standalone dev harness: seed data in memory, theme via ?theme=dark, ?scenario=loading|unbound|empty. */
function MockRoot(): React.ReactNode {
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	const scenario = params.get("scenario")
	const [sources, setSources] = useState<Record<Keys, SourceSnapshot>>(() => {
		const features = seedSnapshot(featuresSeed as Seed)
		return { features: scenario === "empty" ? { ...features, items: [] } : features, products: seedSnapshot(productsSeed as Seed) }
	})
	const mutations = useMemo(() => mockMutations<Keys>(setSources), [])
	const resolvers = useMemo(() => ({ userName: (id: string) => MOCK_USERS[id] ?? fallbackLabel(id, "person"), pageTitle: (id: string) => mockTitle(sources, id), meId: MOCK_ME }), [sources])
	let data: BlockData<Keys> = { status: "ready", sources, resolvers, mutations, storageKey: "ctc-roadmap:mock" }
	if (scenario === "loading") data = { status: "loading" }
	else if (scenario === "unbound") data = { status: "unbound", missing: ["features"] }
	return <RoadmapView data={data} theme={theme} />
}

function HostedApp(): React.ReactNode {
	const theme = useTheme()
	const data = useBlockData(KEYS, REQUIRED, "ctc-roadmap")
	return <RoadmapView data={data} theme={theme} />
}

createRoot(document.getElementById("root")!).render(
	__MOCK__ && params.has("mock") ? (
		<ErrorBoundary storagePrefix="ctc-roadmap">
			<MockRoot />
		</ErrorBoundary>
	) : (
		<NotionCustomBlock>
			<ErrorBoundary storagePrefix="ctc-roadmap">
				<HostedApp />
			</ErrorBoundary>
		</NotionCustomBlock>
	)
)
