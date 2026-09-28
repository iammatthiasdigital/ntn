import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { NotionCustomBlock, useTheme } from "@notionhq/custom-blocks/react"
import { BoardView, type Keys } from "./WhiteboardView"
import { fallbackLabel } from "./kit/filters/core"
import { MOCK_ME, MOCK_USERS, mockMutations, seedSnapshot, type Seed } from "./kit/mock"
import type { BlockData, SourceSnapshot } from "./kit/sources"
import { ErrorBoundary } from "./kit/ErrorBoundary"
import { useBlockData } from "./kit/useBlockData"
import itemsSeed from "../../../data/worker_items.json"
import "./kit/base.css"
import "./board.css"

/** Replaced at build time: false in production builds. */
declare const __MOCK__: boolean
const params = new URLSearchParams(window.location.search)
const KEYS = ["items"] as const
/** Titles of the pages the mock Epic relation points to. */
const MOCK_PAGES: Record<string, string> = { "ep-rt": "Release train", "ep-map": "Mapping rules v2", "ep-ci": "CI stability" }
const REQUIRED = ["items"] as const

/** Standalone dev harness: seed data in memory, theme via ?theme=dark, ?scenario=loading|unbound|empty. */
function MockRoot(): React.ReactNode {
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	const scenario = params.get("scenario")
	const [sources, setSources] = useState<Record<Keys, SourceSnapshot>>(() => {
		const items = seedSnapshot(itemsSeed as Seed)
		return { items: scenario === "empty" ? { ...items, items: [] } : items }
	})
	const mutations = useMemo(() => mockMutations<Keys>(setSources), [])
	const resolvers = useMemo(() => ({ userName: (id: string) => MOCK_USERS[id] ?? fallbackLabel(id, "person"), pageTitle: (id: string) => MOCK_PAGES[id], meId: MOCK_ME }), [])
	let data: BlockData<Keys> = { status: "ready", sources, resolvers, mutations, storageKey: "whiteboard:mock" }
	if (scenario === "loading") data = { status: "loading" }
	else if (scenario === "unbound") data = { status: "unbound", missing: ["items"] }
	return <BoardView data={data} theme={theme} />
}

function HostedApp(): React.ReactNode {
	const theme = useTheme()
	const data = useBlockData(KEYS, REQUIRED, "whiteboard")
	return <BoardView data={data} theme={theme} />
}

createRoot(document.getElementById("root")!).render(
	__MOCK__ && params.has("mock") ? (
		<ErrorBoundary storagePrefix="whiteboard:">
			<MockRoot />
		</ErrorBoundary>
	) : (
		<NotionCustomBlock>
			<ErrorBoundary storagePrefix="whiteboard:">
				<HostedApp />
			</ErrorBoundary>
		</NotionCustomBlock>
	)
)
