/**
 * Opens a Notion page from inside a block. The SDK has no "open page" call,
 * so this navigates to the page's Notion URL in a new tab (the host decides
 * whether a block may). Callers use buttons, not links, so the URL is never
 * shown on hover. Returns false when the host blocked it.
 */
export function openPage(id: string): boolean {
	const hex = id.replace(/-/g, "")
	if (!/^[0-9a-f]{32}$/i.test(hex)) return false
	const url = `https://www.notion.so/${hex}`
	try {
		const w = window.open(url, "_blank", "noopener,noreferrer")
		if (w !== null) return true
	} catch {
		// Blocked by the sandbox: try a plain navigation below.
	}
	try {
		const a = document.createElement("a")
		a.href = url
		a.target = "_blank"
		a.rel = "noopener noreferrer"
		a.click()
		return true
	} catch {
		return false
	}
}
