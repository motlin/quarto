/**
 * ⚙️ The setup screen's choices: four segmented controls, plus two name inputs when two people share the device.
 * State flows down and comes back whole through onChange; the Play link and the help links arrive through `actions`
 * so the form knows nothing about the router.
 */

import {type ReactNode, useId} from "react";
import {NAME_MAX_LENGTH, type Setup} from "../setup/setup.js";

export interface SetupFormProps {
	readonly value: Setup;
	readonly onChange: (setup: Setup) => void;
	readonly actions: ReactNode;
}

interface SegmentOption<T extends string> {
	readonly value: T;
	readonly label: string;
	readonly help: string;
}

interface SegmentProps<T extends string> {
	readonly label: string;
	readonly options: readonly SegmentOption<T>[];
	readonly value: T;
	readonly onChange: (value: T) => void;
}

/** A row of radio buttons styled as one control, with the selected option's one-line description underneath. */
function Segment<T extends string>({label, options, value, onChange}: SegmentProps<T>) {
	const labelId = useId();
	const helpId = useId();
	const selected = options.find((option) => option.value === value);
	if (selected === undefined) {
		throw new Error(`${label}: no option for value ${value}`);
	}
	return (
		<div className="field">
			<span className="field-label" id={labelId}>
				{label}
			</span>
			<div className="segment" role="radiogroup" aria-labelledby={labelId} aria-describedby={helpId}>
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={option.value === value}
						onClick={() => {
							onChange(option.value);
						}}
					>
						{option.label}
					</button>
				))}
			</div>
			<p className="field-help" id={helpId}>
				{selected.help}
			</p>
		</div>
	);
}

const OPPONENTS: readonly SegmentOption<Setup["opponent"]>[] = [
	{value: "bot", label: "Bot", help: "A perfect solver on this device. It never makes a mistake."},
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

const FIRST: readonly SegmentOption<Setup["first"]>[] = [
	{value: "you", label: "You", help: "You hand the bot its first piece."},
	{value: "bot", label: "Bot", help: "The bot hands you your first piece."},
];

const ANNOTATIONS: readonly SegmentOption<Setup["annotations"]>[] = [
	{value: "off", label: "Off", help: "No solver readout. The usual choice for two people."},
	{value: "outcome", label: "Outcome", help: "Shows who wins with perfect play and in how many moves."},
	{
		value: "values",
		label: "Outcome + move values",
		help: "Also labels every legal move with its exact outcome. Slower early in the game.",
	},
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
			<div className="actions pinned">{actions}</div>
		</div>
	);
}
