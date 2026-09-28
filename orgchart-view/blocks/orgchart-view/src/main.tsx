import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { NotionCustomBlock, useTheme } from "@notionhq/custom-blocks/react"
import { OrgView, type Keys } from "./OrgView"
import { fallbackLabel } from "./kit/filters/core"
import { MOCK_ME, MOCK_USERS, mockMutations, mockTitle, seedSnapshot, type Seed } from "./kit/mock"
import type { BlockData, SourceSnapshot } from "./kit/sources"
import { ErrorBoundary } from "./kit/ErrorBoundary"
import { useBlockData } from "./kit/useBlockData"
import peopleSeed from "../../../data/worker_people.json"
import "./kit/base.css"
import "./org.css"

/** Replaced at build time: false in production builds. */
declare const __MOCK__: boolean
const params = new URLSearchParams(window.location.search)
const KEYS = ["people"] as const

/** Standalone dev harness: seed data in memory, theme via ?theme=dark, ?scenario=loading|unbound|empty. */
function MockRoot(): React.ReactNode {
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	const scenario = params.get("scenario")
	const [sources, setSources] = useState<Record<Keys, SourceSnapshot>>(() => {
		const people = seedSnapshot(peopleSeed as Seed, true)
		return { people: scenario === "empty" ? { ...people, items: [] } : people }
	})
	const mutations = useMemo(() => mockMutations<Keys>(setSources), [])
	const resolvers = useMemo(() => ({ userName: (id: string) => MOCK_USERS[id] ?? fallbackLabel(id, "person"), pageTitle: (id: string) => mockTitle(sources, id), meId: MOCK_ME }), [sources])
	let data: BlockData<Keys> = { status: "ready", sources, resolvers, mutations, storageKey: "orgchart:mock" }
	if (scenario === "loading") data = { status: "loading" }
	else if (scenario === "unbound") data = { status: "unbound", missing: ["people"] }
	return <OrgView data={data} theme={theme} />
}

function HostedApp(): React.ReactNode {
	const theme = useTheme()
	const data = useBlockData(KEYS, KEYS, "orgchart")
	return <OrgView data={data} theme={theme} />
}

createRoot(document.getElementById("root")!).render(
	__MOCK__ && params.has("mock") ? (
		<ErrorBoundary storagePrefix="orgchart:">
			<MockRoot />
		</ErrorBoundary>
	) : (
		<NotionCustomBlock>
			<ErrorBoundary storagePrefix="orgchart:">
				<HostedApp />
			</ErrorBoundary>
		</NotionCustomBlock>
	)
)
