<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { emitter } from "@/utils/emitter";
import { fetchData } from "@/utils/api-utils";
import { sendAddToQueue } from "@/utils/downloads";
import { toast } from "@/utils/toasts";

interface PreviewTrack {
	position: number;
	name: string;
	artist: string;
	album: string;
	isrc?: string;
}

interface PlaylistPreview {
	title: string;
	curator: string;
	artworkUrl: string;
	tracks: PreviewTrack[];
}

const open = ref(false);
const isLoading = ref(false);
const error = ref<string | null>(null);
const originalUrl = ref("");
const playlist = ref<PlaylistPreview | null>(null);
const selectedIndices = ref<Set<number>>(new Set());

const selectedCount = computed(() => selectedIndices.value.size);

function toggleTrack(i: number) {
	if (selectedIndices.value.has(i)) {
		selectedIndices.value.delete(i);
	} else {
		selectedIndices.value.add(i);
	}
	// trigger reactivity
	selectedIndices.value = new Set(selectedIndices.value);
}

function selectAll() {
	if (!playlist.value) return;
	selectedIndices.value = new Set(playlist.value.tracks.map((_, i) => i));
}

function selectNone() {
	selectedIndices.value = new Set();
}

async function openModal(url: string) {
	originalUrl.value = url;
	playlist.value = null;
	error.value = null;
	isLoading.value = true;
	open.value = true;

	try {
		const data = await fetchData("appleMusicPreview", { url });
		if (data?.error) throw new Error(data.error);
		if (!Array.isArray(data?.tracks))
			throw new Error("Risposta non valida dal server");
		playlist.value = data;
		selectedIndices.value = new Set(data.tracks.map((_: any, i: number) => i));
	} catch (e: any) {
		error.value = e?.message ?? "Failed to fetch playlist";
	} finally {
		isLoading.value = false;
	}
}

function closeModal() {
	open.value = false;
}

function download() {
	if (!playlist.value) return;
	const tracks = playlist.value.tracks;
	const nSelected = selectedIndices.value.size;

	if (nSelected === 0) return;

	let urlToQueue: string;
	if (nSelected === tracks.length) {
		urlToQueue = originalUrl.value;
	} else {
		const urls = [...selectedIndices.value]
			.sort((a, b) => a - b)
			.map((i) => tracks[i])
			.filter((t) => t.isrc)
			.map((t) => `https://www.deezer.com/track/isrc:${t.isrc}`)
			.join(" ");
		urlToQueue = urls || originalUrl.value;
	}

	toast(
		`Adding ${nSelected} track${nSelected !== 1 ? "s" : ""} to queue…`,
		"loading",
		false,
		"apple_dl"
	);
	sendAddToQueue(urlToQueue);
	closeModal();
}

onMounted(() => {
	emitter.on("AppleMusicPreview:open", openModal);
});
onUnmounted(() => {
	emitter.off("AppleMusicPreview:open", openModal);
});
</script>

<template>
	<div v-show="open" class="apple-music-modal-overlay" @click.self="closeModal">
		<div class="apple-music-modal">
			<!-- Loading -->
			<div v-if="isLoading" class="modal-loading">
				<div class="circle-loader"></div>
				<p>Fetching Apple Music playlist…</p>
			</div>

			<!-- Error -->
			<div v-else-if="error" class="modal-error">
				<i class="material-icons">error</i>
				<p>{{ error }}</p>
				<button @click="closeModal">Close</button>
			</div>

			<!-- Content -->
			<template v-else-if="playlist">
				<!-- Header -->
				<div class="modal-header">
					<img
						v-if="playlist.artworkUrl"
						:src="playlist.artworkUrl"
						alt="artwork"
						class="modal-artwork"
					/>
					<div>
						<h2 class="modal-title">{{ playlist.title }}</h2>
						<p v-if="playlist.curator" class="modal-curator">
							{{ playlist.curator }}
						</p>
					</div>
					<button class="modal-close" @click="closeModal">
						<i class="material-icons">close</i>
					</button>
				</div>

				<!-- Controls -->
				<div class="modal-controls">
					<button @click="selectAll">Select All</button>
					<button @click="selectNone">Select None</button>
					<span class="modal-count"
						>{{ selectedCount }} / {{ playlist.tracks.length }} selected</span
					>
				</div>

				<!-- Track list -->
				<ul class="modal-tracklist">
					<li
						v-for="(track, i) in playlist.tracks"
						:key="i"
						class="modal-track"
						@click="toggleTrack(i)"
					>
						<input
							type="checkbox"
							:checked="selectedIndices.has(i)"
							@click.stop="toggleTrack(i)"
						/>
						<span class="track-num">{{ track.position }}.</span>
						<span class="track-info">
							<span class="track-name">{{ track.name }}</span>
							<span class="track-artist">{{ track.artist }}</span>
						</span>
					</li>
				</ul>

				<!-- Footer -->
				<div class="modal-footer">
					<button class="btn-cancel" @click="closeModal">Cancel</button>
					<button
						class="btn-download"
						:disabled="selectedCount === 0"
						@click="download"
					>
						Download {{ selectedCount }} track{{
							selectedCount !== 1 ? "s" : ""
						}}
					</button>
				</div>
			</template>
		</div>
	</div>
</template>

<style scoped>
.apple-music-modal-overlay {
	position: fixed;
	inset: 0;
	z-index: 1300;
	background: rgba(0, 0, 0, 0.6);
	display: flex;
	align-items: center;
	justify-content: center;
	animation: fadeIn 0.15s ease;
}
.apple-music-modal {
	background: var(--panels-bg, #1e1e2e);
	color: var(--foreground, #cdd6f4);
	border-radius: 12px;
	width: 520px;
	max-width: 95vw;
	max-height: 80vh;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
.modal-loading,
.modal-error {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 2rem;
	gap: 1rem;
}
.modal-header {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 1rem 1rem 0.75rem;
	border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.modal-artwork {
	width: 56px;
	height: 56px;
	border-radius: 6px;
	object-fit: cover;
	flex-shrink: 0;
}
.modal-title {
	font-size: 1.1rem;
	font-weight: 600;
	margin: 0;
}
.modal-curator {
	font-size: 0.85rem;
	opacity: 0.6;
	margin: 0.2rem 0 0;
}
.modal-close {
	margin-left: auto;
	background: none;
	border: none;
	cursor: pointer;
	color: var(--foreground);
	opacity: 0.6;
	padding: 0.25rem;
}
.modal-close:hover {
	opacity: 1;
}
.modal-controls {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 1rem;
	font-size: 0.85rem;
	border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.modal-controls button {
	background: rgba(255, 255, 255, 0.08);
	border: none;
	border-radius: 4px;
	padding: 0.2rem 0.6rem;
	color: var(--foreground);
	cursor: pointer;
	font-size: 0.8rem;
}
.modal-controls button:hover {
	background: rgba(255, 255, 255, 0.15);
}
.modal-count {
	margin-left: auto;
	opacity: 0.5;
}
.modal-tracklist {
	list-style: none;
	margin: 0;
	padding: 0.25rem 0;
	overflow-y: auto;
	flex: 1;
}
.modal-track {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	padding: 0.4rem 1rem;
	cursor: pointer;
	transition: background 0.1s;
}
.modal-track:hover {
	background: rgba(255, 255, 255, 0.05);
}
.modal-track input[type="checkbox"] {
	cursor: pointer;
	flex-shrink: 0;
}
.track-num {
	opacity: 0.4;
	font-size: 0.8rem;
	min-width: 1.8rem;
	text-align: right;
}
.track-info {
	display: flex;
	flex-direction: column;
	overflow: hidden;
}
.track-name {
	font-size: 0.9rem;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.track-artist {
	font-size: 0.78rem;
	opacity: 0.55;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.modal-footer {
	display: flex;
	gap: 0.75rem;
	padding: 0.75rem 1rem;
	border-top: 1px solid rgba(255, 255, 255, 0.1);
	justify-content: flex-end;
}
.btn-cancel {
	background: rgba(255, 255, 255, 0.08);
	border: none;
	border-radius: 6px;
	padding: 0.5rem 1.2rem;
	color: var(--foreground);
	cursor: pointer;
}
.btn-cancel:hover {
	background: rgba(255, 255, 255, 0.15);
}
.btn-download {
	background: var(--primary-color, #cba6f7);
	color: var(--primary-text, #1e1e2e);
	border: none;
	border-radius: 6px;
	padding: 0.5rem 1.2rem;
	font-weight: 600;
	cursor: pointer;
}
.btn-download:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}
.btn-download:not(:disabled):hover {
	filter: brightness(1.1);
}
@keyframes fadeIn {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}
</style>
