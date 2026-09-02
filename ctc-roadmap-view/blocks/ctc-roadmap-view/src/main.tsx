import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { NotionCustomBlock, useTheme } from "@notionhq/custom-blocks/react"
import { RoadmapBoard } from "./RoadmapBoard"
import { MOCK_PRODUCT_TITLES, MOCK_ROWS } from "./mockData"
import { filterOptions, makeContext, rowsToCoverage, rowsToFeatures } from "./roadmap"
import { loadSettings, storeSettings, type BlockSettings } from "./settings"
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

function useSettingsState(): [BlockSettings, (next: BlockSettings) => void] {
	const [settings, setSettings] = useState<BlockSettings>(loadSettings)
	function update(next: BlockSettings): void {
		setSettings(next)
		storeSettings(next)
	}
	return [settings, update]
}

/** Standalone dev harness: in-memory data, theme via ?theme=dark. */
function MockRoot(): React.ReactNode {
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	const scenario = params.get("scenario")
	const [settings, updateSettings] = useSettingsState()
	const mockData = useMemo<RoadmapDataState>(() => {
		const context = makeContext({
			tagTerms: settings.tagTerms,
			productTerms: settings.productTerms,
			scopeTerms: settings.scopeTerms,
			availableTerms: settings.availableTerms,
			roadmapTerms: settings.roadmapTerms,
			productTitleById: MOCK_PRODUCT_TITLES,
		})
		const board = rowsToFeatures(MOCK_ROWS, context)
		const coverage = rowsToCoverage(MOCK_ROWS, context)
		return {
			status: "ready",
			features: board.features,
			filterOptions: filterOptions(MOCK_ROWS, MOCK_PRODUCT_TITLES),
			coverage: { available: coverage.available, roadmap: coverage.roadmap },
			statusBound: true,
			unreadableProduct: Math.max(
				board.unreadableProduct,
				coverage.unreadableProduct
			),
		}
	}, [settings])
	let data: RoadmapDataState = mockData
	if (scenario === "loading") data = { status: "loading" }
	else if (scenario === "empty") data = { status: "empty" }
	else if (scenario === "unbound") data = { status: "unbound" }
	return (
		<RoadmapBoard
			data={data}
			theme={theme}
			settings={settings}
			onSettingsChange={updateSettings}
		/>
	)
}

function HostedApp(): React.ReactNode {
	const theme = useTheme()
	const [settings, updateSettings] = useSettingsState()
	const data = useNotionFeatures(settings)
	return (
		<RoadmapBoard
			data={data}
			theme={theme}
			settings={settings}
			onSettingsChange={updateSettings}
		/>
	)
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
