/**
 * Keeps a rendering error inside the block: a short message instead of a
 * blank frame, a retry, and a way out when a saved view is what breaks it
 * (clears this block kind's view settings in this browser). Nothing is
 * reported anywhere.
 */
import { Component, type ReactNode } from "react"

type Props = { children: ReactNode; /** localStorage prefix of this block kind's saved views, e.g. "whiteboard:". */ storagePrefix: string }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null }

	static getDerivedStateFromError(error: Error): State {
		return { error }
	}

	private resetViews = () => {
		try {
			for (const k of Object.keys(window.localStorage)) if (k.startsWith(this.props.storagePrefix)) window.localStorage.removeItem(k)
		} catch {
			// Storage blocked: nothing saved to clear.
		}
		this.setState({ error: null })
	}

	render(): ReactNode {
		if (!this.state.error) return this.props.children
		// Inline styles: the fallback must render even when the block's CSS is the problem.
		const btn = { height: 28, padding: "0 12px", marginRight: 6, border: "1px solid rgba(0,0,0,.15)", borderRadius: 6, background: "transparent", color: "inherit", font: "inherit", cursor: "pointer" }
		return (
			<div role="alert" style={{ padding: "14px 16px", border: "1px solid rgba(127,127,127,.3)", borderRadius: 8, font: "14px/1.5 ui-sans-serif, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif", color: "inherit" }}>
				<b>This block ran into a problem.</b>
				<p style={{ margin: "6px 0 10px", opacity: 0.8 }}>Your data in Notion is fine. Try again, or reset your view settings for this block if it keeps happening.</p>
				<code style={{ display: "block", marginBottom: 10, fontSize: 12, opacity: 0.6, wordBreak: "break-word" }}>{String(this.state.error.message).slice(0, 200)}</code>
				<button type="button" style={btn} onClick={() => this.setState({ error: null })}>
					Try again
				</button>
				<button type="button" style={btn} onClick={this.resetViews}>
					Reset my view
				</button>
			</div>
		)
	}
}
