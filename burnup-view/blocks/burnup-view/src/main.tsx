import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { NotionCustomBlock, useTheme } from "@notionhq/custom-blocks/react"
import { BurnView, type Keys } from "./BurnView"
import { fallbackLabel } from "./kit/filters/core"
import { MOCK_ME, MOCK_USERS, mockMutations, mockTitle, seedSnapshot, type Seed } from "./kit/mock"
import type { BlockData, SourceSnapshot } from "./kit/sources"
import { ErrorBoundary } from "./kit/ErrorBoundary"
import { useBlockData } from "./kit/useBlockData"
import itemsSeed from "../../../data/worker_items.json"
import "./kit/base.css"
import "./burn.css"

/** Replaced at build time: false in production builds. */
declare const __MOCK__: boolean
const params = new URLSearchParams(window.location.search)
const KEYS = ["items"] as const

/** The harness's created times are placeholders; use the sample's Added date as the created time. */
function withCreated(s: SourceSnapshot): SourceSnapshot {
	return {
		...s,
		items: s.items.map((r) => {
			const a = r.propertiesByKey.added as { start_date?: string } | undefined
			return a?.start_date ? { ...r, propertiesById: { ...r.propertiesById, created_time: { type: "datetime", start_date: a.start_date, start_time: "09:00" } } } : r
		}),
	}
}

/** Standalone dev harness: seed data in memory, theme via ?theme=dark. */
function MockRoot(): React.ReactNode {
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	const scenario = params.get("scenario")
	const [sources, setSources] = useState<Record<Keys, SourceSnapshot>>(() => ({ items: withCreated(seedSnapshot(itemsSeed as Seed, true)) }))
	const mutations = useMemo(() => mockMutations<Keys>(setSources), [])
	const resolvers = useMemo(() => ({ userName: (id: string) => MOCK_USERS[id] ?? fallbackLabel(id, "person"), pageTitle: (id: string) => mockTitle(sources, id), meId: MOCK_ME }), [sources])
	let data: BlockData<Keys> = { status: "ready", sources, resolvers, mutations, storageKey: "burnup:mock" }
	if (scenario === "loading") data = { status: "loading" }
	else if (scenario === "unbound") data = { status: "unbound", missing: ["items"] }
	return <BurnView data={data} theme={theme} />
}

function HostedApp(): React.ReactNode {
	const theme = useTheme()
	const data = useBlockData(KEYS, KEYS, "burnup")
	return <BurnView data={data} theme={theme} />
}

createRoot(document.getElementById("root")!).render(
	__MOCK__ && params.has("mock") ? (
		<ErrorBoundary storagePrefix="burnup:">
			<MockRoot />
		</ErrorBoundary>
	) : (
		<NotionCustomBlock>
			<ErrorBoundary storagePrefix="burnup:">
				<HostedApp />
			</ErrorBoundary>
		</NotionCustomBlock>
	)
)
