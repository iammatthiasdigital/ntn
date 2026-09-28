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
			description: "One row per sticky note: its text and position. Grouping, who wrote it, Done and the fix note are picked from your own properties in the block's settings; colors and drawings stay on each viewer's device.",
			icon: { type: "emoji", emoji: "🗒️" },
			properties: {
				title: { name: "Title", description: "The note's text.", type: "title" },
				x: { name: "X", description: "Position on the board; relative to the note's frame when it sits in one.", type: "number" },
				y: { name: "Y", description: "Position on the board; relative to the note's frame when it sits in one.", type: "number" },
			},
		},
	},
})
