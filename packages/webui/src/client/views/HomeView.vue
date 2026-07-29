<script setup lang="ts">
import CoverContainer from "@/components/globals/CoverContainer.vue";
import { getHomeData } from "@/data/home";
import { pinia } from "@/stores";
import { useLoginStore } from "@/stores/login";
import { sendAddToQueue } from "@/utils/downloads";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

const loginStore = useLoginStore(pinia);

const { t } = useI18n();

const playlists = ref([]);
const albums = ref([]);

const isLoggedIn = computed(() => loginStore.isLoggedIn);

function addToQueue(e) {
	sendAddToQueue(e.currentTarget.dataset.link);
}
function initHome(data) {
	const {
		playlists: { data: playlistData },
		albums: { data: albumData },
	} = data;

	playlists.value = playlistData;
	albums.value = albumData;
}

onMounted(async () => {
	const homeData = await getHomeData();

	initHome(homeData);
});
</script>

<template>
	<div id="home_tab">
		<h1 class="mb-4 text-5xl">{{ t("globals.welcome") }}</h1>
		<p class="home-tagline">
			Paste a link below to download music from any source.
		</p>

		<div class="source-chips">
			<span class="source-chip chip-deezer">🎵 Deezer</span>
			<span class="source-chip chip-yt">▶ YouTube</span>
			<span class="source-chip chip-sc">☁ SoundCloud</span>
			<span class="source-chip chip-am">🍎 Apple Music</span>
			<span class="source-chip chip-sp">🎧 Spotify</span>
		</div>

		<section
			v-if="!isLoggedIn"
			ref="notLogged"
			class="border-grayscale-500 border-0 border-t border-solid py-6"
		>
			<p id="home_not_logged_text" class="mb-4">{{ t("home.needTologin") }}</p>
			<router-link
				v-slot="{ navigate }"
				custom
				name="button"
				:to="{ name: 'Settings' }"
			>
				<button
					role="link"
					class="btn btn-primary"
					@click="navigate"
					@keypress.enter="() => navigate()"
				>
					{{ t("home.openSettings") }}
				</button>
			</router-link>
		</section>

		<section
			v-if="playlists.length"
			class="border-grayscale-500 border-0 border-t border-solid py-6"
		>
			<h2 class="mb-6 text-3xl">{{ t("home.sections.popularPlaylists") }}</h2>
			<div class="release-grid">
				<router-link
					v-for="release in playlists"
					:key="release.id"
					v-slot="{ navigate }"
					custom
					:to="{ name: 'Playlist', params: { id: release.id } }"
					tabindex="0"
					@keyup.enter="
						$router.push({ name: 'Playlist', params: { id: release.id } })
					"
				>
					<div
						role="link"
						class="release cursor-pointer"
						@click="navigate"
						@keypress.enter="() => navigate()"
					>
						<CoverContainer
							is-rounded
							:cover="release.picture_medium"
							:link="release.link"
							@click.stop="addToQueue"
						/>
						<p class="primary-text">{{ release.title }}</p>
						<p class="secondary-text">
							{{
								`${t("globals.by", { artist: release.user.name })} - ${t(
									"globals.listTabs.trackN",
									release.nb_tracks
								)}`
							}}
						</p>
					</div>
				</router-link>
			</div>
		</section>

		<section
			v-if="albums.length"
			class="border-grayscale-500 border-0 border-t border-solid py-6"
		>
			<h2 class="mb-6 text-3xl">{{ t("home.sections.popularAlbums") }}</h2>
			<div class="release-grid">
				<router-link
					v-for="release in albums"
					:key="release.id"
					v-slot="{ navigate }"
					custom
					:to="{ name: 'Album', params: { id: release.id } }"
					:data-id="release.id"
					tabindex="0"
					@keyup.enter="
						$router.push({ name: 'Album', params: { id: release.id } })
					"
				>
					<div
						role="link"
						class="release cursor-pointer"
						@click="navigate"
						@keypress.enter="() => navigate()"
					>
						<CoverContainer
							is-rounded
							:cover="release.cover_medium"
							:link="release.link"
							@click.stop="addToQueue"
						/>
						<p class="primary-text">{{ release.title }}</p>
						<p class="secondary-text">
							{{ `${t("globals.by", { artist: release.artist.name })}` }}
						</p>
					</div>
				</router-link>
			</div>
		</section>
	</div>
</template>

<style scoped>
.home-tagline {
	opacity: 0.5;
	font-size: 0.95rem;
	margin-bottom: 1.25rem;
}

.source-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	margin-bottom: 2rem;
}

.source-chip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 12px;
	border-radius: 99px;
	font-size: 0.8rem;
	font-weight: 600;
	opacity: 0.85;
}

.chip-deezer {
	background: rgba(255, 120, 0, 0.15);
	color: #ff9944;
}
.chip-yt {
	background: rgba(255, 0, 0, 0.15);
	color: #ff5555;
}
.chip-sc {
	background: rgba(255, 85, 0, 0.15);
	color: #ff7733;
}
.chip-am {
	background: rgba(252, 60, 70, 0.15);
	color: #fc5a60;
}
.chip-sp {
	background: rgba(29, 185, 84, 0.15);
	color: #1db954;
}
</style>
