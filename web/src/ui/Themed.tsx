/**
 * 🌗 Pins the theme for whatever it wraps. The tokens switch on `:root[data-theme]`, so the attribute goes on the
 * document element rather than on the wrapper, and comes off again on unmount.
 */

import {type ReactNode, useLayoutEffect} from "react";

export type Theme = "light" | "dark";

export function Themed({theme, children}: {theme: Theme; children: ReactNode}) {
	useLayoutEffect(() => {
		const root = document.documentElement;
		root.dataset["theme"] = theme;
		return () => {
			delete root.dataset["theme"];
		};
	}, [theme]);
	return <div style={{background: "var(--ground)", color: "var(--ink)", padding: 16}}>{children}</div>;
}
