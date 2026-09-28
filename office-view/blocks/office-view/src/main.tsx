import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import { NotionCustomBlock, useTheme } from "@notionhq/custom-blocks/react"
import { OfficeView, type Keys } from "./OfficeView"
import { fallbackLabel } from "./kit/filters/core"
import { MOCK_ME, MOCK_USERS, mockMutations, mockTitle, seedSnapshot, type Seed } from "./kit/mock"
import type { BlockData, SourceSnapshot } from "./kit/sources"
import { ErrorBoundary } from "./kit/ErrorBoundary"
import { useBlockData } from "./kit/useBlockData"
import roomsSeed from "../../../data/worker_rooms.json"
import placesSeed from "../../../data/worker_places.json"
import bookingsSeed from "../../../data/worker_bookings.json"
import "./kit/base.css"
import "./office.css"
import "./theme-office.css"

/** Replaced at build time: false in production builds. */
declare const __MOCK__: boolean
const params = new URLSearchParams(window.location.search)
const KEYS = ["rooms", "places", "bookings"] as const
const REQUIRED = ["places", "bookings"] as const

/** Moves the sample bookings to the current week, so the harness always shows today's office. */
function shiftToToday(seed: Seed): Seed {
	const anchor = "2026-09-28"
	const t = new Date()
	// This week's Monday, or next week's on a weekend.
	const dow = (t.getDay() + 6) % 7
	const monday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - dow + (dow >= 5 ? 7 : 0))
	const shift = Math.round((Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) - Date.parse(anchor)) / 86400000)
	const move = (iso: string) => {
		const d = new Date(Date.parse(iso) + shift * 86400000)
		return d.toISOString().slice(0, 10)
	}
	return {
		...seed,
		rows: seed.rows.map((r) => {
			const w = r.when as { start_date: string; end_date?: string } | undefined
			return w ? { ...r, when: { ...w, start_date: move(w.start_date), ...(w.end_date ? { end_date: move(w.end_date) } : {}) } } : r
		}),
	}
}

/** Standalone dev harness: seed data in memory, theme via ?theme=dark. */
function MockRoot(): React.ReactNode {
	const theme = params.get("theme") === "dark" ? "dark" : "light"
	const scenario = params.get("scenario")
	const [sources, setSources] = useState<Record<Keys, SourceSnapshot>>(() => ({
		rooms: seedSnapshot(roomsSeed as Seed),
		places: seedSnapshot(placesSeed as Seed, true),
		bookings: seedSnapshot(shiftToToday(bookingsSeed as Seed)),
	}))
	const mutations = useMemo(() => mockMutations<Keys>(setSources), [])
	const resolvers = useMemo(() => ({ userName: (id: string) => MOCK_USERS[id] ?? fallbackLabel(id, "person"), pageTitle: (id: string) => mockTitle(sources, id), meId: MOCK_ME }), [sources])
	let data: BlockData<Keys> = { status: "ready", sources, resolvers, mutations, storageKey: "office:mock" }
	if (scenario === "loading") data = { status: "loading" }
	else if (scenario === "unbound") data = { status: "unbound", missing: ["places", "bookings"] }
	return <OfficeView data={data} theme={theme} />
}

function HostedApp(): React.ReactNode {
	const theme = useTheme()
	const data = useBlockData(KEYS, REQUIRED, "office")
	return <OfficeView data={data} theme={theme} />
}

createRoot(document.getElementById("root")!).render(
	__MOCK__ && params.has("mock") ? (
		<ErrorBoundary storagePrefix="office:">
			<MockRoot />
		</ErrorBoundary>
	) : (
		<NotionCustomBlock>
			<ErrorBoundary storagePrefix="office:">
				<HostedApp />
			</ErrorBoundary>
		</NotionCustomBlock>
	)
)
