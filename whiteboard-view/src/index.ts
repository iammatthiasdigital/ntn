import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

worker.customBlock("whiteboard", {
	path: "./blocks/whiteboard-view",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		items: {
			name: "Notes",
			description: "One row per sticky note: its text and position. Done is linked here; grouping, who wrote it and the fix note are picked from your own properties in the block's settings; colors and drawings stay on each viewer's device.",
			icon: { type: "emoji", emoji: "🗒️" },
			properties: {
				title: { name: "Title", description: "The note's text.", type: "title" },
				x: { name: "X", description: "Position on the board; relative to the note's frame when it sits in one.", type: "number" },
				y: { name: "Y", description: "Position on the board; relative to the note's frame when it sits in one.", type: "number" },
				done: { name: "Done", description: "Optional. Checked-off notes are eaten by the turtle and hidden from the board.", type: "checkbox" },
			},
		},
	},
})
