# deemix — Unofficial Fork with Apple Music

> An unofficial fork of [bambanah/deemix](https://github.com/bambanah/deemix), which itself revived the original project by [RemixDev](https://gitlab.com/RemixDev).
> Maintained by [@nicolairar](https://github.com/nicolairar) to keep the tool alive and add Apple Music support.

---

## What's different in this fork

- **Apple Music plugin** — paste any Apple Music playlist URL and deemix finds and downloads the tracks via Deezer (ISRC matching)
- **In-app playlist preview** — see the full tracklist with artwork before downloading, select individual tracks
- **Auto-update** — the app checks GitHub Releases on startup and installs updates automatically with a guided wizard
- **Date-based versioning** — releases are tagged `yyyy.mm.dd` so it's always clear which build you're running

Everything else (Deezer downloads, settings, Docker, CLI) works exactly as in the upstream repo.

---

## Download

Get the latest macOS build from [Releases](https://github.com/nicolairar/deemix/releases).

Since the app isn't signed with an Apple Developer certificate, macOS may block it on first launch. If you see a "damaged" warning, run:

```bash
xattr -dr com.apple.quarantine /Applications/Deemix.app
```

---

## Apple Music setup

You need an [Apple Developer Program](https://developer.apple.com/programs/) account to generate a MusicKit key.

1. Go to [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers & Profiles → Keys
2. Create a new key, enable **MusicKit**
3. Download the `.p8` file
4. In the app → Settings → Apple Music, enter your **Team ID**, **Key ID**, and upload the `.p8` file

The guide is also available inside the app under Settings → Apple Music → _How to connect Apple Music_.

---

## Developing

Requires **Node.js 24** and **pnpm**.

```bash
# Install dependencies
pnpm i

# Start dev server (webui on port 6595 + electron)
pnpm dev
```

### Build & release

```bash
# Build all packages (version is auto-set to today's date)
pnpm turbo build

# Package the Electron app
cd packages/gui && pnpm exec electron-forge package

# Sign (ad-hoc, required on macOS)
codesign --deep --force --sign - out/Deemix-darwin-arm64/Deemix.app

# Create DMG
create-dmg --volname "deemix-nicolai" ... deemix-nicolai.dmg out/Deemix-darwin-arm64/

# For auto-update: also create a ZIP and latest-mac.yml, then upload all three to the GitHub release
```

---

## Contributing

Issues and PRs are welcome at [github.com/nicolairar/deemix](https://github.com/nicolairar/deemix).

If you're fixing something in the core downloader or webui, consider also contributing upstream to [bambanah/deemix](https://github.com/bambanah/deemix).

---

## Credits

- Original deemix: [RemixDev](https://gitlab.com/RemixDev)
- Revived & maintained as open source: [bambanah](https://github.com/bambanah)
- This fork: [nicolairar](https://github.com/nicolairar)

License: GPL-3.0
