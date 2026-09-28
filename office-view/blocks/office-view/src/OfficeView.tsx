import { useEffect, useMemo, useState, type ReactNode } from "react"
import { dayIso, EMPTY_FILTERS } from "./kit/filters/core"
import { Plus } from "./kit/filters/icons"
import { Popover, useAnchor } from "./kit/filters/popover"
import { ClockIcon, ColumnIcon, LayersIcon, NavRow, Note, NumberRow, PersonIcon, PickRow, Sep, SettingsShell, TargetIcon, ToggleRow } from "./kit/settings"
import { W, type BlockData, type PropertyWrite, type SourceSnapshot } from "./kit/sources"
import { oneOf, within } from "./kit/share"
import { Loading, Setup, Toolbar, useFiltered, usePersistentView, type WithFilters } from "./kit/toolbar"
import { addDay, bookingsOn, clash, dayLabel, firstFree, hhmm, isDropIn, readOffice, stateOf, takesOver, usualPlace, type Booking, type Office, type Place, type State } from "./office"

export type Keys = "rooms" | "places" | "bookings"
type Ready = Extract<BlockData<Keys>, { status: "ready" }>

type View = WithFilters & {
	layout: "rooms" | "timeline"
	open: number
	close: number
	length: number
	names: boolean
	/** "office": the paper-company look; "notion": plain Notion styling. */
	theme: "office" | "notion"
	/** One click on a free place claims it for the whole day. */
	quick: boolean
}

const DEFAULT: View = { layout: "rooms", open: 8 * 60, close: 19 * 60, length: 60, names: true, theme: "office", quick: true, filters: EMPTY_FILTERS, filterBar: true }

/** Imported views stay within what the settings allow. */
function sanitize(v: View): View {
	const open = Math.round(within(v.open, 0, 23 * 60, DEFAULT.open) / 30) * 30
	return {
		...v,
		layout: oneOf(v.layout, ["rooms", "timeline"] as const, DEFAULT.layout),
		theme: oneOf(v.theme, ["office", "notion"] as const, DEFAULT.theme),
		open,
		close: Math.round(within(v.close, open + 60, 24 * 60, DEFAULT.close) / 30) * 30,
		length: Math.round(within(v.length, 15, 12 * 60, DEFAULT.length)),
	}
}

/** Wording per theme. */
const COPY = {
	office: {
		title: "The Office",
		free: "Up for grabs",
		claim: "Claim it",
		yours: "Hello, it's you",
		empty: "Nobody's in. It's just you and the copier.",
		mine: "Your desk, your rules",
		moved: (from: string, to: string) => `📎 Moved your stuff from ${from} to ${to}.`,
		claimed: (p: string) => `📎 ${p} is yours for the day. Put a plant on it.`,
		usualFree: (p: string) => `Your usual spot, ${p}, is free. Claim it before someone from Accounting does.`,
		usualMine: (p: string) => `You're at ${p} today. Same desk, same mug.`,
		grabs: "Up for grabs",
	},
	notion: {
		title: "Office",
		free: "Free",
		claim: "Book the day",
		yours: "Yours",
		empty: "No places yet. Add a room and places with the + button.",
		mine: "Your bookings",
		moved: (from: string, to: string) => `Moved your booking from ${from} to ${to}.`,
		claimed: (p: string) => `Booked ${p} for the whole day.`,
		usualFree: (p: string) => `Your usual place, ${p}, is free today.`,
		usualMine: (p: string) => `You're at ${p} today.`,
		grabs: "Can be taken",
	},
}
type Copy = (typeof COPY)["office"]

export function OfficeView({ data, theme }: { data: BlockData<Keys>; theme: "light" | "dark" }) {
	return (
		<div className="nb" data-theme={theme}>
			{data.status === "loading" ? (
				<Loading what="the office" />
			) : data.status === "unbound" ? (
				<Setup title="Connect your databases to open the office." missing={data.missing}>
					<li>
						<b>Places</b>: Name, Room (relation to Rooms), Type (select: Desk, Meeting room, Phone booth…), Seats, Features.
					</li>
					<li>
						<b>Bookings</b>: Name, Place (relation to Places), Who (people), When (a date for the whole day, or with start and end time), Note, Up for grabs (checkbox).
					</li>
					<li>
						<b>Rooms</b> (optional): Name, Floor, Type.
					</li>
				</Setup>
			) : (
				<Ready data={data} />
			)}
		</div>
	)
}

/** Select options of a property, in schema order, plus values in use. */
function optionsOf(src: SourceSnapshot, key: string): string[] {
	const id = src.propertyIdsByKey[key]
	const sch = id ? src.propertySchemasById[id] : undefined
	const out = (sch?.options ?? []).map((o) => o.name)
	for (const r of src.items) {
		const v = r.propertiesByKey[key]
		if (typeof v === "string" && v && !out.includes(v)) out.push(v)
	}
	return out
}

type Target = { place: Place; anchor: HTMLElement | null; start?: number }
type Toast = { text: string; undo?: () => void }

const first = (name: string) => name.split(" ")[0]
const timeOf = (b: Booking) => (b.allDay ? "All day" : `${hhmm(b.start)}–${hhmm(b.end)}`)

function Ready({ data }: { data: Ready }) {
	const [view, setView] = usePersistentView(data.storageKey, DEFAULT)
	const setUi = (f: Partial<View>) => setView((v) => ({ ...v, ...f }))
	const today = useMemo(() => dayIso(new Date()), [])
	const [day, setDay] = useState(today)
	const [toast, setToast] = useState<Toast | null>(null)
	const [target, setTarget] = useState<Target | null>(null)
	// Cancelled bookings disappear right away; the host's rows can lag behind an archive.
	const [gone, setGone] = useState<ReadonlySet<string>>(new Set())
	const sources = useMemo(
		() => (gone.size ? { ...data.sources, bookings: { ...data.sources.bookings, items: data.sources.bookings.items.filter((r) => !gone.has(r.id)) } } : data.sources),
		[data.sources, gone]
	)
	const archive = async (id: string, m = data.mutations) => {
		setGone((g) => new Set(g).add(id))
		const err = await m.archive("bookings", id)
		if (err)
			setGone((g) => {
				const n = new Set(g)
				n.delete(id)
				return n
			})
		return err
	}
	const { rooms, places, bookings } = sources
	const { properties, visible, filtering } = useFiltered(places, view.filters, data.resolvers, today)
	const O = useMemo(() => readOffice(sources, data.resolvers, visible), [sources, data.resolvers, visible])
	const me = data.resolvers.meId
	const myName = me ? data.resolvers.userName(me) : undefined
	const nowMin = useNow()
	const at = day === today ? nowMin : undefined
	const T = COPY[view.theme]
	const [page, setPage] = useState<"root" | "layout" | "hours" | "theme" | "dropin">("root")
	const drop = (p: Place) => isDropIn(p)
	// "Always free" lives in the Places database, so everyone sees the same open seating.
	const canFree = places.propertyIdsByKey.free !== undefined
	const allPlaces = useMemo(() => readOffice(sources, data.resolvers, null).places, [sources, data.resolvers])
	const placeTypes = useMemo(() => [...new Set(allPlaces.map((p) => p.type))].sort(), [allPlaces])
	const [saving, setSaving] = useState(false)
	const setFree = async (type: string, on: boolean) => {
		const ids = allPlaces.filter((p) => p.type === type && p.free !== on).map((p) => p.id)
		setSaving(true)
		let err: string | null = null
		for (const id of ids) err = (await data.mutations.update("places", id, { free: W.checkbox(on) })) ?? err
		setSaving(false)
		setToast({ text: err ? `Couldn't save: ${err}` : `${type}: ${ids.length} place${ids.length === 1 ? "" : "s"} ${on ? "always free" : "bookable again"}.` })
	}
	const canNote = bookings.propertyIdsByKey.note !== undefined
	const canOffer = bookings.propertyIdsByKey.open !== undefined

	useEffect(() => {
		if (!toast) return
		const t = window.setTimeout(() => setToast(null), 7000)
		return () => window.clearTimeout(t)
	}, [toast])

	const fail = (err: string | null) => (err ? (setToast({ text: `Couldn't save: ${err}` }), true) : false)
	const newBooking = (place: Place, when: ReturnType<typeof W.date>) => ({
		name: W.title(`${place.name}${myName ? ` · ${myName}` : ""}`),
		place: W.relation([place.id]),
		...(me ? { who: W.people([me]) } : {}),
		when,
	})
	// Undo reads the latest rows through a ref, since the claim arrives after the toast is made.
	const latest = useLatest(data)
	const undoClaim = (place: Place, d: string, restore?: Place) => async () => {
		setToast(null)
		const now = latest.current
		const all = readOffice(now.sources, now.resolvers, null).bookings
		const b = all.find((x) => x.placeId === place.id && x.day === d && !!me && x.who.includes(me) && x.allDay)
		if (b) await archive(b.id, now.mutations)
		if (restore) await now.mutations.create("bookings", newBooking(restore, W.date(d)))
	}

	/** Claims a place for the whole day; moves you off another place of the same type that day. */
	const claimDay = async (place: Place) => {
		if (!me) return setToast({ text: "Sign in to Notion to claim a place." })
		const old = O.bookings.find((b) => b.day === day && b.allDay && b.who.includes(me) && b.placeId !== place.id && O.places.find((p) => p.id === b.placeId)?.type === place.type)
		if (old && fail(await archive(old.id))) return
		if (fail(await data.mutations.create("bookings", newBooking(place, W.date(day))))) return
		const from = old ? O.places.find((p) => p.id === old.placeId) : undefined
		setToast({ text: from ? T.moved(from.name, place.name) : T.claimed(place.name), undo: undoClaim(place, day, from) })
	}
	const book = async (place: Place, start: number, end: number, note = "") => {
		const plan: PropertyWrite = note.trim() && canNote ? { note: W.text(note.trim()) } : {}
		if (fail(await data.mutations.create("bookings", { ...newBooking(place, W.date(`${day}T${hhmm(start)}`, `${day}T${hhmm(end)}`)), ...plan }))) return
		setToast({ text: `${drop(place) ? `Plan at ${place.name}` : `Booked ${place.name}`}, ${hhmm(start)}–${hhmm(end)}${note.trim() ? `: ${note.trim()}` : ""}.` })
	}
	const cancel = async (b: Booking) => {
		if (!fail(await archive(b.id))) setToast({ text: "Booking cancelled." })
	}
	const setNote = async (b: Booking, note: string) => {
		if (note.trim() !== b.note) fail(await data.mutations.update("bookings", b.id, { note: W.text(note.trim()) }))
	}
	const setOffer = async (b: Booking, open: boolean) => {
		if (!fail(await data.mutations.update("bookings", b.id, { open: W.checkbox(open) }))) setToast({ text: open ? "Marked up for grabs: others can take it over." : "It's yours again." })
	}

	const pick = (place: Place, anchor: HTMLElement) => {
		// Drop-in seating is never claimed; clicking it adds a plan.
		if (drop(place)) return setTarget({ place, anchor })
		const st = stateOf(O, place.id, day, view.open, view.close, me)
		const wholeDayFree = !clash(O, place.id, day, view.open, view.close)
		if (view.quick && (st === "free" || st === "offered") && wholeDayFree && !(at != null && at >= view.close)) void claimDay(place)
		else setTarget({ place, anchor })
	}

	const settings = (anchor: HTMLElement | null, close: () => void) => {
		const back = () => setPage("root")
		const shut = () => {
			setPage("root")
			close()
		}
		if (page === "layout")
			return (
				<SettingsShell anchor={anchor} onClose={shut} title="Layout" onBack={back}>
					<PickRow label="Rooms" sub="Rooms as cards, places as tiles" selected={view.layout === "rooms"} onClick={() => setUi({ layout: "rooms" })} />
					<PickRow label="Timeline" sub="One row per place across the day" selected={view.layout === "timeline"} onClick={() => setUi({ layout: "timeline" })} />
				</SettingsShell>
			)
		if (page === "theme")
			return (
				<SettingsShell anchor={anchor} onClose={shut} title="Theme" onBack={back}>
					<PickRow label="The Office" sub="Paper, name tags, sticky notes" selected={view.theme === "office"} onClick={() => setUi({ theme: "office" })} />
					<PickRow label="Notion" sub="Plain and quiet" selected={view.theme === "notion"} onClick={() => setUi({ theme: "notion" })} />
				</SettingsShell>
			)
		if (page === "dropin") {
			if (!canFree)
				return (
					<SettingsShell anchor={anchor} onClose={shut} title="Always free" onBack={back}>
						<Note>
							Add a checkbox property named <b>Always free</b> to the Places database to pick open seating here for everyone. Until then, types named like
							Cafeteria, Canteen, Kitchen, Break area or Drop-in are always free
							{placeTypes.some((t) => isDropIn({ type: t, free: null })) ? ` (here: ${placeTypes.filter((t) => isDropIn({ type: t, free: null })).join(", ")})` : ""}.
						</Note>
					</SettingsShell>
				)
			return (
				<SettingsShell anchor={anchor} onClose={shut} title="Always free" onBack={back}>
					{placeTypes.map((t) => {
						const of = allPlaces.filter((p) => p.type === t)
						const n = of.filter((p) => p.free).length
						const all = n === of.length
						return <PickRow key={t} label={t} sub={n > 0 && !all ? `${n} of ${of.length} places` : `${of.length} place${of.length === 1 ? "" : "s"}`} checkbox selected={all} onClick={() => !saving && void setFree(t, !all)} />
					})}
					<Note>Ticks the Always free checkbox in the Places database for every place of that type, in every room, so everyone sees them as open seating. Single places can be ticked there too.</Note>
				</SettingsShell>
			)
		}
		if (page === "hours")
			return (
				<SettingsShell anchor={anchor} onClose={shut} title="Opening hours" onBack={back}>
					<NumberRow label="Opens at" value={view.open / 60} min={0} step={0.5} onChange={(v) => setUi({ open: Math.max(0, Math.min(view.close - 60, Math.round(v * 2) * 30)) })} suffix="h" />
					<NumberRow label="Closes at" value={view.close / 60} min={1} step={0.5} onChange={(v) => setUi({ close: Math.min(24 * 60, Math.max(view.open + 60, Math.round(v * 2) * 30)) })} suffix="h" />
					<Note>Timed bookings are made within these hours, and availability is judged on them.</Note>
				</SettingsShell>
			)
		return (
			<SettingsShell anchor={anchor} onClose={shut} title="Office settings">
				<NavRow icon={<LayersIcon />} label="Theme" value={view.theme === "office" ? "The Office" : "Notion"} onClick={() => setPage("theme")} />
				<NavRow icon={<ColumnIcon />} label="Layout" value={view.layout === "rooms" ? "Rooms" : "Timeline"} onClick={() => setPage("layout")} />
				<NavRow icon={<TargetIcon />} label="Always free" value={canFree ? `${allPlaces.filter((p) => p.free).length} places` : "By type name"} onClick={() => setPage("dropin")} />
				<NavRow icon={<ClockIcon />} label="Opening hours" value={`${hhmm(view.open)}–${hhmm(view.close)}`} onClick={() => setPage("hours")} />
				<Sep />
				<ToggleRow icon={<TargetIcon />} label="One click claims the day" sub="Click a free place to book it all day; the clock button picks times" on={view.quick} onChange={(v) => setUi({ quick: v })} />
				<NumberRow label="Default timed booking" value={view.length} min={15} step={15} onChange={(v) => setUi({ length: Math.max(15, Math.round(v / 15) * 15) })} suffix="min" />
				<ToggleRow icon={<PersonIcon />} label="Show who booked" on={view.names} onChange={(v) => setUi({ names: v })} />
			</SettingsShell>
		)
	}

	const mine = O.bookings.filter((b) => me && b.who.includes(me) && (b.day > today || (b.day === today && b.end > nowMin))).sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start)
	const bookable = O.places.filter((p) => !drop(p))
	const freeCount = bookable.filter((p) => ["free", "offered"].includes(stateOf(O, p.id, day, view.open, view.close, undefined, at))).length
	const dropSeats = O.places.filter(drop).reduce((n, p) => n + (p.capacity ?? 1), 0)
	const usual = usualPlace(O, me)
	const usualP = usual ? O.places.find((p) => p.id === usual.placeId) : undefined
	// Where you sit today: your whole-day claim (meetings don't count).
	const mineToday = me ? O.bookings.find((b) => b.day === day && b.allDay && b.who.includes(me)) : undefined
	const usualFree = usualP && !mineToday && !clash(O, usualP.id, day, view.open, view.close)

	return (
		<div className={view.theme === "office" ? "theme-office" : undefined}>
			<Toolbar title={T.title} sub={dayLabel(day, today)} view={view} setView={setView} properties={properties} filtering={filtering} today={today} settings={settings}
				actions={<NewMenu data={data} canFree={canFree} onDone={(t) => setToast(t ? { text: t } : null)} />}
				share={{ block: "office", defaults: DEFAULT, schemas: places.propertySchemasById, sanitize }}
			/>
			<div className="tlbar daybar">
				<button type="button" className="ghost ic big" aria-label="Previous day" onClick={() => setDay((d) => addDay(d, -1))}>
					‹
				</button>
				<button type="button" className="ghost today" disabled={day === today} onClick={() => setDay(today)}>
					Today
				</button>
				<button type="button" className="ghost ic big" aria-label="Next day" onClick={() => setDay((d) => addDay(d, 1))}>
					›
				</button>
				<input className="field" type="date" aria-label="Day" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} style={{ width: 150 }} />
				<span className="spacer" />
				<span className="daystat">
					{freeCount} of {bookable.length} {day === today ? "free now" : "free all day"}
					{dropSeats ? ` · ${dropSeats} drop-in seat${dropSeats === 1 ? "" : "s"}` : ""}
				</span>
			</div>

			{mineToday || usualFree ? (
				<div className="usual">
					<span>{mineToday ? T.usualMine(O.places.find((p) => p.id === mineToday.placeId)?.name ?? mineToday.title) : T.usualFree(usualP!.name)}</span>
					{!mineToday && usualP ? (
						<button type="button" className="btn primary" onClick={() => void claimDay(usualP)}>
							{T.claim}
						</button>
					) : null}
				</div>
			) : null}

			{O.places.length === 0 ? (
				<div className="state">{filtering ? "No places match the filters." : T.empty}</div>
			) : view.layout === "rooms" ? (
				<RoomsLayout O={O} day={day} view={view} T={T} me={me} at={at} onPick={pick} onDetails={(place, anchor) => setTarget({ place, anchor })} />
			) : (
				<TimelineLayout O={O} day={day} view={view} me={me} now={at ?? null} userName={data.resolvers.userName} onPick={(place, anchor, start) => setTarget({ place, anchor, start })} />
			)}

			{target ? (
				<BookPopover
					key={target.place.id + day + (target.start ?? "")}
					target={target}
					O={O}
					day={day}
					view={view}
					T={T}
					me={me}
					now={at ?? null}
					canNote={canNote}
					canOffer={canOffer}
					room={O.rooms.find((r) => r.places.includes(target.place))?.name}
					onClaimDay={() => {
						void claimDay(target.place)
						setTarget(null)
					}}
					onBook={(s, e, n) => {
						void book(target.place, s, e, n)
						setTarget(null)
					}}
					onCancel={(b) => void cancel(b)}
					onNote={(b, n) => void setNote(b, n)}
					onOffer={(b, v) => void setOffer(b, v)}
					onClose={() => setTarget(null)}
				/>
			) : null}

			{toast ? (
				<div className="toast" role="status">
					<span>{toast.text}</span>
					{toast.undo ? (
						<button type="button" className="ghost sm" onClick={toast.undo}>
							Undo
						</button>
					) : null}
				</div>
			) : null}

			{mine.length ? (
				<div className="mybookings">
					<h3>{T.mine}</h3>
					{mine.slice(0, 8).map((b) => (
						<MyBooking key={b.id} b={b} place={O.places.find((x) => x.id === b.placeId)} today={today} T={T} canNote={canNote} canOffer={canOffer} onCancel={() => void cancel(b)} onNote={(n) => void setNote(b, n)} onOffer={(v) => void setOffer(b, v)} />
					))}
					{canNote || canOffer ? <p className="hint">Leave a note, or mark a booking up for grabs so a colleague can take the place (for example, when you leave at noon).</p> : null}
				</div>
			) : null}

			<div className="foot">
				{filtering ? (
					<span>
						Places are filtered.{" "}
						<button type="button" className="ghost sm" onClick={() => setUi({ filters: EMPTY_FILTERS })}>
							Clear filters
						</button>
					</span>
				) : null}
				{O.skipped ? <span>{O.skipped} bookings have no place or date and are left out.</span> : null}
				{bookings.truncated || places.truncated || rooms.truncated ? <span>Only the first 999 rows of each database are read.</span> : null}
			</div>
		</div>
	)
}

function useLatest<T>(v: T) {
	const [ref] = useState(() => ({ current: v }))
	ref.current = v
	return ref
}

function MyBooking({ b, place, today, T, canNote, canOffer, onCancel, onNote, onOffer }: { b: Booking; place?: Place; today: string; T: Copy; canNote: boolean; canOffer: boolean; onCancel: () => void; onNote: (n: string) => void; onOffer: (v: boolean) => void }) {
	const [note, setNote] = useState(b.note)
	useEffect(() => setNote(b.note), [b.note])
	return (
		<div className="mine-row">
			<span className={"dot" + (b.open ? " offered" : " mine")} />
			<span className="mine-l">
				{place?.name ?? b.title}
				<span className="sub">
					{dayLabel(b.day, today)} · {timeOf(b)}
				</span>
			</span>
			{canNote ? (
				<input
					className="field note-in"
					maxLength={200}
					placeholder="Add a note…"
					aria-label={`Note for ${place?.name ?? b.title}`}
					value={note}
					onChange={(e) => setNote(e.target.value)}
					onBlur={() => onNote(note)}
					onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
				/>
			) : null}
			{canOffer ? (
				<label className="offer" title="Let a colleague take this place over">
					<input type="checkbox" aria-label={`${T.grabs}: ${place?.name ?? b.title}`} checked={b.open} onChange={(e) => onOffer(e.target.checked)} />
					{T.grabs}
				</label>
			) : null}
			<button type="button" className="ghost sm" onClick={onCancel}>
				Cancel
			</button>
		</div>
	)
}

/** Minutes since local midnight, refreshed every minute. */
function useNow(): number {
	const get = () => {
		const d = new Date()
		return d.getHours() * 60 + d.getMinutes()
	}
	const [n, setN] = useState(get)
	useEffect(() => {
		const t = window.setInterval(() => setN(get()), 60000)
		return () => window.clearInterval(t)
	}, [])
	return n
}

/* ---------- rooms layout ---------- */

type TileProps = { O: Office; day: string; view: View; T: Copy; me?: string; at?: number; onPick: (p: Place, el: HTMLElement) => void; onDetails: (p: Place, el: HTMLElement) => void }

function RoomsLayout(props: TileProps) {
	const { O, day, view, me, at } = props
	// Floors in the order the rooms come (Notion's order); rooms without a floor last.
	const floors = [...new Set(O.rooms.map((r) => r.floor))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : 0))
	return (
		<div className="floors">
			{floors.map((f) => (
				<section key={f || "-"}>
					{floors.length > 1 || f ? <h3 className="floor">{f || "Other"}</h3> : null}
					<div className="rooms">
						{O.rooms
							.filter((r) => r.floor === f && r.places.length)
							.map((r) => {
								const states = r.places.map((p) => stateOf(O, p.id, day, view.open, view.close, me, at))
								const isDrop = r.places.map(isDropIn)
								const booked = r.places.filter((_, i) => !isDrop[i])
								const free = states.filter((s, i) => !isDrop[i] && (s === "free" || s === "offered")).length
								const seats = r.places.filter((_, i) => isDrop[i]).reduce((n, p) => n + (p.capacity ?? 1), 0)
								return (
									<div key={r.id} className="room">
										<div className="room-h">
											<b>{r.name}</b>
											<span>
												{r.type ? `${r.type} · ` : ""}
												{booked.length ? `${free}/${booked.length} free` : `${seats} seat${seats === 1 ? "" : "s"}, always free`}
											</span>
										</div>
										<div className="tiles">
											{r.places.map((p, i) => (
												isDrop[i] ? <DropTile key={p.id} {...props} p={p} /> : <Tile key={p.id} {...props} p={p} st={states[i]} />
											))}
										</div>
									</div>
								)
							})}
					</div>
				</section>
			))}
		</div>
	)
}

const STATE_LABEL: Record<State, string> = { free: "Free", partial: "Partly booked", busy: "Booked", mine: "Yours", offered: "Up for grabs" }

function Tile({ O, p, st, day, view, T, me, at, onPick, onDetails }: TileProps & { p: Place; st: State }) {
	const bs = bookingsOn(O, p.id, day)
	const current = bs.find((b) => (at == null ? true : b.end > at)) ?? bs[0]
	const who = current && view.names ? current.whoNames.map(first).join(", ") : ""
	const note = bs.find((b) => b.note)?.note
	let sub: ReactNode
	if (st === "free" && !current) sub = <span className="tile-s">{`${p.type}${p.capacity && p.capacity > 1 ? ` · ${p.capacity} seats` : ""}`}</span>
	else if (st === "mine") {
		const m = bs.find((b) => !!me && b.who.includes(me) && (at == null || b.end > at))
		sub = m && !m.allDay ? <span className="tile-s">{`${hhmm(m.start)}–${hhmm(m.end)} · you${bs.length > 1 ? ` +${bs.length - 1}` : ""}`}</span> : <span className="tag me">{T.yours}</span>
	}
	else if (st === "offered") sub = <span className="tile-s">{`${T.grabs}${who ? ` · ${who}` : ""}`}</span>
	else if (current?.allDay) sub = who ? <span className="tag">{who}</span> : <span className="tile-s">All day</span>
	else if (current) sub = <span className="tile-s">{`${hhmm(current.start)}–${hhmm(current.end)}${who ? ` ${who}` : ""}${bs.length > 1 ? ` +${bs.length - 1}` : ""}`}</span>
	else sub = <span className="tile-s">{T.free}</span>
	const quick = view.quick && (st === "free" || st === "offered")
	return (
		<div className={"tile " + st}>
			<button type="button" className="tile-main" onClick={(e) => onPick(p, e.currentTarget)} title={[`${p.name}: ${STATE_LABEL[st]}`, ...bs.map((b) => [b.whoNames.join(", ") || b.title, timeOf(b), b.open ? "up for grabs" : "", b.note ? `“${b.note}”` : ""].filter(Boolean).join(" · ")), quick ? "Click to claim it for the day" : ""].filter(Boolean).join("\n")}>
				<span className="tile-t">
					<TypeGlyph type={p.type} />
					{p.name}
				</span>
				{sub}
				{quick ? <span className="tile-claim">{T.claim}</span> : null}
			</button>
			<button type="button" className="tile-more" aria-label={`Times and details for ${p.name}`} title="Times and details" onClick={(e) => onDetails(p, e.currentTarget)}>
				<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
					<circle cx="8" cy="8" r="6" />
					<path d="M8 4.8V8l2.2 1.4" />
				</svg>
			</button>
			{note ? (
				<span className="sticky" title={note}>
					{note}
				</span>
			) : null}
		</div>
	)
}

/** Open seating: always free, nobody claims it; plans (lunch, dinner…) can be added and joined. */
function DropTile({ O, p, day, view, me, at, onPick }: TileProps & { p: Place }) {
	const seats = p.capacity ?? 1
	const plans = bookingsOn(O, p.id, day).filter((b) => at == null || b.end > at)
	const next = plans[0]
	const mine = !!me && plans.some((b) => b.who.includes(me))
	const who = (b: Booking) => (view.names ? b.whoNames.map(first).join(", ") : "")
	return (
		<div className={"tile drop" + (mine ? " planned" : "")}>
			<button
				type="button"
				className="tile-main"
				onClick={(e) => onPick(p, e.currentTarget)}
				title={[`${p.name}: always free, no booking needed`, ...plans.map((b) => [timeOf(b), b.note, who(b)].filter(Boolean).join(" · ")), "Click to add a plan others can join"].join("\n")}
			>
				<span className="tile-t">
					<TypeGlyph type={p.type} />
					{p.name}
				</span>
				{next ? (
					<span className="tile-s">{`${hhmm(next.start)} ${next.note || who(next) || "Plan"}${plans.length > 1 ? ` +${plans.length - 1}` : ""}`}</span>
				) : (
					<span className="tile-s">{`${p.type} · ${seats} seat${seats === 1 ? "" : "s"}`}</span>
				)}
				<span className="drop-l">Always free</span>
				<span className="tile-claim">Add a plan</span>
			</button>
		</div>
	)
}

function TypeGlyph({ type }: { type: string }) {
	const t = type.toLowerCase()
	const d = /caf|canteen|kantine|mensa|kitchen|küche|break|pause/.test(t)
		? "M3.5 6.5h7v3.5a3 3 0 0 1-3 3h-1a3 3 0 0 1-3-3zM10.5 7.5h1a1.5 1.5 0 0 1 0 3h-1M5.5 2.5v2M8 2.5v2"
		: /meet|conf/.test(t)
		? "M3 5.5h10v6H3zM5 11.5v2M11 11.5v2M5.5 3.5h5"
		: /phone|booth|call/.test(t)
			? "M5.5 2.5h5v11h-5zM7.5 11h1"
			: /park|car/.test(t)
				? "M3 10.5l1.2-4h7.6l1.2 4v2.5H3zM5 13v1M11 13v1M5 10.5h.1M11 10.5h.1"
				: /lounge|sofa/.test(t)
					? "M2.5 8.5h11v4h-11zM4 8.5V6h8v2.5"
					: "M2.5 6.5h11M4 6.5v7M12 6.5v7M6 4h4v2.5H6z"
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="glyph">
			<path d={d} />
		</svg>
	)
}

/* ---------- timeline layout ---------- */

function TimelineLayout({ O, day, view, me, now, userName, onPick }: { O: Office; day: string; view: View; me?: string; now: number | null; userName: (id: string) => string | undefined; onPick: (p: Place, el: HTMLElement, start: number) => void }) {
	// Plans at drop-in seating (an early breakfast, a team dinner) widen the day beyond opening hours.
	const plans = O.bookings.filter((b) => b.day === day && !b.allDay && O.places.some((p) => p.id === b.placeId && isDropIn(p)))
	const lo = Math.floor(Math.min(view.open, ...plans.map((b) => b.start)) / 60) * 60
	const hi = Math.ceil(Math.max(view.close, ...plans.map((b) => b.end)) / 60) * 60
	const span = hi - lo
	const pct = (m: number) => `${((Math.min(Math.max(m, lo), hi) - lo) / span) * 100}%`
	const hours: number[] = []
	for (let h = Math.ceil(lo / 60) * 60; h <= hi; h += 60) hours.push(h)
	return (
		<div className="tl">
			<div className="tl-row tl-head">
				<span className="tl-name" />
				<span className="tl-track">
					{hours.map((h) => (
						<span key={h} className="tl-hour" style={{ left: pct(h), transform: h === hi ? "translateX(-100%)" : undefined }}>
							{h / 60}
						</span>
					))}
				</span>
			</div>
			{O.rooms
				.filter((r) => r.places.length)
				.map((r) => (
					<div key={r.id}>
						<div className="tl-room">{r.name}</div>
						{r.places.map((p) => (
							<div key={p.id} className="tl-row">
								<span className="tl-name" title={p.type}>
									<TypeGlyph type={p.type} />
									{p.name}
								</span>
								<span
									className={"tl-track" + (isDropIn(p) ? " tl-drop" : "")}
									role="button"
									tabIndex={0}
									aria-label={isDropIn(p) ? `Add a plan at ${p.name}` : `Book ${p.name}`}
									onClick={(e) => {
										const r = e.currentTarget.getBoundingClientRect()
										const m = lo + Math.floor((((e.clientX - r.left) / r.width) * span) / 30) * 30
										onPick(p, e.currentTarget, m)
									}}
									onKeyDown={(e) => e.key === "Enter" && onPick(p, e.currentTarget, lo)}
								>
									{isDropIn(p) && !bookingsOn(O, p.id, day).length ? <span className="tl-drop-l">{`Always free · ${p.capacity ?? 1} seat${(p.capacity ?? 1) === 1 ? "" : "s"}`}</span> : null}
									{hours.map((h) => (
										<span key={h} className="tl-grid" style={{ left: pct(h) }} />
									))}
									{bookingsOn(O, p.id, day).map((b) => (
										<span
											key={b.id}
											className={"tl-b" + (me && b.who.includes(me) ? " mine" : "") + (b.open ? " offered" : "")}
											style={{ left: pct(b.start), width: `calc(${pct(b.end)} - ${pct(b.start)})` }}
											title={`${timeOf(b)} ${b.who.map((id) => userName(id) ?? "").join(", ")}${b.note ? ` — ${b.note}` : ""}${b.open ? " (up for grabs)" : ""}`}
										>
											{isDropIn(p) && b.note ? b.note : view.names && b.whoNames.length ? first(b.whoNames[0]) : timeOf(b)}
											{b.note && !isDropIn(p) ? ` · ${b.note}` : ""}
										</span>
									))}
									{now != null && now >= lo && now <= hi ? <span className="tl-now" style={{ left: pct(now) }} /> : null}
								</span>
							</div>
						))}
					</div>
				))}
		</div>
	)
}

/* ---------- booking popover ---------- */

function slots(open: number, close: number): number[] {
	const out: number[] = []
	for (let t = open; t <= close; t += 15) out.push(t)
	return out
}

type PopProps = {
	target: Target
	O: Office
	day: string
	view: View
	T: Copy
	me?: string
	now: number | null
	room?: string
	canNote: boolean
	canOffer: boolean
	onClaimDay: () => void
	onBook: (s: number, e: number, note?: string) => void
	onCancel: (b: Booking) => void
	onNote: (b: Booking, n: string) => void
	onOffer: (b: Booking, v: boolean) => void
	onClose: () => void
}

function BookPopover({ target, O, day, view, T, me, now, room, canNote, canOffer, onClaimDay, onBook, onCancel, onNote, onOffer, onClose }: PopProps) {
	const p = target.place
	const from = target.start ?? Math.max(view.open, now ?? view.open)
	const initial = firstFree(O, p.id, day, from, view.length, view.open, view.close) ?? firstFree(O, p.id, day, view.open, 15, view.open, view.close) ?? view.open
	const [start, setStart] = useState(initial)
	const [end, setEnd] = useState(Math.min(view.close, initial + view.length))
	const bs = bookingsOn(O, p.id, day)
	const hit = clash(O, p.id, day, start, end)
	const over = takesOver(O, p.id, day, start, end)
	const past = now != null && end <= now
	// Drop-in seating takes plans (lunch, dinner…), also outside opening hours, and is never claimed for the day.
	const drop = isDropIn(p)
	const [plan, setPlan] = useState("")
	const dayFree = !drop && !clash(O, p.id, day, view.open, view.close) && !(now != null && now >= view.close)
	const dayOver = takesOver(O, p.id, day, view.open, view.close)
	const all = drop ? slots(Math.min(view.open, 7 * 60), 23 * 60 + 45) : slots(view.open, view.close)
	return (
		<Popover anchor={target.anchor} onClose={onClose} width={320} className="settings book">
			<div className="shead">
				<span className="shead-t">
					<TypeGlyph type={p.type} /> {p.name}
				</span>
			</div>
			<div className="sbody">
				<p className="snote">{[p.type, room, p.capacity && p.capacity > 1 ? `${p.capacity} seats` : null, ...p.features].filter(Boolean).join(" · ")}</p>
				{dayFree ? (
					<div className="claimrow">
						<button type="button" className="btn primary wide" onClick={onClaimDay}>
							{T.claim} for the whole day
						</button>
						{dayOver.length ? <p className="snote">Takes over from {dayOver.map((b) => b.whoNames[0] ?? "someone").join(", ")}, who marked it up for grabs.</p> : null}
					</div>
				) : null}
				<DayStrip
					bs={bs}
					open={drop ? Math.floor(Math.min(view.open, start, ...bs.map((b) => b.start)) / 60) * 60 : view.open}
					close={drop ? Math.ceil(Math.max(view.close, end, ...bs.map((b) => b.end)) / 60) * 60 : view.close}
					pick={{ start, end }}
					now={now}
					me={me}
				/>
				{bs.length ? (
					<div className="blist">
						{bs.map((b) => {
							const mine = !!me && b.who.includes(me)
							return (
								<div key={b.id} className="brow-wrap">
									<div className="brow">
										<span className={"dot" + (b.open ? " offered" : mine ? " mine" : "")} />
										<span className="brow-l">
											{timeOf(b)} <span className="sub">{b.whoNames.join(", ") || b.title}</span>
											{b.open ? <span className="badge">{T.grabs}</span> : null}
										</span>
										{mine ? (
											<button type="button" className="ghost sm" onClick={() => onCancel(b)}>
												Cancel
											</button>
										) : drop && me && !(now != null && b.end <= now) && !bs.some((x) => x.who.includes(me) && x.start === b.start && x.end === b.end) ? (
											<button type="button" className="ghost sm" title="Add yourself to this plan" onClick={() => onBook(b.start, b.end, b.note)}>
												Join
											</button>
										) : null}
									</div>
									{mine && (canNote || (canOffer && !drop)) ? (
										<div className="brow-edit">
											{canNote ? <NoteInput b={b} onNote={onNote} /> : null}
											{canOffer && !drop ? (
												<label className="offer">
													<input type="checkbox" aria-label={T.grabs} checked={b.open} onChange={(e) => onOffer(b, e.target.checked)} />
													{T.grabs}
												</label>
											) : null}
										</div>
									) : b.note ? (
										<p className="bnote">“{b.note}”</p>
									) : null}
								</div>
							)
						})}
					</div>
				) : (
					<p className="snote">{drop ? "Always free: just drop by. Add a plan, like lunch or dinner, so others can join." : "No bookings on this day."}</p>
				)}
				<div className="msep" />
				<p className="snote">{drop ? "Add a plan" : "Or pick times"}</p>
				{drop && canNote ? <input className="field plan-in" maxLength={200} placeholder="What's the plan? e.g. Team dinner" value={plan} onChange={(e) => setPlan(e.target.value)} /> : null}
				<div className="bform">
					<Field label="From">
						<select
							className="dd"
							value={start}
							onChange={(e) => {
								const s = Number(e.target.value)
								setStart(s)
								if (end <= s) setEnd(Math.min(view.close, s + view.length))
							}}
						>
							{all.slice(0, -1).map((t) => (
								<option key={t} value={t}>
									{hhmm(t)}
								</option>
							))}
						</select>
					</Field>
					<Field label="To">
						<select className="dd" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
							{all
								.filter((t) => t > start)
								.map((t) => (
									<option key={t} value={t}>
										{hhmm(t)}
									</option>
								))}
						</select>
					</Field>
					<button type="button" className={"btn" + (drop ? " primary" : "")} disabled={!!hit || past} onClick={() => onBook(start, end, plan)}>
						{drop ? "Add" : "Book"}
					</button>
				</div>
				{hit ? (
					<p className="snote bad">
						Overlaps {hit.whoNames[0] ?? "a booking"} {timeOf(hit)}.
					</p>
				) : past ? (
					<p className="snote bad">That time has passed.</p>
				) : over.length ? (
					<p className="snote">Takes over from {over.map((b) => b.whoNames[0] ?? "someone").join(", ")} (up for grabs).</p>
				) : null}
			</div>
		</Popover>
	)
}

function NoteInput({ b, onNote }: { b: Booking; onNote: (b: Booking, n: string) => void }) {
	const [v, setV] = useState(b.note)
	return <input className="field note-in" maxLength={200} placeholder="Note, e.g. “Gone after 12”" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => onNote(b, v)} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
}

function DayStrip({ bs, open, close, pick, now, me }: { bs: Booking[]; open: number; close: number; pick: { start: number; end: number }; now: number | null; me?: string }) {
	const pct = (m: number) => `${((Math.min(Math.max(m, open), close) - open) / (close - open)) * 100}%`
	return (
		<div className="strip" aria-hidden="true">
			{bs.map((b) => (
				<span key={b.id} className={"strip-b" + (me && b.who.includes(me) ? " mine" : "") + (b.open ? " offered" : "")} style={{ left: pct(b.start), width: `calc(${pct(b.end)} - ${pct(b.start)})` }} />
			))}
			<span className="strip-pick" style={{ left: pct(pick.start), width: `calc(${pct(pick.end)} - ${pct(pick.start)})` }} />
			{now != null ? <span className="tl-now" style={{ left: pct(now) }} /> : null}
			<span className="strip-l">{hhmm(open)}</span>
			<span className="strip-r">{hhmm(close)}</span>
		</div>
	)
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="bfield">
			<span>{label}</span>
			{children}
		</label>
	)
}

/* ---------- add rooms and places ---------- */

function NewMenu({ data, onDone, canFree }: { data: Ready; onDone: (m: string | null) => void; canFree: boolean }) {
	const a = useAnchor()
	const [kind, setKind] = useState<"menu" | "room" | "place">("menu")
	const close = () => {
		a.close()
		setKind("menu")
	}
	const { rooms, places } = data.sources
	return (
		<>
			<button type="button" ref={a.ref} className="tool" aria-label="Add a room or place" title="Add a room or place" onClick={() => (a.open ? close() : a.toggle())}>
				<Plus />
			</button>
			{a.open ? (
				<Popover anchor={a.el} onClose={close} width={300} className="settings">
					{kind === "menu" ? (
						<>
							<div className="shead">
								<span className="shead-t">Add</span>
							</div>
							<div className="sbody">
								<PickRow label="Room" sub={rooms.bound ? "A room or area that holds places" : "Connect a Rooms database first"} selected={false} onClick={() => rooms.bound && setKind("room")} />
								<PickRow label="Place" sub="A desk, meeting room, booth, parking spot…" selected={false} onClick={() => setKind("place")} />
							</div>
						</>
					) : kind === "room" ? (
						<NewForm
							title="New room"
							fields={[
								{ key: "name", label: "Name", type: "text" },
								{ key: "floor", label: "Floor", type: "choice", options: optionsOf(rooms, "floor") },
								{ key: "type", label: "Type", type: "choice", options: optionsOf(rooms, "type") },
							]}
							onBack={() => setKind("menu")}
							onSave={async (v) => {
								const err = await data.mutations.create("rooms", {
									name: W.title(v.name),
									...(v.floor && rooms.propertyIdsByKey.floor ? { floor: W.select(v.floor) } : {}),
									...(v.type && rooms.propertyIdsByKey.type ? { type: W.select(v.type) } : {}),
								})
								onDone(err ? `Couldn't add the room: ${err}` : `Added room ${v.name}.`)
								close()
							}}
						/>
					) : (
						<NewForm
							title="New place"
							fields={[
								{ key: "name", label: "Name", type: "text" },
								{ key: "type", label: "Type", type: "choice", options: [...new Set([...optionsOf(places, "type"), "Desk", "Meeting room", "Phone booth", "Parking", "Cafeteria seat"])] },
								...(rooms.bound ? [{ key: "room", label: "Room", type: "pick" as const, options: rooms.items.map((r) => ({ value: r.id, label: String(r.propertiesByKey.name ?? "Untitled") })) }] : []),
								{ key: "capacity", label: "Seats", type: "number" },
								...(canFree ? [{ key: "drop", label: "Always free: open seating, nobody books it (e.g. cafeteria)", type: "check" as const }] : []),
							]}
							onBack={() => setKind("menu")}
							onSave={async (v) => {
								const err = await data.mutations.create("places", {
									name: W.title(v.name),
									...(v.type && places.propertyIdsByKey.type ? { type: W.select(v.type) } : {}),
									...(v.room && places.propertyIdsByKey.room ? { room: W.relation([v.room]) } : {}),
									...(v.capacity && places.propertyIdsByKey.capacity ? { capacity: W.number(Number(v.capacity)) } : {}),
									...(v.drop === "1" ? { free: W.checkbox(true) } : {}),
								})
								onDone(err ? `Couldn't add the place: ${err}` : `Added ${v.name}${v.drop === "1" ? ", always free" : ""}.`)
								close()
							}}
						/>
					)}
				</Popover>
			) : null}
		</>
	)
}

type FieldSpec =
	| { key: string; label: string; type: "text" | "number" | "check" }
	| { key: string; label: string; type: "choice"; options: string[] }
	| { key: string; label: string; type: "pick"; options: { value: string; label: string }[] }

function NewForm({ title, fields, onBack, onSave }: { title: string; fields: FieldSpec[]; onBack: () => void; onSave: (v: Record<string, string>) => void }) {
	const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.type === "choice" ? (f.options[0] ?? "") : f.type === "pick" ? (f.options[0]?.value ?? "") : ""])))
	const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }))
	return (
		<>
			<div className="shead">
				<button type="button" className="ghost ic" aria-label="Back" onClick={onBack}>
					‹
				</button>
				<span className="shead-t">{title}</span>
			</div>
			<form
				className="sbody nform"
				onSubmit={(e) => {
					e.preventDefault()
					if (v.name.trim()) onSave({ ...v, name: v.name.trim() })
				}}
			>
				{fields.map((f) => (
					<label key={f.key} className="bfield wide">
						{f.type === "check" ? null : <span>{f.label}</span>}
						{f.type === "check" ? (
							<span className="ncheck">
								<input type="checkbox" checked={v[f.key] === "1"} onChange={(e) => set(f.key, e.target.checked ? "1" : "")} /> {f.label}
							</span>
						) : f.type === "text" || f.type === "number" ? (
							<input className="field" type={f.type} maxLength={200} autoFocus={f.key === "name"} min={f.type === "number" ? 1 : undefined} value={v[f.key]} onChange={(e) => set(f.key, e.target.value)} />
						) : f.type === "choice" ? (
							<>
								<input className="field" maxLength={100} list={`opt-${f.key}`} value={v[f.key]} onChange={(e) => set(f.key, e.target.value)} />
								<datalist id={`opt-${f.key}`}>
									{f.options.map((o) => (
										<option key={o} value={o} />
									))}
								</datalist>
							</>
						) : (
							<select className="dd" value={v[f.key]} onChange={(e) => set(f.key, e.target.value)}>
								<option value="">No room</option>
								{(f as Extract<FieldSpec, { type: "pick" }>).options.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
						)}
					</label>
				))}
				<button type="submit" className="btn primary" disabled={!v.name.trim()}>
					Add
				</button>
			</form>
		</>
	)
}
