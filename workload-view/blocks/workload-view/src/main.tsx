import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { NotionCustomBlock, useTheme } from "@notionhq/custom-blocks/react"
import { WorkloadView, type Keys } from "./WorkloadView"
import { fallbackLabel } from "./kit/filters/core"
import { MOCK_ME, MOCK_USERS, mockMutations, mockTitle, seedSnapshot, type Seed } from "./kit/mock"
import type { BlockData, SourceSnapshot } from "./kit/sources"
import { ErrorBoundary } from "./kit/ErrorBoundary"
import { useBlockData } from "./kit/useBlockData"
import assignmentsSeed from "../../../data/worker_assignments.json"
import peopleSeed from "../../../data/worker_people.json"
import "./kit/base.css"
import "./workload.css"

/** Replaced at build time: false in production builds. */
declare const __MOCK__: boolean
const params = new URLSearchParams(window.location.search)
const KEYS = ["assignments", "people"] as const
const REQUIRED = ["assignments"] as const

/** Standalone dev harness: seed data in memory, theme via ?theme=dark. */
function MockRoot(): React.ReactNode {
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	const scenario = params.get("scenario")
	const [sources, setSources] = useState<Record<Keys, SourceSnapshot>>(() => ({ assignments: seedSnapshot(assignmentsSeed as Seed, true), people: seedSnapshot(peopleSeed as Seed) }))
	const mutations = useMemo(() => mockMutations<Keys>(setSources), [])
	const resolvers = useMemo(() => ({ userName: (id: string) => MOCK_USERS[id] ?? fallbackLabel(id, "person"), pageTitle: (id: string) => mockTitle(sources, id), meId: MOCK_ME }), [sources])
	let data: BlockData<Keys> = { status: "ready", sources, resolvers, mutations, storageKey: "workload:mock" }
	if (scenario === "loading") data = { status: "loading" }
	else if (scenario === "unbound") data = { status: "unbound", missing: ["assignments"] }
	return <WorkloadView data={data} theme={theme} />
}

function HostedApp(): React.ReactNode {
	const theme = useTheme()
	// Task databases can be far bigger than one 999-row query.
	const data = useBlockData(KEYS, REQUIRED, "workload", KEYS)
	return <WorkloadView data={data} theme={theme} />
}

createRoot(document.getElementById("root")!).render(
	__MOCK__ && params.has("mock") ? (
		<ErrorBoundary storagePrefix="workload:">
			<MockRoot />
		</ErrorBoundary>
	) : (
		<NotionCustomBlock>
			<ErrorBoundary storagePrefix="workload:">
				<HostedApp />
			</ErrorBoundary>
		</NotionCustomBlock>
	)
)
