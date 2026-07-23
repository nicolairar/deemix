import got from "got";
import { logger } from "./logger.js";

interface NavidromeTrack {
	id: string;
	title: string;
}

// Map of playlist UUID → promise, so concurrent downloads don't interfere
const pendingSync = new Map<string, Promise<void>>();

/**
 * After an Apple Music playlist download completes, trigger a Navidrome library
 * scan then create a matching playlist with all found songs.
 *
 * Reads NAVIDROME_URL, NAVIDROME_USER, NAVIDROME_PASSWORD from the environment.
 * Silently does nothing when those vars are absent.
 */
export function syncNavidromePlaylist(
	uuid: string,
	playlistTitle: string,
	trackTitles: string[]
): void {
	// Fire-and-forget but track per-uuid so we don't double-run
	if (pendingSync.has(uuid)) return;

	const task = _doSync(playlistTitle, trackTitles)
		.catch((err) => {
			logger.error(`[Navidrome] sync failed for "${playlistTitle}": ${err}`);
		})
		.finally(() => {
			pendingSync.delete(uuid);
		});

	pendingSync.set(uuid, task);
}

async function _doSync(
	playlistTitle: string,
	trackTitles: string[]
): Promise<void> {
	const { NAVIDROME_URL, NAVIDROME_USER, NAVIDROME_PASSWORD } = process.env;
	if (!NAVIDROME_URL || !NAVIDROME_USER || !NAVIDROME_PASSWORD) return;

	const base = NAVIDROME_URL.replace(/\/$/, "");
	const basicAuth = Buffer.from(`${NAVIDROME_USER}:${NAVIDROME_PASSWORD}`).toString("base64");

	const commonParams: Record<string, string> = {
		u: NAVIDROME_USER,
		p: NAVIDROME_PASSWORD,
		v: "1.16.1",
		c: "deemix",
		f: "json",
	};

	// 1. Trigger library scan
	try {
		await got.post(`${base}/api/scanner/trigger`, {
			headers: { Authorization: `Basic ${basicAuth}` },
		});
		logger.info(`[Navidrome] library scan triggered`);
	} catch (e) {
		logger.warn(`[Navidrome] scan trigger failed (may already be running): ${e}`);
	}

	// 2. Search for each track (with polling to wait for scan to index them)
	const found: NavidromeTrack[] = [];
	for (const title of trackTitles) {
		const track = await _pollForTrack(base, commonParams, title);
		if (track) found.push(track);
	}

	if (!found.length) {
		logger.warn(`[Navidrome] no tracks found for playlist "${playlistTitle}"`);
		return;
	}

	// 3. Find existing playlist or create new one
	let playlistId: string | undefined;

	const listQs = new URLSearchParams(commonParams);
	const listResult: any = await got
		.get(`${base}/rest/getPlaylists.view?${listQs}`)
		.json();
	const existingPlaylists: any[] =
		listResult?.["subsonic-response"]?.playlists?.playlist ?? [];
	const existing = existingPlaylists.find(
		(p: any) => p.name === playlistTitle
	);

	if (existing) {
		playlistId = String(existing.id);
		logger.info(
			`[Navidrome] found existing playlist "${playlistTitle}" (id=${playlistId})`
		);
	} else {
		const createQs = new URLSearchParams({ ...commonParams, name: playlistTitle });
		const createResult: any = await got
			.get(`${base}/rest/createPlaylist.view?${createQs}`)
			.json();
		playlistId = createResult?.["subsonic-response"]?.playlist?.id;
		if (!playlistId) {
			logger.error(`[Navidrome] failed to create playlist "${playlistTitle}"`);
			return;
		}
		logger.info(
			`[Navidrome] created playlist "${playlistTitle}" (id=${playlistId})`
		);
	}

	// 4. Add songs one by one (skip duplicates already in playlist)
	const detailQs = new URLSearchParams({ ...commonParams, playlistId });
	const detailResult: any = await got
		.get(`${base}/rest/getPlaylist.view?${detailQs}`)
		.json();
	const existingIds = new Set<string>(
		(detailResult?.["subsonic-response"]?.playlist?.entry ?? []).map(
			(e: any) => String(e.id)
		)
	);

	for (const track of found) {
		if (existingIds.has(track.id)) continue;
		try {
			const addQs = new URLSearchParams({
				...commonParams,
				playlistId,
				songIdToAdd: track.id,
			});
			await got.get(`${base}/rest/updatePlaylist.view?${addQs}`);
		} catch (e) {
			logger.warn(
				`[Navidrome] failed to add "${track.title}" to playlist: ${e}`
			);
		}
	}

	logger.info(
		`[Navidrome] added ${found.length}/${trackTitles.length} tracks to "${playlistTitle}"`
	);
}

async function _pollForTrack(
	base: string,
	commonParams: Record<string, string>,
	title: string,
	maxWaitMs = 60_000,
	intervalMs = 5_000
): Promise<NavidromeTrack | null> {
	const deadline = Date.now() + maxWaitMs;
	while (Date.now() < deadline) {
		try {
			const qs = new URLSearchParams({
				...commonParams,
				query: title,
				count: "1",
			});
			const result: any = await got
				.get(`${base}/rest/search3.view?${qs}`)
				.json();
			const songs: any[] =
				result?.["subsonic-response"]?.searchResult3?.song ?? [];
			if (songs.length > 0) {
				return { id: String(songs[0].id), title: String(songs[0].title) };
			}
		} catch {
			/* polling — keep going */
		}
		await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
	}
	logger.warn(`[Navidrome] timed out waiting for track "${title}"`);
	return null;
}
