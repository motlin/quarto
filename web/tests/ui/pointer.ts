/**
 * 🖱️ What jsdom lacks for pointer-driven tests: pointer capture, hit testing and media queries. Each stub is a
 * spy so a test can see what was asked of it, and `hitTest` decides what sits under the pointer.
 */

import {fireEvent} from "@testing-library/react";
import {vi} from "vitest";

export interface PointerStubs {
	readonly setPointerCapture: ReturnType<typeof vi.fn<(pointerId: number) => void>>;
	/** Puts `element` under every point until the next call. */
	readonly hitTest: (element: Element | null) => void;
	readonly setReducedMotion: (reduce: boolean) => void;
}

export function installPointerStubs(): PointerStubs {
	const setPointerCapture = vi.fn<(pointerId: number) => void>();
	HTMLElement.prototype.setPointerCapture = setPointerCapture;
	let under: Element | null = null;
	document.elementFromPoint = () => under;
	let reduce = false;
	window.matchMedia = (query: string): MediaQueryList =>
		Object.assign(new EventTarget(), {
			matches: query === "(prefers-reduced-motion: reduce)" && reduce,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
		});
	return {
		setPointerCapture,
		hitTest: (element) => {
			under = element;
		},
		setReducedMotion: (value) => {
			reduce = value;
		},
	};
}

export interface PointerAt {
	readonly x: number;
	readonly y: number;
}

const PRIMARY = {pointerId: 7, isPrimary: true, button: 0, buttons: 1};

function pointerEvent(type: string, at: PointerAt, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, {bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, ...PRIMARY, ...init});
}

/** Dispatches one pointer event inside React's act and reports whether its default was left alone. */
export function pointer(target: Element, type: string, at: PointerAt, init: PointerEventInit = {}): boolean {
	return fireEvent(target, pointerEvent(type, at, init));
}
