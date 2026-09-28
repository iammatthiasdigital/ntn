/**
 * The done turtle: pixel art, a blue ecosio hoodie, and an appetite for
 * finished sticky notes. Drawn from character rows so it stays crisp at any
 * pixel size; the mouth is its own layer so it can chomp.
 */
import type { CSSProperties } from "react"

const BODY = [
	"....NNN...................",
	"..NNBBBNN.................",
	".NBBBBBBBN...NNNNNNNN.....",
	"NBBBBBBBBBNNNBBLBBBBBNN...",
	"NBBGGGGBBBNBBLLBBBBBBBBN..",
	"NBGWKGGGBBBBLBBBBBBBBBBBN.",
	"NGGKKGGGBBBBBBBBBBBBBBBBBN",
	"NGGGGGGGBBBBBBBBBBBBBBBBBN",
	"NBDDGGGGBBBBBBBBBBBBBBBBBN",
	"NBGGGGGBBBBBBNNNNNNNNBBBBN",
	".NBBBBWBWBBBBNBBBBBBNBBBNG",
	"..NNBBWNWNNNNNNNNNNNNNNNGN",
	"....NNN.NNGGGN....NGGGN.N.",
	".........NGGGN....NGGGN...",
	".........NDDDN....NDDDN...",
	"..........NNN......NNN....",
]
// Open mouth: drawn over the lower face.
const MOUTH = [
	[1, 8],
	[2, 8],
	[3, 8],
	[2, 9],
	[3, 9],
]
const COLORS: Record<string, string> = {
	N: "#002268",
	B: "#0054FF",
	L: "#5B8CFF",
	G: "#6FD44E",
	D: "#3E9A2A",
	K: "#141414",
	W: "#FFFFFF",
}
export const TURTLE_W = BODY[0].length
export const TURTLE_H = BODY.length
/** Where the mouth is, in pixels from the top left. */
export const MOUTH_AT = { x: 2.5, y: 8.5 }

export function Turtle({ px, eating, dancing, className, style }: { px: number; eating?: boolean; dancing?: boolean; className?: string; style?: CSSProperties }) {
	const rects = []
	for (let y = 0; y < BODY.length; y++)
		for (let x = 0; x < BODY[y].length; x++) {
			const c = COLORS[BODY[y][x]]
			if (c) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} />)
		}
	return (
		<svg
			className={["wb-turtle", eating ? "eating" : "", dancing ? "dancing" : "", className ?? ""].filter(Boolean).join(" ")}
			width={TURTLE_W * px}
			height={TURTLE_H * px}
			viewBox={`0 0 ${TURTLE_W} ${TURTLE_H}`}
			shapeRendering="crispEdges"
			style={style}
			aria-hidden="true"
		>
			<g className="wb-t-body">{rects}</g>
			<g className="wb-t-mouth">
				{MOUTH.map(([x, y]) => (
					<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="#7a1f2b" />
				))}
			</g>
		</svg>
	)
}
