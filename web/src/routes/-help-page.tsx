/**
 * 📖 The frame around the two help documents: a way back to setup, a way into a game with the remembered setup,
 * the title, and the prose at a readable measure.
 */

import type {ReactNode} from "react";
import {getRouteApi, Link} from "@tanstack/react-router";
import {loadSetup, toPlaySearch} from "../setup/setup.js";

const rootRoute = getRouteApi("__root__");

export function HelpPage({title, children}: {title: string; children: ReactNode}) {
	const {store} = rootRoute.useRouteContext();
	const setup = loadSetup(store);
	return (
		<main className="screen">
			<nav className="topbar help" aria-label="Pages">
				<Link className="btn quiet" to="/">
					<span aria-hidden="true">‹</span> Setup
				</Link>
				<Link className="btn primary" to="/play" search={toPlaySearch(setup)}>
					Play
				</Link>
			</nav>
			<header className="masthead">
				<h1>{title}</h1>
			</header>
			<article className="prose">{children}</article>
		</main>
	);
}
