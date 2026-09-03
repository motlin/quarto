/**
 * 🔮 The solver's verdict: a lamp that pulses while it thinks, the outcome in the display face, and what the search
 * cost underneath.
 */

/** "decisive" is a win between two people, where neither side is the bot. */
export type VerdictKind = "win" | "loss" | "draw" | "decisive";

export interface VerdictView {
	readonly kind: VerdictKind;
	readonly text: string;
}

export interface OracleBarProps {
	readonly verdict: VerdictView | null;
	readonly thinking: boolean;
	readonly nodes?: number;
	readonly milliseconds?: number;
}

export function OracleBar({verdict, thinking, nodes, milliseconds}: OracleBarProps) {
	const detail =
		nodes !== undefined && milliseconds !== undefined
			? `${nodes.toLocaleString("en-US")} nodes · ${Math.round(milliseconds)} ms`
			: null;
	return (
		<div className="oracle">
			<div className={`verdict ${verdict?.kind ?? "draw"}`} aria-live="polite">
				<span className={`lamp${thinking ? " thinking" : ""}`} aria-hidden="true" />
				<span>{thinking && verdict === null ? "Thinking…" : (verdict?.text ?? "")}</span>
			</div>
			{detail !== null && <div className="verdict-detail">{detail}</div>}
		</div>
	);
}
