/**
 * 💾 Where the last setup lives between visits.
 *
 * `localStorage` throws rather than returns when the browser has site data switched off, or when a private window
 * has run out of room. Every call is wrapped, because a browser that will not remember anything should still play.
 */

export interface Store {
	readonly get: (key: string) => string | null;
	readonly set: (key: string, value: string) => void;
}

export const browserStore: Store = {
	get(key) {
		try {
			return globalThis.localStorage.getItem(key);
		} catch {
			return null;
		}
	},
	set(key, value) {
		try {
			globalThis.localStorage.setItem(key, value);
		} catch {
			// Nothing to do and nothing to say: the game plays either way.
		}
	},
};

/** A store that remembers only for the life of the page, for tests and for Storybook. */
export function memoryStore(initial: Record<string, string> = {}): Store {
	const held = new Map(Object.entries(initial));
	return {
		get: (key) => held.get(key) ?? null,
		set: (key, value) => void held.set(key, value),
	};
}
