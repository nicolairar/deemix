<script setup lang="ts">
import { fetchData, postToServer } from "@/utils/api-utils";
import { ref, watch, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

interface TrackEntry {
	id: string;
	title: string;
	duration: number;
	url: string;
}

interface VideoInfo {
	type: "video";
	id: string;
	title: string;
	uploader: string;
	duration: number;
	thumbnail: string | null;
	url: string;
}

interface PlaylistInfo {
	type: "playlist";
	title: string;
	uploader: string;
	thumbnail: string | null;
	count: number;
	entries: TrackEntry[];
}

type Info = VideoInfo | PlaylistInfo;

const info = ref<Info | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const loadingMessages = [
	"Connecting…",
	"Fetching metadata…",
	"Reading track list…",
	"Almost there…",
];
const loadingMsg = ref(loadingMessages[0]);
let msgInterval: ReturnType<typeof setInterval> | null = null;

function startLoadingMessages() {
	let i = 0;
	msgInterval = setInterval(() => {
		i = (i + 1) % loadingMessages.length;
		loadingMsg.value = loadingMessages[i];
	}, 1800);
}
function stopLoadingMessages() {
	if (msgInterval) clearInterval(msgInterval);
	msgInterval = null;
}

function formatDuration(secs: number): string {
	if (!secs) return "";
	const m = Math.floor(secs / 60);
	const s = secs % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

function isYouTube(url: string): boolean {
	return url.includes("youtube.com") || url.includes("youtu.be");
}

function sourceName(url: string): string {
	if (isYouTube(url)) return "YouTube";
	if (url.includes("soundcloud.com")) return "SoundCloud";
	return "Web";
}

function sourceColor(url: string): string {
	if (isYouTube(url)) return "#ff4444";
	if (url.includes("soundcloud.com")) return "#ff5500";
	return "#888";
}

async function loadInfo(url: string) {
	info.value = null;
	error.value = null;
	loading.value = true;
	loadingMsg.value = loadingMessages[0];
	startLoadingMessages();
	try {
		const data = await fetchData("youtubeInfo", { url });
		if (data.error) throw new Error(data.error);
		info.value = data as Info;
	} catch (e: any) {
		error.value = e.message ?? "Failed to fetch info";
	} finally {
		loading.value = false;
		stopLoadingMessages();
	}
}

async function downloadVideo(
	url: string,
	title: string,
	artist?: string,
	cover?: string,
	folder?: string
) {
	await postToServer("youtubeDownload", { url, title, artist, cover, folder });
}

async function downloadAll() {
	if (!info.value || info.value.type !== "playlist") return;
	await postToServer("youtubePlaylistDownload", {
		title: info.value.title,
		artist: info.value.uploader,
		cover: info.value.thumbnail,
		folder: info.value.title,
		entries: info.value.entries.map((e) => ({ url: e.url, title: e.title })),
	});
}

onMounted(() => {
	const url = route.query.url as string;
	if (url) loadInfo(url);
});

onUnmounted(() => {
	stopLoadingMessages();
});

watch(
	() => route.query.url,
	(url) => {
		if (url && (route.name === "YouTube" || route.name === "SoundCloud"))
			loadInfo(url as string);
	}
);
</script>

<template>
	<div class="yt-view">
		<!-- Loading -->
		<div v-if="loading" class="yt-loading">
			<div class="yt-spinner"></div>
			<p class="yt-loading-source">
				{{ sourceName(route.query.url as string) }}
			</p>
			<p class="yt-loading-msg">{{ loadingMsg }}</p>
		</div>

		<!-- Error -->
		<div v-else-if="error" class="yt-error">
			<i class="material-icons">error_outline</i>
			<p>{{ error }}</p>
		</div>

		<!-- Video -->
		<template v-else-if="info && info.type === 'video'">
			<div
				class="yt-source-badge"
				:style="{ background: sourceColor(info.url) }"
			>
				{{ sourceName(info.url) }} · Track
			</div>
			<div class="yt-video-card">
				<div class="yt-thumb-wrap">
					<img
						v-if="info.thumbnail"
						:src="info.thumbnail"
						class="yt-thumb-img"
					/>
					<div v-else class="yt-thumb-empty">
						<i class="material-icons">music_note</i>
					</div>
					<span v-if="info.duration" class="yt-duration">{{
						formatDuration(info.duration)
					}}</span>
				</div>
				<div class="yt-video-body">
					<h1 class="yt-title">{{ info.title }}</h1>
					<p class="yt-uploader">{{ info.uploader }}</p>
					<button
						class="yt-dl-btn"
						@click="
							downloadVideo(
								info.url,
								info.title,
								info.uploader,
								info.thumbnail ?? undefined
							)
						"
					>
						<i class="material-icons">download</i>
						Download MP3 · 320kbps
					</button>
				</div>
			</div>
		</template>

		<!-- Playlist -->
		<template v-else-if="info && info.type === 'playlist'">
			<div
				class="yt-source-badge"
				:style="{ background: sourceColor(route.query.url as string) }"
			>
				{{ sourceName(route.query.url as string) }} · Playlist
			</div>
			<div class="yt-playlist-header">
				<img
					v-if="info.thumbnail"
					:src="info.thumbnail"
					class="yt-playlist-thumb"
				/>
				<div v-else class="yt-playlist-thumb-empty">
					<i class="material-icons">queue_music</i>
				</div>
				<div class="yt-playlist-meta">
					<h1 class="yt-title">{{ info.title }}</h1>
					<p class="yt-uploader">{{ info.uploader }}</p>
					<div class="yt-playlist-stats">
						<span class="yt-stat-pill">{{ info.count }} tracks</span>
					</div>
					<button class="yt-dl-btn" @click="downloadAll()">
						<i class="material-icons">download</i>
						Download all as MP3
					</button>
				</div>
			</div>

			<div class="yt-tracklist">
				<div class="yt-tracklist-header">Tracks</div>
				<div
					v-for="(entry, i) in info.entries"
					:key="entry.id"
					class="yt-track"
				>
					<span class="yt-track-num">{{ i + 1 }}</span>
					<span class="yt-track-title">{{ entry.title }}</span>
					<span v-if="entry.duration" class="yt-track-dur">{{
						formatDuration(entry.duration)
					}}</span>
					<button
						class="yt-track-dl"
						title="Download this track"
						@click="
							downloadVideo(
								entry.url,
								entry.title,
								info.uploader,
								info.thumbnail ?? undefined,
								info.title
							)
						"
					>
						<i class="material-icons">download</i>
					</button>
				</div>
			</div>
		</template>
	</div>
</template>

<style scoped>
.yt-view {
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
	max-width: 760px;
	padding-bottom: 3rem;
}

/* Source badge */
.yt-source-badge {
	display: inline-flex;
	align-items: center;
	width: fit-content;
	padding: 3px 10px;
	border-radius: 99px;
	font-size: 0.7rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: #fff;
}

/* Loading */
.yt-loading {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 0.75rem;
	padding: 3rem 0;
}
.yt-spinner {
	width: 36px;
	height: 36px;
	border: 3px solid rgba(255, 255, 255, 0.12);
	border-top-color: #ff4444;
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
}
@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
.yt-loading-source {
	font-size: 0.7rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.1em;
	opacity: 0.5;
}
.yt-loading-msg {
	font-size: 1rem;
	opacity: 0.6;
}

/* Error */
.yt-error {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 2rem 0;
	opacity: 0.5;
}
.yt-error .material-icons {
	font-size: 32px;
}

/* Video card */
.yt-video-card {
	display: flex;
	flex-direction: column;
	gap: 1.25rem;
	max-width: 480px;
}
.yt-thumb-wrap {
	position: relative;
	width: 100%;
	aspect-ratio: 16/9;
	border-radius: 12px;
	overflow: hidden;
	background: rgba(255, 255, 255, 0.05);
}
.yt-thumb-img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.yt-thumb-empty {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 3rem;
	opacity: 0.15;
}
.yt-duration {
	position: absolute;
	bottom: 8px;
	right: 8px;
	background: rgba(0, 0, 0, 0.78);
	color: #fff;
	font-size: 0.72rem;
	font-weight: 600;
	padding: 2px 6px;
	border-radius: 4px;
}
.yt-video-body {
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
}

/* Playlist header */
.yt-playlist-header {
	display: flex;
	gap: 1.5rem;
	align-items: flex-start;
}
.yt-playlist-thumb {
	width: 140px;
	height: 140px;
	object-fit: cover;
	border-radius: 10px;
	flex-shrink: 0;
}
.yt-playlist-thumb-empty {
	width: 140px;
	height: 140px;
	border-radius: 10px;
	background: rgba(255, 255, 255, 0.05);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 2.5rem;
	opacity: 0.2;
	flex-shrink: 0;
}
.yt-playlist-meta {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}
.yt-playlist-stats {
	display: flex;
	gap: 0.5rem;
}
.yt-stat-pill {
	padding: 3px 10px;
	border-radius: 99px;
	background: rgba(255, 255, 255, 0.08);
	font-size: 0.78rem;
	font-weight: 600;
}

/* Shared */
.yt-title {
	font-size: 1.25rem;
	font-weight: 700;
	line-height: 1.3;
}
.yt-uploader {
	font-size: 0.85rem;
	opacity: 0.45;
}
.yt-dl-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-top: 0.5rem;
	padding: 10px 20px;
	background: #ff4444;
	color: #fff;
	border: none;
	border-radius: 8px;
	font-size: 0.88rem;
	font-weight: 600;
	cursor: pointer;
	width: fit-content;
	transition:
		opacity 0.15s,
		transform 0.1s;
}
.yt-dl-btn:hover {
	opacity: 0.85;
	transform: translateY(-1px);
}
.yt-dl-btn:active {
	transform: none;
}
.yt-dl-btn .material-icons {
	font-size: 17px;
}

/* Tracklist */
.yt-tracklist {
	display: flex;
	flex-direction: column;
}
.yt-tracklist-header {
	font-size: 0.7rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.1em;
	opacity: 0.35;
	padding: 0 0 0.5rem;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	margin-bottom: 0.25rem;
}
.yt-track {
	display: grid;
	grid-template-columns: 2rem 1fr auto auto;
	align-items: center;
	gap: 0.5rem;
	padding: 0.45rem 0.25rem;
	border-radius: 6px;
	transition: background 0.1s;
}
.yt-track:hover {
	background: rgba(255, 255, 255, 0.04);
}
.yt-track-num {
	font-size: 0.78rem;
	opacity: 0.3;
	text-align: right;
}
.yt-track-title {
	font-size: 0.88rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.yt-track-dur {
	font-size: 0.78rem;
	opacity: 0.35;
	font-variant-numeric: tabular-nums;
}
.yt-track-dl {
	background: none;
	border: none;
	cursor: pointer;
	color: inherit;
	opacity: 0;
	padding: 2px;
	border-radius: 4px;
	transition: opacity 0.15s;
}
.yt-track:hover .yt-track-dl {
	opacity: 0.6;
}
.yt-track-dl:hover {
	opacity: 1 !important;
}
.yt-track-dl .material-icons {
	font-size: 17px;
}
</style>
