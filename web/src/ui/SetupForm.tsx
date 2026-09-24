/**
 * ⚙️ The setup screen's choices: six segmented controls, plus two name inputs when two people share the device.
 * State flows down and comes back whole through onChange; the Play link and the help links arrive through `actions`
 * so the form knows nothing about the router.
 */

import {type ReactNode, useId} from "react";
import {NAME_MAX_LENGTH, type Setup} from "../setup/setup.js";
import {ANNOTATIONS} from "./annotations.js";
import {Segment, type SegmentOption} from "./Segment.js";

export interface SetupFormProps {
	readonly value: Setup;
	readonly onChange: (setup: Setup) => void;
	readonly actions: ReactNode;
}

const OPPONENTS: readonly SegmentOption<Setup["opponent"]>[] = [
	{value: "bot", label: "Bot", help: "The computer, on this device. Choose how strong it plays below."},
	{value: "human", label: "Another person", help: "Two people take turns on this one device."},
];

const RULES: readonly SegmentOption<Setup["rules"]>[] = [
	{
		value: "lines",
		label: "Lines only",
		help: "Four in a row, column or diagonal sharing a trait wins. The classic rules.",
	},
	{
		value: "squares",
		label: "Lines + 2×2 squares",
		help: "Rows, columns, diagonals, or any 2×2 square sharing a trait. The official advanced variant.",
	},
];

const DIFFICULTIES: readonly SegmentOption<Setup["difficulty"]>[] = [
	{
		value: "medium",
		label: "Medium",
		help: "Blocks your one-move wins and takes its own; otherwise plays at random.",
	},
	{value: "impossible", label: "Impossible", help: "Perfect play from the solved game tree."},
];

const FIRST: readonly SegmentOption<Setup["first"]>[] = [
	{value: "you", label: "You", help: "You hand the bot its first piece."},
	{value: "bot", label: "Bot", help: "The bot hands you your first piece."},
];

const UNDO: readonly SegmentOption<Setup["undo"]>[] = [
	{value: "allowed", label: "Allowed", help: "Undo takes back the last move at any time."},
	{value: "off", label: "Off", help: "Confirm each turn; no take-backs after that."},
];

export function SetupForm({value, onChange, actions}: SetupFormProps) {
	const namesLabelId = useId();
	const setName = (index: 0 | 1, name: string) => {
		const names: Setup["names"] = index === 0 ? [name, value.names[1]] : [value.names[0], name];
		onChange({...value, names});
	};
	return (
		<div className="fields">
			<Segment
				label="Opponent"
				options={OPPONENTS}
				value={value.opponent}
				onChange={(opponent) => {
					onChange({...value, opponent});
				}}
			/>
			{value.opponent === "human" && (
				<div className="field" role="group" aria-labelledby={namesLabelId}>
					<span className="field-label" id={namesLabelId}>
						Players
					</span>
					<div className="names">
						<input
							type="text"
							value={value.names[0]}
							placeholder="Player 1"
							maxLength={NAME_MAX_LENGTH}
							autoComplete="off"
							aria-label="First player's name"
							onChange={(event) => {
								setName(0, event.target.value);
							}}
						/>
						<input
							type="text"
							value={value.names[1]}
							placeholder="Player 2"
							maxLength={NAME_MAX_LENGTH}
							autoComplete="off"
							aria-label="Second player's name"
							onChange={(event) => {
								setName(1, event.target.value);
							}}
						/>
					</div>
					<p className="field-help">The first player hands over a piece; the second player places it.</p>
				</div>
			)}
			{value.opponent === "bot" && (
				<Segment
					label="Difficulty"
					options={DIFFICULTIES}
					value={value.difficulty}
					onChange={(difficulty) => {
						onChange({...value, difficulty});
					}}
				/>
			)}
			<Segment
				label="Rules"
				options={RULES}
				value={value.rules}
				onChange={(rules) => {
					onChange({...value, rules});
				}}
			/>
			{value.opponent === "bot" && (
				<Segment
					label="Who moves first"
					options={FIRST}
					value={value.first}
					onChange={(first) => {
						onChange({...value, first});
					}}
				/>
			)}
			<Segment
				label="Annotations"
				options={ANNOTATIONS}
				value={value.annotations}
				onChange={(annotations) => {
					onChange({...value, annotations});
				}}
			/>
			<Segment
				label="Undo"
				options={UNDO}
				value={value.undo}
				onChange={(undo) => {
					onChange({...value, undo});
				}}
			/>
			<div className="actions pinned">{actions}</div>
		</div>
	);
}
