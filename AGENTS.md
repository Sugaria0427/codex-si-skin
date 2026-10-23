# Contributor and agent rules

- Keep all tests isolated from a user's Codex. Never close, restart, reload, navigate, or replace an active user profile as part of installation or tests.
- `src/` owns startup policy, local persistence and appearance injection. `vendor/` contains attributed upstream validation modules; do not silently replace these files or remove notices.
- Existing drafts, themes and artwork belong to users. Upgrades must preserve them, detect a running helper, and back up replaced program files. Do not suppress corrupt state by resetting it.
- Keep every runtime CDP endpoint on loopback; validate process/browser/page identity and restrict injection to main Codex app pages. Never inject webviews, external websites, local files or avatar overlays.
- Use synthetic images, profiles and identities for tests. Public artifacts must never include user runtime directories, credentials, artwork without a redistribution license, or official app binaries/icons.
- `package.json` owns release versions. The build stamps renderer/backend cache markers into distributable copies; timestamp markers in working sources are implementation identifiers.
- Run `npm test`, `npm run test:ui`, `npm run build`, `npm run audit:release` and the isolated installer test for startup/persistence/distribution changes. `npm test` is the minimum for localized code changes.
- Do not publish to a remote repository, create releases, push tags, or send external messages without direct human authorization.
