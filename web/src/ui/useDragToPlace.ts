/**
 * 🫳 Dragging the piece in hand onto the board, beside the tap flow. Pointer Events rather than HTML drag and drop,
 * so a finger or a Pencil on iPad Safari and a mouse on a desktop all behave the same.
 *
 * A press becomes a drag once it has moved the threshold; until then nothing happens, so a tap on the hand piece
 * still reaches whatever else listens for it. While dragging, a ghost of the piece follows the pointer and the
 * legal cell under it is marked as the drop target. Release over that cell places the piece through the same
 * action as a tap on the cell; release anywhere else sends the ghost back to the hand.
 */

import {type PointerEvent, useCallback, useEffect, useRef, useState} from "react";
import type {Cell} from "../game/cells.js";
import {dropCell as dropCellUnder, isDrag, type Point} from "./dragMath.js";

/** Where the ghost is drawn: the hand piece's box at the press, shifted by how far the pointer has moved. */
export interface DragGhost {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
	readonly dx: number;
	readonly dy: number;
	/** Floating back to the hand after a release that placed nothing. */
	readonly returning: boolean;
}

export interface DragHandlers {
	readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
	readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
	readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
	readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
}

export interface DragToPlace {
	/** There is somewhere to drop the piece, so a press on it may start a drag. */
	readonly enabled: boolean;
	readonly ghost: DragGhost | null;
	/** The legal cell under the pointer while dragging. */
	readonly dropCell: Cell | null;
	readonly handlers: DragHandlers;
}

/** Must match the transition on `.drag-ghost.returning`. */
const RETURN_MILLISECONDS = 180;

interface Press {
	readonly pointerId: number;
	readonly start: Point;
	readonly origin: DOMRect;
	dragging: boolean;
}

function pointOf(event: PointerEvent<HTMLElement>): Point {
	return {x: event.clientX, y: event.clientY};
}

function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useDragToPlace(legalCells: ReadonlySet<Cell>, onPlace: (cell: Cell) => void): DragToPlace {
	const enabled = legalCells.size > 0;
	const press = useRef<Press | null>(null);
	const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [ghost, setGhost] = useState<DragGhost | null>(null);
	const [dropCell, setDropCell] = useState<Cell | null>(null);

	const clearReturn = useCallback(() => {
		if (returnTimer.current !== null) {
			clearTimeout(returnTimer.current);
			returnTimer.current = null;
		}
	}, []);
	useEffect(() => clearReturn, [clearReturn]);

	const sendBack = useCallback((from: Press) => {
		if (prefersReducedMotion()) {
			setGhost(null);
			return;
		}
		const {left, top, width, height} = from.origin;
		setGhost({left, top, width, height, dx: 0, dy: 0, returning: true});
		returnTimer.current = setTimeout(() => {
			returnTimer.current = null;
			setGhost(null);
		}, RETURN_MILLISECONDS);
	}, []);

	const onPointerDown = useCallback(
		(event: PointerEvent<HTMLElement>) => {
			if (!enabled || !event.isPrimary || event.button !== 0 || press.current !== null) {
				return;
			}
			clearReturn();
			setGhost(null);
			event.currentTarget.setPointerCapture(event.pointerId);
			press.current = {
				pointerId: event.pointerId,
				start: pointOf(event),
				origin: event.currentTarget.getBoundingClientRect(),
				dragging: false,
			};
		},
		[enabled, clearReturn],
	);

	const onPointerMove = useCallback(
		(event: PointerEvent<HTMLElement>) => {
			const current = press.current;
			if (current === null || event.pointerId !== current.pointerId) {
				return;
			}
			const point = pointOf(event);
			if (!current.dragging) {
				if (!isDrag(current.start, point)) {
					return;
				}
				current.dragging = true;
			}
			const {left, top, width, height} = current.origin;
			setGhost({
				left,
				top,
				width,
				height,
				dx: point.x - current.start.x,
				dy: point.y - current.start.y,
				returning: false,
			});
			setDropCell(dropCellUnder(document.elementFromPoint(point.x, point.y), legalCells));
		},
		[legalCells],
	);

	const onPointerUp = useCallback(
		(event: PointerEvent<HTMLElement>) => {
			const current = press.current;
			if (current === null || event.pointerId !== current.pointerId) {
				return;
			}
			press.current = null;
			if (!current.dragging) {
				return;
			}
			const point = pointOf(event);
			const target = dropCellUnder(document.elementFromPoint(point.x, point.y), legalCells);
			setDropCell(null);
			if (target === null) {
				sendBack(current);
				return;
			}
			setGhost(null);
			onPlace(target);
		},
		[legalCells, onPlace, sendBack],
	);

	const onPointerCancel = useCallback(
		(event: PointerEvent<HTMLElement>) => {
			const current = press.current;
			if (current === null || event.pointerId !== current.pointerId) {
				return;
			}
			press.current = null;
			setDropCell(null);
			if (current.dragging) {
				sendBack(current);
			}
		},
		[sendBack],
	);

	return {enabled, ghost, dropCell, handlers: {onPointerDown, onPointerMove, onPointerUp, onPointerCancel}};
}
