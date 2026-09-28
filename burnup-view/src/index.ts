import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

worker.customBlock("burnup", {
	path: "./blocks/burnup-view",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		items: {
			name: "Items",
			description:
				"The work to burn: tasks, stories, tickets. Each row joins the " +
				"scope on its Added date (or when it was created) and counts as " +
				"done on its Done date. Every property can be used in the filter bar.",
			icon: { type: "emoji", emoji: "🔥" },
			properties: {
				name: { name: "Name", type: "title" },
				estimate: {
					name: "Estimate",
					description: "Optional size (points, hours, €). Tickets without one count as the average estimate, and the block can also just count tickets.",
					type: "number",
				},
				added: {
					name: "Added",
					description: "Optional. By default the block uses each row's created time; this date can override it (Settings → Joins the scope).",
					type: "date",
				},
				done: {
					name: "Done",
					description: "When the item was finished. Empty = still open.",
					type: "date",
				},
			},
		},
	},
})
