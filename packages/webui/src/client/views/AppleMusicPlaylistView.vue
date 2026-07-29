<script setup lang="ts">
import { sendAddToQueue } from "@/utils/downloads";
import { fetchData } from "@/utils/api-utils";
import { useRoute, useRouter } from "vue-router";
import { onMounted, onUnmounted, ref, computed, watch } from "vue";

interface Track {
	position: number;
	name: string;
	artist: string;
	album: string;
	isrc?: string;
	artworkUrl?: string;
	selected: boolean;
}

const route = useRoute();
const router = useRouter();

const title = ref("");
const curator = ref("");
const artworkUrl = ref("");
const originalUrl = ref("");
const tracks = ref<Track[]>([]);
const error = ref<string | null>(null);
const isLoading = ref(true);

const loadingMessages = [
	"Connecting to Apple Music…",
	"Fetching your songs…",
	"Ordering tracks…",
	"Downloading artworks…",
	"Almost there…",
];
const loadingMsgIndex = ref(0);
let loadingInterval: ReturnType<typeof setInterval> | null = null;

function startLoadingMessages() {
	loadingMsgIndex.value = 0;
	loadingInterval = setInterval(() => {
		loadingMsgIndex.value =
			(loadingMsgIndex.value + 1) % loadingMessages.length;
	}, 1800);
}

function stopLoadingMessages() {
	if (loadingInterval) {
		clearInterval(loadingInterval);
		loadingInterval = null;
	}
}

// Pick a random track artwork for the header background
const headerArtwork = computed(() => {
	const withArt = tracks.value.filter((t) => t.artworkUrl);
	if (withArt.length === 0) return artworkUrl.value;
	return withArt[Math.floor(Math.random() * withArt.length)].artworkUrl!;
});

const allSelected = computed(() => tracks.value.every((t) => t.selected));
const selectedCount = computed(
	() => tracks.value.filter((t) => t.selected).length
);

function toggleAll(e: Event) {
	const checked = (e.target as HTMLInputElement).checked;
	tracks.value.forEach((t) => (t.selected = checked));
}

function selectedLinks() {
	const sel = tracks.value.filter((t) => t.selected);
	if (sel.length === tracks.value.length) return originalUrl.value;
	return sel
		.filter((t) => t.isrc)
		.map((t) => `https://www.deezer.com/track/isrc:${t.isrc}`)
		.join(";");
}

function download(link: string) {
	if (!link) return;
	sendAddToQueue(link);
	router.back();
}

async function loadPlaylist(url: string) {
	title.value = "";
	curator.value = "";
	artworkUrl.value = "";
	tracks.value = [];
	error.value = null;
	isLoading.value = true;
	originalUrl.value = url;
	startLoadingMessages();

	try {
		const data = await fetchData("appleMusicPreview", { url });
		if (data?.error) throw new Error(data.error);
		if (!Array.isArray(data?.tracks))
			throw new Error("Invalid server response");

		title.value = data.title;
		curator.value = data.curator;
		artworkUrl.value = data.artworkUrl;
		tracks.value = data.tracks.map((t: any) => ({ ...t, selected: true }));
	} catch (e: any) {
		error.value = e?.message ?? "Failed to load playlist";
	} finally {
		stopLoadingMessages();
		isLoading.value = false;
	}
}

onMounted(() => {
	const url = route.query.url as string;
	if (!url) {
		error.value = "Missing URL";
		isLoading.value = false;
		return;
	}
	loadPlaylist(url);
});

watch(
	() => route.query.url,
	(url) => {
		if (url && route.name === "Apple Music Playlist")
			loadPlaylist(url as string);
	}
);

onUnmounted(() => {
	stopLoadingMessages();
});
</script>

<template>
	<div class="fixed-footer bg-background-main image-header relative">
		<!-- Loading -->
		<header
			v-if="isLoading"
			:style="{
				'background-image':
					'linear-gradient(to bottom, transparent 0%, var(--main-background) 100%)',
			}"
		>
			<p class="loading-eyebrow">Apple Music</p>
			<h1 class="loading-msg m-0 text-5xl">
				{{ loadingMessages[loadingMsgIndex] }}
			</h1>
			<div class="loading-dots"><span></span><span></span><span></span></div>
		</header>

		<!-- Error -->
		<header
			v-else-if="error"
			:style="{
				'background-image':
					'linear-gradient(to bottom, transparent 0%, var(--main-background) 100%)',
			}"
		>
			<h1 class="m-0 text-5xl">Error</h1>
			<h2 class="m-0 mb-3 text-lg">{{ error }}</h2>
		</header>

		<!-- Content -->
		<template v-else>
			<header
				:style="{
					'background-image':
						'linear-gradient(to bottom, transparent 0%, var(--main-background) 100%), url(\'' +
						headerArtwork +
						'\')',
				}"
			>
				<h1 class="m-0 flex items-center text-5xl">{{ title }}</h1>
				<h2 class="m-0 mb-3 text-lg">
					<p v-if="curator">{{ curator }}</p>
					<p>{{ tracks.length }} tracks • Apple Music</p>
				</h2>
			</header>

			<table class="table--tracklist table">
				<thead>
					<tr>
						<th></th>
						<th>#</th>
						<th>Title</th>
						<th>Artist</th>
						<th>Album</th>
						<th class="table__icon table__cell--center cursor-pointer">
							<input
								class="selectAll"
								type="checkbox"
								:checked="allSelected"
								@click="toggleAll"
							/>
						</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="track in tracks"
						:key="track.position"
						@click="track.selected = !track.selected"
					>
						<td class="table__cell--x-small table__cell--center">
							<img
								v-if="track.artworkUrl"
								:src="track.artworkUrl"
								class="track-artwork"
								alt=""
							/>
							<i v-else class="material-icons" style="opacity: 0.3"
								>music_note</i
							>
						</td>
						<td class="table__cell--small table__cell--center track_position">
							{{ track.position }}
						</td>
						<td class="table__cell--large">{{ track.name }}</td>
						<td class="table__cell--medium table__cell--center">
							{{ track.artist }}
						</td>
						<td class="table__cell--medium table__cell--center">
							{{ track.album }}
						</td>
						<td class="table__icon table__cell--center">
							<input
								v-model="track.selected"
								class="cursor-pointer"
								type="checkbox"
								@click.stop
							/>
						</td>
					</tr>
				</tbody>
			</table>

			<footer class="bg-background-main">
				<button
					class="btn btn-primary mr-2"
					@click.stop="download(originalUrl)"
				>
					Download playlist
				</button>
				<button
					class="btn btn-primary flex items-center"
					:disabled="selectedCount === 0"
					@click.stop="download(selectedLinks())"
				>
					Download selection ({{ selectedCount }})
					<i class="material-icons ml-2">file_download</i>
				</button>
			</footer>
		</template>
	</div>
</template>

<style scoped>
.track-artwork {
	width: 36px;
	height: 36px;
	border-radius: 4px;
	object-fit: cover;
	display: block;
}

.loading-eyebrow {
	margin: 0 0 8px;
	font-size: 0.85rem;
	text-transform: uppercase;
	letter-spacing: 0.12em;
	opacity: 0.5;
}

.loading-msg {
	transition: opacity 0.4s ease;
	animation: fadeMsg 1.8s ease infinite;
}

@keyframes fadeMsg {
	0% {
		opacity: 1;
	}
	80% {
		opacity: 1;
	}
	90% {
		opacity: 0.3;
	}
	100% {
		opacity: 1;
	}
}

.loading-dots {
	display: flex;
	gap: 6px;
	margin-top: 20px;
}

.loading-dots span {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: currentColor;
	opacity: 0.4;
	animation: dot-bounce 1.2s ease-in-out infinite;
}

.loading-dots span:nth-child(2) {
	animation-delay: 0.2s;
}
.loading-dots span:nth-child(3) {
	animation-delay: 0.4s;
}

@keyframes dot-bounce {
	0%,
	100% {
		transform: translateY(0);
		opacity: 0.4;
	}
	50% {
		transform: translateY(-6px);
		opacity: 1;
	}
}
</style>
