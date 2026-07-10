/*
 * Nested Vaults
 *
 * This plugin ships as hand-maintained, readable JavaScript — there is no
 * build step. Obsidian loads this file directly as a CommonJS module.
 */

"use strict";

const {
	Plugin,
	PluginSettingTab,
	Setting,
	Notice,
	TFile,
	TFolder,
	SuggestModal,
	FuzzySuggestModal,
	AbstractInputSuggest,
	getAllTags,
} = require("obsidian");

const BODY_CLASS = "nested-vault-active";
const OUTSIDE_CLASS = "is-outside-subvault";

const DEFAULT_SETTINGS = {
	activeSubVault: "",
	globalAllowedFolders: ["Attachments", "Templates"],
	autoMoveNewNotes: false,
	enforceSearchScope: true,
};

/** Folder-path autocomplete for text inputs in the settings tab. */
class FolderSuggest extends AbstractInputSuggest {
	constructor(app, inputEl) {
		super(app, inputEl);
		this.textInputEl = inputEl;
	}

	getSuggestions(query) {
		const needle = query.toLowerCase();
		const folders = [];
		for (const file of this.app.vault.getAllLoadedFiles()) {
			if (file instanceof TFolder && file.path.toLowerCase().includes(needle)) {
				folders.push(file);
			}
		}
		return folders;
	}

	renderSuggestion(folder, el) {
		el.setText(folder.path);
	}

	selectSuggestion(folder) {
		this.textInputEl.value = folder.path;
		this.textInputEl.trigger("input");
		this.close();
	}
}

class NestedVaultsSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		let applyTimer = null;
		new Setting(containerEl)
			.setName("Active Sub-Vault")
			.setDesc("The path to the folder to act as your nested vault. Leave empty to clear.")
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl);
				text
					.setPlaceholder("e.g., Projects/MyProject")
					.setValue(this.plugin.settings.activeSubVault)
					.onChange((value) => {
						// Debounced so we don't save and re-scope on every keystroke.
						if (applyTimer !== null) window.clearTimeout(applyTimer);
						applyTimer = window.setTimeout(async () => {
							applyTimer = null;
							await this.plugin.setActiveSubVault(value);
						}, 400);
					});
			});

		new Setting(containerEl)
			.setName("Auto-move new notes into the Sub-Vault")
			.setDesc(
				"When enabled, a Markdown note created outside the active Sub-Vault (and outside the allowed folders below) is moved into the Sub-Vault automatically. Links to the note are updated when it moves."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoMoveNewNotes).onChange(async (value) => {
					this.plugin.settings.autoMoveNewNotes = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Scope Search and Graph to the Sub-Vault")
			.setDesc(
				'Adds a path:"<sub-vault>" filter to the core Search and Graph query inputs while a Sub-Vault is active. Your own filters are left untouched.'
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.enforceSearchScope).onChange(async (value) => {
					this.plugin.settings.enforceSearchScope = value;
					await this.plugin.saveSettings();
					if (value) {
						this.plugin.applySearchScope();
					} else {
						this.plugin.clearSearchScope();
					}
				})
			);

		new Setting(containerEl).setName("Global allowed folders").setHeading();
		containerEl.createEl("p", {
			text: "These folders will always remain visible and accessible, even when you are scoped inside a Sub-Vault. This is useful for global Attachment or Template folders.",
			cls: "setting-item-description",
		});

		let pendingFolder = "";
		new Setting(containerEl)
			.setName("Add global allowed folder")
			.setDesc("Select a folder to add to your whitelist.")
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl);
				text.setPlaceholder("Select folder...").onChange((value) => {
					pendingFolder = value;
				});
			})
			.addButton((button) => {
				button
					.setButtonText("Add")
					.setCta()
					.onClick(async () => {
						if (!pendingFolder) return;
						if (this.plugin.settings.globalAllowedFolders.includes(pendingFolder)) return;
						this.plugin.settings.globalAllowedFolders.push(pendingFolder);
						await this.plugin.saveSettings();
						this.display();
						this.plugin.refreshScoping();
					});
			});

		for (const folder of this.plugin.settings.globalAllowedFolders) {
			new Setting(containerEl).setName(folder).addButton((button) => {
				button
					.setIcon("trash")
					.setTooltip("Remove")
					.onClick(async () => {
						this.plugin.settings.globalAllowedFolders =
							this.plugin.settings.globalAllowedFolders.filter((f) => f !== folder);
						await this.plugin.saveSettings();
						this.display();
						this.plugin.refreshScoping();
					});
			});
		}
	}
}

class ScopedQuickSwitcher extends SuggestModal {
	constructor(app, plugin) {
		super(app);
		this.plugin = plugin;
		this.setPlaceholder("Search files in active sub-vault...");
	}

	getSuggestions(query) {
		const files = this.app.vault.getMarkdownFiles();
		const scope = this.plugin.settings.activeSubVault;
		const needle = query.toLowerCase();
		if (!scope) {
			return files.filter((f) => f.path.toLowerCase().includes(needle));
		}
		return files.filter((f) => {
			if (!f.path.startsWith(scope + "/")) return false;
			return f.path.substring(scope.length + 1).toLowerCase().includes(needle);
		});
	}

	renderSuggestion(file, el) {
		const scope = this.plugin.settings.activeSubVault;
		let displayPath = file.path;
		if (scope && file.path.startsWith(scope + "/")) {
			displayPath = file.path.substring(scope.length + 1);
		}
		el.createEl("div", { text: file.basename });
		el.createEl("small", { text: displayPath, cls: "navigation-item-url" });
	}

	onChooseSuggestion(file, evt) {
		void this.app.workspace.getLeaf(evt.ctrlKey || evt.metaKey).openFile(file);
	}
}

class SetSubVaultModal extends FuzzySuggestModal {
	constructor(app, plugin) {
		super(app);
		this.plugin = plugin;
		this.setPlaceholder("Select a folder to set as Active Sub-Vault...");
	}

	getItems() {
		const folders = [];
		for (const file of this.app.vault.getAllLoadedFiles()) {
			if (file instanceof TFolder && file.path !== "/") folders.push(file);
		}
		return folders;
	}

	getItemText(folder) {
		return folder.path;
	}

	async onChooseItem(folder) {
		await this.plugin.setActiveSubVault(folder.path);
		new Notice(`Active Sub-Vault set to: ${folder.path}`);
	}
}

class NestedVaultsPlugin extends Plugin {
	async onload() {
		this.statusBarEl = null;
		this.paneObservers = [];
		this.pendingMoveTimeouts = new Set();
		this.refreshTimer = null;
		this.allowedTagsCache = null;
		this.appliedSearchToken = null;

		await this.loadSettings();

		this.addSettingTab(new NestedVaultsSettingTab(this.app, this));

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.style.display = "none";
		this.statusBarEl.onClickEvent(async () => {
			if (!this.settings.activeSubVault) return;
			await this.setActiveSubVault("");
			new Notice("Left Sub-Vault. Returned to main vault.");
		});

		this.addRibbonIcon("log-out", "Leave Active Sub-Vault", async () => {
			if (this.settings.activeSubVault) {
				await this.setActiveSubVault("");
				new Notice("Left Sub-Vault. Returned to main vault.");
			} else {
				new Notice("You are not currently in a Sub-Vault.");
			}
		});

		this.addCommand({
			id: "open-scoped-quick-switcher",
			name: "Open Scoped Quick Switcher",
			callback: () => new ScopedQuickSwitcher(this.app, this).open(),
		});

		this.addCommand({
			id: "clear-active-sub-vault",
			name: "Clear Active Sub-Vault",
			callback: async () => {
				await this.setActiveSubVault("");
				new Notice("Sub-Vault cleared.");
			},
		});

		this.addCommand({
			id: "set-active-sub-vault",
			name: "Set Active Sub-Vault",
			callback: () => new SetSubVaultModal(this.app, this).open(),
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFolder)) return;
				menu.addItem((item) => {
					item
						.setTitle("Set as Active Sub-Vault")
						.setIcon("target")
						.onClick(async () => {
							await this.setActiveSubVault(file.path);
							new Notice(`Active Sub-Vault set to: ${file.path}`);
						});
				});
			})
		);

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (!this.settings.activeSubVault || !file) return;
				if (this.isPathAllowed(file.path)) return;
				new Notice("Blocked: That file is outside your active Sub-Vault.");
				const leaf = this.findLeafShowingFile(file.path);
				if (leaf) {
					// Turn the leaf into an empty tab rather than destroying the pane.
					leaf.setViewState({ type: "empty" }).catch((err) => {
						console.error("Nested Vaults: could not reset leaf", err);
					});
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", async (file, oldPath) => {
				let changed = false;
				if (this.settings.activeSubVault === oldPath) {
					this.settings.activeSubVault = file.path;
					changed = true;
					new Notice(`Active Sub-Vault renamed to: ${file.path}`);
				} else if (this.settings.activeSubVault.startsWith(oldPath + "/")) {
					this.settings.activeSubVault =
						file.path + this.settings.activeSubVault.slice(oldPath.length);
					changed = true;
				}
				const updated = this.settings.globalAllowedFolders.map((folder) => {
					if (folder === oldPath) {
						changed = true;
						return file.path;
					}
					if (folder.startsWith(oldPath + "/")) {
						changed = true;
						return file.path + folder.slice(oldPath.length);
					}
					return folder;
				});
				if (changed) {
					this.settings.globalAllowedFolders = updated;
					await this.saveSettings();
				}
				this.allowedTagsCache = null;
				this.requestScopeRefresh();
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", async (file) => {
				const scope = this.settings.activeSubVault;
				if (scope && (scope === file.path || scope.startsWith(file.path + "/"))) {
					await this.setActiveSubVault("");
					new Notice("Active Sub-Vault was deleted. Cleared sub-vault.");
				} else {
					this.allowedTagsCache = null;
					this.requestScopeRefresh();
				}
			})
		);

		// "create" also fires for every existing file while the vault is being
		// indexed at startup; the layoutReady guard keeps the auto-move from
		// processing that initial event storm and mass-moving files.
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (!this.app.workspace.layoutReady) return;
				this.maybeAutoMoveNewNote(file);
				this.requestScopeRefresh();
			})
		);

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				const scope = this.settings.activeSubVault;
				if (scope && file.path.startsWith(scope + "/")) {
					this.allowedTagsCache = null;
					this.requestScopeRefresh();
				}
			})
		);

		this.registerEvent(
			this.app.metadataCache.on("resolved", () => {
				this.allowedTagsCache = null;
				this.requestScopeRefresh();
			})
		);

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.attachPaneObservers();
				this.requestScopeRefresh();
			})
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.requestScopeRefresh();
			})
		);

		this.app.workspace.onLayoutReady(() => {
			this.applyVisualScoping();
			this.attachPaneObservers();
		});
	}

	onunload() {
		this.detachPaneObservers();
		for (const id of this.pendingMoveTimeouts) window.clearTimeout(id);
		this.pendingMoveTimeouts.clear();
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		this.clearVisualScoping();
	}

	async loadSettings() {
		let data = null;
		try {
			data = await this.loadData();
		} catch (err) {
			console.error("Nested Vaults: could not read saved settings; using defaults.", err);
			new Notice("Nested Vaults: saved settings could not be read; using defaults.");
		}
		// Migrate the legacy comma-separated string format.
		if (data && typeof data.globalAllowedFolders === "string") {
			data.globalAllowedFolders = data.globalAllowedFolders
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		if (!Array.isArray(this.settings.globalAllowedFolders)) {
			this.settings.globalAllowedFolders = [...DEFAULT_SETTINGS.globalAllowedFolders];
		}
		if (typeof this.settings.activeSubVault !== "string") {
			this.settings.activeSubVault = "";
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async setActiveSubVault(path) {
		this.clearSearchScope();
		this.settings.activeSubVault = path || "";
		this.allowedTagsCache = null;
		await this.saveSettings();
		this.applyVisualScoping();
	}

	isPathAllowed(path) {
		const scope = this.settings.activeSubVault;
		if (!scope) return true;
		if (path === scope || path.startsWith(scope + "/")) return true;
		for (const folder of this.settings.globalAllowedFolders || []) {
			if (folder && (path === folder || path.startsWith(folder + "/"))) return true;
		}
		return false;
	}

	maybeAutoMoveNewNote(file) {
		if (!this.settings.autoMoveNewNotes) return;
		if (!this.settings.activeSubVault) return;
		if (!(file instanceof TFile) || file.extension !== "md") return;
		if (this.isPathAllowed(file.path)) return;

		// Wait briefly so whatever created the file (templates, other plugins)
		// finishes with it before it is moved.
		const id = window.setTimeout(async () => {
			this.pendingMoveTimeouts.delete(id);
			try {
				if (!this.settings.autoMoveNewNotes || !this.settings.activeSubVault) return;
				if (this.isPathAllowed(file.path)) return;
				const scopeFolder = this.app.vault.getAbstractFileByPath(this.settings.activeSubVault);
				if (!(scopeFolder instanceof TFolder)) return;
				const targetPath = `${this.settings.activeSubVault}/${file.name}`;
				if (this.app.vault.getAbstractFileByPath(targetPath)) {
					new Notice(
						`Could not move "${file.name}" into the Sub-Vault: a file with that name already exists there.`
					);
					return;
				}
				// fileManager.renameFile updates links to the moved note.
				await this.app.fileManager.renameFile(file, targetPath);
				new Notice(`Moved new note into Sub-Vault: ${file.name}`);
			} catch (err) {
				console.error("Nested Vaults: could not move file", err);
				new Notice(`Could not move "${file.name}" into the Sub-Vault.`);
			}
		}, 100);
		this.pendingMoveTimeouts.add(id);
	}

	findLeafShowingFile(path) {
		const getStateFile = (leaf) => {
			if (!leaf || !leaf.view || typeof leaf.view.getState !== "function") return null;
			const state = leaf.view.getState();
			return state ? state.file : null;
		};
		const recent = this.app.workspace.getMostRecentLeaf();
		if (getStateFile(recent) === path) return recent;
		let found = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (!found && getStateFile(leaf) === path) found = leaf;
		});
		return found;
	}

	// ---------------------------------------------------------------- scoping

	applyVisualScoping() {
		if (!this.settings.activeSubVault) {
			this.clearVisualScoping();
			return;
		}
		document.body.classList.add(BODY_CLASS);
		if (this.statusBarEl) {
			this.statusBarEl.setText(`Sub-Vault: ${this.settings.activeSubVault}`);
			this.statusBarEl.style.display = "";
			this.statusBarEl.style.cursor = "pointer";
		}
		this.refreshScoping();
	}

	clearVisualScoping() {
		document.body.classList.remove(BODY_CLASS);
		if (this.statusBarEl) {
			this.statusBarEl.setText("");
			this.statusBarEl.style.display = "none";
		}
		// Unconditional cleanup: works even when unloaded mid-scope.
		document.querySelectorAll("." + OUTSIDE_CLASS).forEach((el) => {
			el.classList.remove(OUTSIDE_CLASS);
		});
		this.clearSearchScope();
	}

	refreshScoping() {
		this.updateFileExplorerElements();
		this.updateTagsPaneScoping();
		this.updateBacklinksScoping();
		this.applySearchScope();
	}

	requestScopeRefresh() {
		if (!this.settings.activeSubVault) return;
		if (this.refreshTimer !== null) return;
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			if (this.settings.activeSubVault) this.refreshScoping();
		}, 100);
	}

	getLeafContainers(viewType) {
		const containers = [];
		for (const leaf of this.app.workspace.getLeavesOfType(viewType)) {
			if (leaf.view && leaf.view.containerEl) containers.push(leaf.view.containerEl);
		}
		return containers;
	}

	// ---------------------------------------------------------- file explorer

	updateFileExplorerElements() {
		const scope = this.settings.activeSubVault;
		for (const container of this.getLeafContainers("file-explorer")) {
			container.querySelectorAll(".nav-folder, .nav-file").forEach((item) => {
				if (!scope) {
					item.classList.remove(OUTSIDE_CLASS);
					return;
				}
				const title = item.querySelector(".nav-folder-title, .nav-file-title");
				const path = title ? title.getAttribute("data-path") : null;
				if (!path) return;
				item.classList.toggle(OUTSIDE_CLASS, !this.shouldShowInExplorer(path));
			});
		}
	}

	shouldShowInExplorer(path) {
		if (this.isPathAllowed(path)) return true;
		// Ancestors of the Sub-Vault and of allowed folders stay visible so the
		// allowed items remain reachable in the tree.
		if (this.settings.activeSubVault.startsWith(path + "/")) return true;
		for (const folder of this.settings.globalAllowedFolders || []) {
			if (folder && folder.startsWith(path + "/")) return true;
		}
		return false;
	}

	// -------------------------------------------------------------- tags pane

	getAllowedTags() {
		if (this.allowedTagsCache) return this.allowedTagsCache;
		const allowed = new Set();
		const scope = this.settings.activeSubVault;
		if (!scope) return allowed;
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!file.path.startsWith(scope + "/")) continue;
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) continue;
			for (const tag of this.collectTags(cache)) {
				const normalized = String(tag).replace(/^#/, "").toLowerCase();
				if (!normalized) continue;
				// Add the tag and every ancestor (a/b/c -> a, a/b, a/b/c) so
				// parent items of nested tags stay visible in the tag pane.
				const parts = normalized.split("/");
				let prefix = "";
				for (const part of parts) {
					prefix = prefix ? `${prefix}/${part}` : part;
					allowed.add(prefix);
				}
			}
		}
		this.allowedTagsCache = allowed;
		return allowed;
	}

	collectTags(cache) {
		if (typeof getAllTags === "function") {
			return getAllTags(cache) || [];
		}
		// Fallback for API versions without getAllTags.
		const tags = [];
		if (cache.tags) for (const t of cache.tags) tags.push(t.tag);
		const fmTags = cache.frontmatter && (cache.frontmatter.tags || cache.frontmatter.tag);
		if (Array.isArray(fmTags)) {
			for (const t of fmTags) tags.push(String(t));
		} else if (typeof fmTags === "string") {
			for (const t of fmTags.split(/[,\s]+/)) if (t) tags.push(t);
		}
		return tags;
	}

	updateTagsPaneScoping() {
		const containers = this.getLeafContainers("tag");
		if (containers.length === 0) return;
		const scope = this.settings.activeSubVault;
		const allowed = scope ? this.getAllowedTags() : null;
		for (const container of containers) {
			container.querySelectorAll(".tree-item").forEach((item) => {
				if (!allowed) {
					item.classList.remove(OUTSIDE_CLASS);
					return;
				}
				const tagPath = this.getTagPathForTreeItem(item, container);
				if (!tagPath) return;
				item.classList.toggle(OUTSIDE_CLASS, !allowed.has(tagPath));
			});
		}
	}

	getTagPathForTreeItem(item, container) {
		// Nested tags render hierarchically (parent "a", child "b" for #a/b), so
		// rebuild the full tag path from the ancestor chain.
		const segments = [];
		let current = item;
		while (current && current !== container) {
			if (current.classList && current.classList.contains("tree-item")) {
				const self = current.querySelector(":scope > .tree-item-self");
				const inner = self ? self.querySelector(".tree-item-inner") : null;
				const text = inner && inner.textContent ? inner.textContent.trim() : "";
				if (!text) return null;
				segments.unshift(text.replace(/^#/, ""));
			}
			current = current.parentElement;
		}
		if (segments.length === 0) return null;
		return segments.join("/").toLowerCase();
	}

	// -------------------------------------------------------------- backlinks

	updateBacklinksScoping() {
		const scope = this.settings.activeSubVault;
		const roots = new Set(this.getLeafContainers("backlink"));
		// Backlinks can also be embedded at the bottom of notes.
		document.querySelectorAll(".backlink-pane").forEach((el) => roots.add(el));
		for (const root of roots) {
			root.querySelectorAll(".search-result-file-title").forEach((titleEl) => {
				const item = titleEl.closest(".tree-item");
				if (!item) return;
				if (!scope) {
					item.classList.remove(OUTSIDE_CLASS);
					return;
				}
				const path = titleEl.getAttribute("data-path");
				if (!path) return;
				item.classList.toggle(OUTSIDE_CLASS, !this.isPathAllowed(path));
			});
		}
	}

	// --------------------------------------------------------- search scoping

	applySearchScope() {
		if (!this.settings.enforceSearchScope) return;
		const scope = this.settings.activeSubVault;
		if (!scope) return;
		const token = `path:"${scope}"`;
		if (this.appliedSearchToken && this.appliedSearchToken !== token) {
			this.clearSearchScope();
		}
		this.appliedSearchToken = token;
		for (const input of this.getScopeQueryInputs()) {
			if (input.value.includes(token)) continue;
			input.value = input.value ? `${token} ${input.value}` : `${token} `;
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}
	}

	clearSearchScope() {
		const token = this.appliedSearchToken;
		this.appliedSearchToken = null;
		if (!token) return;
		for (const input of this.getScopeQueryInputs()) {
			if (!input.value.includes(token)) continue;
			input.value = input.value.split(token).join("").trimStart();
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}
	}

	getScopeQueryInputs() {
		// Only actual query text inputs — never the graph sliders/checkboxes.
		const selector = [
			'.workspace-leaf-content[data-type="search"] .search-input-container input',
			'.workspace-leaf-content[data-type="graph"] .search-input-container input',
			'.workspace-leaf-content[data-type="localgraph"] .search-input-container input',
		].join(", ");
		return Array.from(document.querySelectorAll(selector));
	}

	// ---------------------------------------------------------- DOM observers

	attachPaneObservers() {
		this.detachPaneObservers();
		for (const viewType of ["file-explorer", "tag", "backlink"]) {
			for (const container of this.getLeafContainers(viewType)) {
				// Only childList mutations are observed, and the refresh only
				// toggles classes (attribute mutations), so this cannot loop.
				const observer = new MutationObserver(() => this.requestScopeRefresh());
				observer.observe(container, { childList: true, subtree: true });
				this.paneObservers.push(observer);
			}
		}
	}

	detachPaneObservers() {
		for (const observer of this.paneObservers) observer.disconnect();
		this.paneObservers = [];
	}
}

module.exports = NestedVaultsPlugin;
module.exports.default = NestedVaultsPlugin;
