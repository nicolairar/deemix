<script setup lang="ts">
import { pinia } from "@/stores";
import { useAppInfoStore } from "@/stores/appInfo";
import { useOnline } from "@/use/online";
import { useI18n } from "vue-i18n";

const appInfo = useAppInfoStore(pinia);
const { isOnline } = useOnline();
const { t } = useI18n();
</script>

<template>
	<div class="mb-8 flex flex-col items-start gap-6">
		<div class="fork-header">
			<span class="fork-badge">Unofficial Fork</span>
			<h1 class="text-5xl capitalize">Deemix Pro</h1>
			<p class="fork-tagline">
				An unofficial fork of
				<a href="https://github.com/bambanah/deemix" target="_blank">deemix</a>
				by <strong>bambanah</strong>, kept alive and extended with an
				<strong>Apple Music plugin</strong> so you can download tracks by ISRC
				matching. Auto-updates enabled.
			</p>
		</div>

		<div
			class="inline-flex rounded-full px-4 py-2"
			:class="{ 'bg-green-500': isOnline, 'bg-red-500': !isOnline }"
		>
			<span class="uppercase-first-letter text-sm">
				{{ t(`about.appStatus.${isOnline ? "online" : "offline"}`) }}
			</span>
		</div>

		<div class="versions">
			<p v-if="appInfo.guiVersion">
				App version:
				<code>{{ appInfo.guiVersion }}</code>
			</p>
			<p>
				{{ t("about.updates.currentWebuiVersion") }}:
				<code>{{
					appInfo.webuiVersion || t("about.updates.versionNotAvailable")
				}}</code>
			</p>
			<p>
				{{ t("about.updates.deemixVersion") }}:
				<code>{{ appInfo.deemixVersion }}</code>
			</p>
		</div>

		<div>
			<h2 class="section-title">Links</h2>
			<div class="link-grid">
				<a
					href="https://github.com/nicolairar/deemix"
					target="_blank"
					class="link-card"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						height="18"
						viewBox="0 0 16 16"
						width="18"
						aria-hidden="true"
					>
						<path
							fill="currentColor"
							d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
						></path>
					</svg>
					<span>
						<strong>Source &amp; Issues</strong>
						<small>github.com/nicolairar/deemix</small>
					</span>
				</a>
				<a
					href="https://github.com/nicolairar/deemix/releases"
					target="_blank"
					class="link-card"
				>
					<i class="material-icons" style="font-size: 18px">download</i>
					<span>
						<strong>Releases</strong>
						<small>Download latest builds</small>
					</span>
				</a>
				<a
					href="https://github.com/nicolairar/deemix/fork"
					target="_blank"
					class="link-card"
				>
					<i class="material-icons" style="font-size: 18px">fork_right</i>
					<span>
						<strong>Fork &amp; Contribute</strong>
						<small>PRs are welcome</small>
					</span>
				</a>
			</div>
		</div>

		<div class="upstream">
			<p>
				Original project:
				<a href="https://github.com/bambanah/deemix" target="_blank"
					>github.com/bambanah/deemix</a
				>
				· License: GPL-3.0
			</p>
		</div>

		<div>
			<h2 class="section-title">{{ t("about.titles.license") }}</h2>
			<p>
				<a
					rel="license"
					href="https://www.gnu.org/licenses/gpl-3.0.en.html"
					target="_blank"
				>
					<img
						alt="GNU General Public License"
						style="border-width: 0"
						src="https://www.gnu.org/graphics/gplv3-127x51.png"
					/>
				</a>
			</p>
			<i18n-t keypath="about.licencedUnder.text" tag="p">
				<template #gpl3>
					<a
						rel="license"
						href="https://www.gnu.org/licenses/gpl-3.0.en.html"
						target="_blank"
					>
						{{ t("about.licencedUnder.gpl3") }}
					</a>
				</template>
			</i18n-t>
		</div>
	</div>
</template>

<style scoped>
.fork-header {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.fork-badge {
	display: inline-block;
	background: rgba(108, 99, 255, 0.2);
	color: #a89dff;
	font-size: 0.7rem;
	font-weight: 600;
	padding: 2px 10px;
	border-radius: 99px;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	width: fit-content;
}

.fork-tagline {
	opacity: 0.7;
	line-height: 1.6;
	max-width: 520px;
}

.fork-tagline a {
	color: var(--primary-color, #cba6f7);
	text-decoration: underline;
}

.versions {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	font-size: 0.9rem;
}

.versions code {
	font-family: monospace;
	opacity: 0.75;
}

.section-title {
	font-size: 1.4rem;
	font-weight: 600;
	margin-bottom: 0.75rem;
}

.link-grid {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.link-card {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.75rem 1rem;
	border-radius: 8px;
	border: 1px solid rgba(255, 255, 255, 0.07);
	background: rgba(255, 255, 255, 0.03);
	color: var(--foreground);
	text-decoration: none;
	transition: background 0.15s;
}

.link-card:hover {
	background: rgba(255, 255, 255, 0.07);
}

.link-card span {
	display: flex;
	flex-direction: column;
	gap: 1px;
}

.link-card strong {
	font-size: 0.9rem;
}

.link-card small {
	font-size: 0.75rem;
	opacity: 0.5;
}

.upstream {
	font-size: 0.8rem;
	opacity: 0.45;
}

.upstream a {
	color: inherit;
	text-decoration: underline;
}
</style>
