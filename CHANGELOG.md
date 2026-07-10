# Changelog

All notable changes to Nested Vaults are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-07-09

### Changed
- The plugin now ships as a single hand-maintained `main.js` with no build
  step; the TypeScript toolchain has been removed.
- Auto-moving new notes into the Sub-Vault is now an opt-in setting
  (**Auto-move new notes into the Sub-Vault**, off by default). Moves go
  through `fileManager.renameFile`, so links to the moved note are updated.
- The Search/Graph `path:` filter is now controlled by a setting (**Scope
  Search and Graph to the Sub-Vault**, on by default), is applied once
  instead of continuously re-enforced, and is cleanly removed from the query
  inputs when you leave the Sub-Vault.
- Blocked files outside the Sub-Vault now turn their tab into an empty tab
  instead of detaching the pane.
- Scoping refreshes are debounced and driven by targeted pane observers and
  vault/metadata events instead of a 500 ms polling interval.

### Fixed
- Nested tags (`#a/b/c`) are matched by their full path in the tag pane, so
  unrelated tags that share a leaf name are no longer shown or hidden by
  mistake.
- Ancestor folders of globally allowed folders stay visible in the file
  explorer so allowed items remain reachable.
- Renaming a parent folder of the active Sub-Vault updates the stored path
  correctly in all cases.
- Corrupted saved settings fall back to defaults with a notice instead of
  breaking the plugin at startup.

## [1.0.2] - 2026-06-25

### Fixed
- Obsidian community-plugin lint warnings.

## [1.0.1] - 2026-06-25

### Changed
- Plugin ID renamed to `nested-vaults`.

## [1.0.0] - 2026-06-20

### Added
- Initial release: scope the file explorer, search, graph, tags, and
  backlinks to a chosen folder; global allowed folders; scoped quick
  switcher; status-bar indicator and ribbon action.
