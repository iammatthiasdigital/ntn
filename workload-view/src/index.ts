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
				"One row per task: a person (people property or relation), dates, and optionally an effort (%, or hours) " +
				"and properties to group by. Nothing loads until a project or person is picked. " +
				"Which property is which is chosen in the block's settings.",
			icon: { type: "emoji", emoji: "⚖️" },
			properties: {
				name: { name: "Name", type: "title" },
			},
		},
		projects: {
			name: "Projects",
			description:
				"Optional: your projects database. The block lists its projects to pick one and loads only that project's tasks " +
				"(through the projects' relation to the tasks), instead of the whole task database.",
			icon: { type: "emoji", emoji: "📁" },
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
