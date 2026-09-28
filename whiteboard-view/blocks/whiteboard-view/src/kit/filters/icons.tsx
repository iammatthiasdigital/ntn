/** Small line icons in the style of Notion's property-type glyphs (16px). */
import type { ReactNode } from "react"

type P = { size?: number }

function Svg({ size = 16, children }: P & { children: ReactNode }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.25}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className="ico"
		>
			{children}
		</svg>
	)
}

const glyph = (s: string, size = 9.5, weight = 600) => (
	<text x="8" y="11.3" textAnchor="middle" fontSize={size} fontWeight={weight} fill="currentColor" stroke="none" fontFamily="ui-sans-serif, -apple-system, sans-serif">
		{s}
	</text>
)

const ICONS: Record<string, ReactNode> = {
	title: glyph("Aa", 9),
	rich_text: (
		<>
			<path d="M3 4.5h10M3 8h10M3 11.5h6.5" />
		</>
	),
	number: glyph("#", 11, 500),
	unique_id: glyph("ID", 7.5, 700),
	select: (
		<>
			<circle cx="8" cy="8" r="5.5" />
			<path d="M5.8 7.2 8 9.4l2.2-2.2" />
		</>
	),
	multi_select: (
		<>
			<path d="M6.5 4.5H13M6.5 8H13M6.5 11.5H13" />
			<circle cx="3.6" cy="4.5" r=".6" fill="currentColor" />
			<circle cx="3.6" cy="8" r=".6" fill="currentColor" />
			<circle cx="3.6" cy="11.5" r=".6" fill="currentColor" />
		</>
	),
	status: (
		<>
			<circle cx="8" cy="8" r="5.5" strokeDasharray="2.2 1.6" />
			<path d="M8 4.8A3.2 3.2 0 0 1 8 11.2Z" fill="currentColor" stroke="none" />
		</>
	),
	date: (
		<>
			<rect x="2.5" y="3.5" width="11" height="10" rx="1.8" />
			<path d="M2.5 6.5h11M5.5 2v2.5M10.5 2v2.5" />
		</>
	),
	people: (
		<>
			<circle cx="8" cy="5.6" r="2.6" />
			<path d="M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" />
		</>
	),
	files: <path d="M10.8 5.2 6.4 9.6a1.2 1.2 0 0 0 1.7 1.7l4.7-4.7a2.6 2.6 0 0 0-3.7-3.7L4.4 7.6a4 4 0 0 0 5.7 5.7l3-3" />,
	checkbox: (
		<>
			<rect x="2.5" y="2.5" width="11" height="11" rx="2.2" />
			<path d="m5.3 8.1 1.9 1.9 3.6-3.8" />
		</>
	),
	url: (
		<>
			<path d="M7 9a2.6 2.6 0 0 0 3.7 0l2-2A2.6 2.6 0 0 0 9 3.3l-.9.9" />
			<path d="M9 7a2.6 2.6 0 0 0-3.7 0l-2 2A2.6 2.6 0 0 0 7 12.7l.9-.9" />
		</>
	),
	email: (
		<>
			<circle cx="8" cy="8" r="2.4" />
			<path d="M10.4 8v1a1.8 1.8 0 0 0 3.6 0V8a6 6 0 1 0-2.4 4.8" />
		</>
	),
	phone_number: <path d="M5.2 2.5 3.3 3.2c-.6.3-.9.9-.8 1.6.8 4.5 4 7.7 8.5 8.5.7.1 1.3-.2 1.6-.8l.7-1.9-2.8-1.4-1.1 1.3a7 7 0 0 1-3.9-3.9l1.3-1.1Z" />,
	formula: <path d="M12 3H4.5L8.4 8 4.5 13H12" />,
	relation: (
		<>
			<path d="M5 11 11 5M6.5 5H11v4.5" />
		</>
	),
	rollup: (
		<>
			<circle cx="7" cy="7" r="4" />
			<path d="m10 10 3.5 3.5" />
		</>
	),
	created_time: (
		<>
			<circle cx="8" cy="8" r="5.5" />
			<path d="M8 5v3.2l2.2 1.3" />
		</>
	),
	created_by: (
		<>
			<circle cx="8" cy="8" r="5.5" />
			<circle cx="8" cy="6.8" r="1.8" />
			<path d="M4.6 12.2c.8-1.4 2-2 3.4-2s2.6.6 3.4 2" />
		</>
	),
	place: (
		<>
			<path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14Z" />
			<circle cx="8" cy="6.5" r="1.6" />
		</>
	),
	verification: (
		<>
			<path d="m8 1.8 1.6 1.3 2-.2.6 2 1.7 1.1-.7 1.9.7 1.9-1.7 1.1-.6 2-2-.2L8 14.2l-1.6-1.3-2 .2-.6-2-1.7-1.1.7-1.9-.7-1.9 1.7-1.1.6-2 2 .2Z" />
			<path d="m5.8 8 1.5 1.5 2.9-3" />
		</>
	),
	button: (
		<>
			<path d="m5 3 7.5 5.3-3.3.7L11 12.5l-1.4.7-1.8-3.5-2.4 2.3Z" />
		</>
	),
}
ICONS.location = ICONS.place
ICONS.last_edited_time = ICONS.created_time
ICONS.last_visited_time = ICONS.created_time
ICONS.last_edited_by = ICONS.created_by

export function PropIcon({ type, size }: { type: string } & P) {
	return <Svg size={size}>{ICONS[type] ?? ICONS.rich_text}</Svg>
}

export const FilterIcon = ({ size }: P) => (
	<Svg size={size}>
		<path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
	</Svg>
)

export const Chevron = ({ size = 12 }: P) => (
	<svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="chev">
		<path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
)

export const Dots = ({ size }: P) => (
	<Svg size={size}>
		<circle cx="3.5" cy="8" r=".9" fill="currentColor" stroke="none" />
		<circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none" />
		<circle cx="12.5" cy="8" r=".9" fill="currentColor" stroke="none" />
	</Svg>
)

export const Plus = ({ size }: P) => (
	<Svg size={size}>
		<path d="M8 3v10M3 8h10" />
	</Svg>
)

export const Trash = ({ size }: P) => (
	<Svg size={size}>
		<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2c0 .5.5.8 1 .8h3.8c.5 0 .9-.3 1-.8l.6-8.2" />
	</Svg>
)

export const Check = ({ size }: P) => (
	<Svg size={size}>
		<path d="m3.5 8.3 3 3 6-6.3" />
	</Svg>
)

export const Copy = ({ size }: P) => (
	<Svg size={size}>
		<rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
		<path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
	</Svg>
)

export const Group = ({ size }: P) => (
	<Svg size={size}>
		<rect x="2.5" y="2.5" width="11" height="11" rx="2" />
		<path d="M5.5 6h5M5.5 9h5" />
	</Svg>
)

export const Close = ({ size }: P) => (
	<Svg size={size}>
		<path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
	</Svg>
)

export const Search = ({ size }: P) => (
	<Svg size={size}>
		<circle cx="7" cy="7" r="4" />
		<path d="m10 10 3 3" />
	</Svg>
)

export const Gear = ({ size }: P) => (
	<Svg size={size}>
		<circle cx="8" cy="8" r="2" />
		<path d="M8 1.8v1.6M8 12.6v1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M1.8 8h1.6M12.6 8h1.6M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
	</Svg>
)

export const PageIcon = ({ size }: P) => (
	<Svg size={size}>
		<path d="M4 2.5h5l3 3v8H4Z" />
		<path d="M9 2.5v3h3M6 8.5h4M6 11h4" />
	</Svg>
)

export const ArrowRight = ({ size = 12 }: P) => (
	<svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="chev">
		<path d="M4.5 3 7.5 6l-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
	</svg>
)
