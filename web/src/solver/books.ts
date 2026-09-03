/**
 * 📚 The opening books the solver loads: one `.qbk` file per rules variant, fetched on demand.
 *
 * The wasm ships without book data, so the client fetches the book for the chosen rules and posts it to the worker
 * before the first search. Each file is imported through Vite's asset pipeline, so its URL carries a content hash
 * and can be cached for good; a page downloads each book at most once and every solver on the page shares it.
 */

import type {Rules} from "../game/rules.js";
import linesUrl from "./books/lines.qbk?url";
import squaresUrl from "./books/squares.qbk?url";

export const BOOK_URLS: Readonly<Record<Rules, string>> = {lines: linesUrl, squares: squaresUrl};

function reason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export class OpeningBooks {
	private readonly fetchImpl: typeof fetch;
	private readonly urls: Readonly<Record<Rules, string>>;
	private readonly downloads = new Map<Rules, Promise<ArrayBuffer>>();

	constructor(
		fetchImpl: typeof fetch = async (input, init) => globalThis.fetch(input, init),
		urls: Readonly<Record<Rules, string>> = BOOK_URLS,
	) {
		this.fetchImpl = fetchImpl;
		this.urls = urls;
	}

	/** The book for `rules`, downloaded once and then shared; a download that failed is tried again next time. */
	async load(rules: Rules): Promise<ArrayBuffer> {
		let download = this.downloads.get(rules);
		if (download === undefined) {
			download = this.download(rules);
			this.downloads.set(rules, download);
			download.catch(() => {
				this.downloads.delete(rules);
			});
		}
		return download;
	}

	/** Starts downloading the book for `rules` so a solver created later finds it ready; failures wait for `load`. */
	prefetch(rules: Rules): void {
		this.load(rules).catch(() => {
			// The solver that needs the book will report the failure when it asks for it.
		});
	}

	private async download(rules: Rules): Promise<ArrayBuffer> {
		const url = this.urls[rules];
		let response: Response;
		try {
			response = await this.fetchImpl(url, {cache: "force-cache"});
		} catch (error: unknown) {
			throw new Error(`Could not fetch the opening book at ${url}: ${reason(error)}`);
		}
		if (!response.ok) {
			throw new Error(`Could not fetch the opening book at ${url}: HTTP ${response.status}`);
		}
		return response.arrayBuffer();
	}
}

/** The page's one set of books, shared by the setup screen's prefetch and every solver. */
export const openingBooks = new OpeningBooks();
