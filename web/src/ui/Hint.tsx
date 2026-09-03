/** 🏷️ A move-value chip: "W3", "L2" or "=", coloured by its first character. */

type HintKind = "win" | "loss" | "draw";

function hintKind(label: string): HintKind {
	if (label.startsWith("W")) {
		return "win";
	}
	if (label.startsWith("L")) {
		return "loss";
	}
	if (label === "=") {
		return "draw";
	}
	throw new Error(`Not a move value label: ${JSON.stringify(label)}`);
}

export function Hint({label}: {label: string}) {
	return <span className={`hint ${hintKind(label)}`}>{label}</span>;
}
