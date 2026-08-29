import { createRoot } from "react-dom/client"
import { NotionCustomBlock, useTheme } from "@notionhq/custom-blocks/react"
import { RoadmapBoard } from "./RoadmapBoard"
import { MOCK_FEATURES } from "./mockData"
import { useNotionFeatures } from "./useNotionFeatures"
import type { RoadmapDataState } from "./types"
import "@fontsource/manrope/400.css"
import "@fontsource/manrope/500.css"
import "@fontsource/manrope/700.css"
import "@fontsource/manrope/800.css"
import "./index.css"
import "./roadmap.css"

const params = new URLSearchParams(window.location.search)
const isMock = params.has("mock")

/** Standalone dev harness: in-memory data, theme via ?theme=dark. */
function MockRoot(): React.ReactNode {
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	const scenario = params.get("scenario")
	let data: RoadmapDataState
	if (scenario === "loading") {
		data = { status: "loading" }
	} else if (scenario === "empty") {
		data = { status: "empty" }
	} else if (scenario === "unbound") {
		data = { status: "unbound" }
	} else {
		data = { status: "ready", features: MOCK_FEATURES }
	}
	return <RoadmapBoard data={data} theme={theme} />
}

function HostedApp(): React.ReactNode {
	const theme = useTheme()
	const data = useNotionFeatures()
	return <RoadmapBoard data={data} theme={theme} />
}

const root = createRoot(document.getElementById("root")!)
root.render(
	isMock ? (
		<MockRoot />
	) : (
		<NotionCustomBlock>
			<HostedApp />
		</NotionCustomBlock>
	)
)
