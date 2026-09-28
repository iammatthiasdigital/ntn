import { Worker } from "@notionhq/workers"

const worker = new Worker()
export default worker

worker.customBlock("workload", {
	path: "./blocks/workload-view",
	command: "npx vite build",
	output: "dist",
	version: 1,
	dataSources: {
		assignments: {
			name: "Workload",
			description:
				"One row per allocation: a person (people property or relation), a project (select or relation), " +
				"a workload (%, or hours) and optionally dates and a team. Rows without dates are ongoing. " +
				"Which column is which is chosen in the block's settings.",
			icon: { type: "emoji", emoji: "⚖️" },
			properties: {
				name: { name: "Name", type: "title" },
			},
		},
		people: {
			name: "People",
			description:
				"Optional: everyone on the team, also those without allocations, with their team (select or relation) " +
				"and working time (hours per week or %). Matched to the Workload by relation, person or name.",
			icon: { type: "emoji", emoji: "🧑‍💻" },
			properties: {
				name: { name: "Name", type: "title" },
			},
		},
	},
})
