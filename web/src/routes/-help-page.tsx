/**
 * 📖 The frame around the Rules and Using-the-app pages: a way back to wherever the reader came from, the title,
 * and the prose at a readable measure.
 */

import type {ReactNode} from "react";
import {Link, useCanGoBack, useRouter} from "@tanstack/react-router";

/**
 * Back returns to the page that linked here, so a game opened with "?" is still there with its rules; a page
 * opened directly (a shared link, a bookmark) has nowhere to go back to and leads to setup instead.
 */
function BackControl() {
	const router = useRouter();
	const canGoBack = useCanGoBack();
	if (!canGoBack) {
		return (
			<Link className="btn quiet" to="/">
				<span aria-hidden="true">‹</span> Back
			</Link>
		);
	}
	return (
		<button
			type="button"
			className="btn quiet"
			onClick={() => {
				router.history.back();
			}}
		>
			<span aria-hidden="true">‹</span> Back
		</button>
	);
}

export function HelpPage({title, children}: {title: string; children: ReactNode}) {
	return (
		<main className="screen">
			<nav className="topbar help" aria-label="Pages">
				<BackControl />
			</nav>
			<header className="masthead">
				<h1>{title}</h1>
			</header>
			<article className="prose">{children}</article>
		</main>
	);
}
