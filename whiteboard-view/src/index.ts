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
			description: "One row per sticky note. The board stores only the position; colors and drawings stay on each viewer's device.",
			icon: { type: "emoji", emoji: "🗒️" },
			properties: {
				title: { name: "Title", description: "The note's text.", type: "title" },
				x: { name: "X", description: "Position on the board; relative to the note's frame when it sits in one.", type: "number" },
				y: { name: "Y", description: "Position on the board; relative to the note's frame when it sits in one.", type: "number" },
				author: { name: "Author", description: "Optional. Who wrote the note; set by the block. Created by is used when empty.", type: "people" },
				done: { name: "Done", description: "Optional. Checked-off notes are eaten by the turtle and hidden from the board.", type: "checkbox" },
				resolution: { name: "How it was fixed", description: "Optional. Asked for when a note is checked off; prefilled with what's there so it can be edited.", type: "rich_text" },
			},
		},
	},
})
