import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { NotionCustomBlock, useTheme } from "@notionhq/custom-blocks/react"
import { ImpacttView } from "./ImpacttView"
import { fallbackLabel } from "./filters/core"
import { MOCK_ME, MOCK_USERS, mockSources, mockTitle, mockWriter } from "./mockData"
import { useImpacttData } from "./useImpacttData"
import type { ImpacttData } from "./sources"
import "./impactt.css"

const params = new URLSearchParams(window.location.search)
const isMock = params.has("mock")

/** Standalone dev harness: seed data in memory, theme via ?theme=dark. */
function MockRoot(): React.ReactNode {
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	const scenario = params.get("scenario")
	const [sources, setSources] = useState(mockSources)
	const writer = useMemo(() => mockWriter(setSources), [])
	const resolvers = useMemo(
		() => ({
			userName: (id: string) => MOCK_USERS[id] ?? fallbackLabel(id, "person"),
			pageTitle: (id: string) => mockTitle(sources, id),
			meId: MOCK_ME,
		}),
		[sources]
	)
	let data: ImpacttData = { status: "ready", sources, resolvers, writer, storageKey: "impactt:mock" }
	if (scenario === "loading") data = { status: "loading" }
	else if (scenario === "unbound") data = { status: "unbound", missing: ["initiatives", "kpis", "impacts"] }
	return <ImpacttView data={data} theme={theme} />
}

function HostedApp(): React.ReactNode {
	const theme = useTheme()
	const data = useImpacttData()
	return <ImpacttView data={data} theme={theme} />
}

createRoot(document.getElementById("root")!).render(
	isMock ? (
		<MockRoot />
	) : (
		<NotionCustomBlock>
			<HostedApp />
		</NotionCustomBlock>
	)
)
