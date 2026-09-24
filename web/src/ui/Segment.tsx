/**
 * 🎚️ A row of radio buttons styled as one control, with the selected option's one-line description underneath.
 * The setup screen uses it for every choice; the play screen uses it, without the description, for annotations.
 */

import {useId} from "react";

export interface SegmentOption<T extends string> {
	readonly value: T;
	readonly label: string;
	readonly help: string;
}

export interface SegmentProps<T extends string> {
	readonly label: string;
	readonly options: readonly SegmentOption<T>[];
	readonly value: T;
	readonly onChange: (value: T) => void;
	/** Leave out the description under the control, where there is no room for it. */
	readonly compact?: boolean;
}

export function Segment<T extends string>({label, options, value, onChange, compact = false}: SegmentProps<T>) {
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
			<div
				className="segment"
				role="radiogroup"
				aria-labelledby={labelId}
				aria-describedby={compact ? undefined : helpId}
			>
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
			{!compact && (
				<p className="field-help" id={helpId}>
					{selected.help}
				</p>
			)}
		</div>
	);
}
