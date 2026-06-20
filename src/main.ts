import {
	Menu,
	Notice,
	Plugin,
	TAbstractFile,
	TFolder,
	TFile
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	NestedVaultsSettings,
	NestedVaultsSettingTab,
} from './settings';
import { ScopedSuggestModal } from './ScopedSuggestModal';
import { SubVaultSuggestModal } from './SubVaultSuggestModal';

export default class NestedVaultsPlugin extends Plugin {
	settings!: NestedVaultsSettings;
	
	// Mutation observer to watch for core search/graph DOM elements
	private observer: MutationObserver | null = null;
	private statusBarEl!: HTMLElement;

	async onload() {
		await this.loadSettings();

		// Add settings tab
		this.addSettingTab(new NestedVaultsSettingTab(this.app, this));

		// Native Status bar
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.onClickEvent(() => {
			if (this.settings.activeSubVault) {
				this.settings.activeSubVault = '';
				void this.saveSettings();
				new Notice('Left sub-vault. Returned to main vault.');
				this.applyVisualScoping();
			}
		});

		// Ribbon icon to leave the active sub-vault
		this.addRibbonIcon('log-out', 'Leave active sub-vault', () => {
			if (this.settings.activeSubVault) {
				this.settings.activeSubVault = '';
				void this.saveSettings();
				new Notice('Left sub-vault. Returned to main vault.');
				this.applyVisualScoping();
			} else {
				new Notice('You are not currently in a sub-vault.');
			}
		});

		// Command: Scoped quick switcher
		this.addCommand({
			id: 'open-scoped-quick-switcher',
			name: 'Open scoped quick switcher',
			callback: () => {
				new ScopedSuggestModal(this.app, this).open();
			},
		});

		// Command: Clear active sub-vault
		this.addCommand({
			id: 'clear-active-sub-vault',
			name: 'Clear active sub-vault',
			callback: async () => {
				this.settings.activeSubVault = '';
				await this.saveSettings();
				new Notice('Sub-vault cleared.');
				this.applyVisualScoping();
			},
		});

		// Folder context menu to set as active sub-vault
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
				if (file instanceof TFolder) {
					menu.addItem((item) => {
						item
							.setTitle("Set as active sub-vault")
							.setIcon("target")
							.onClick(async () => {
								this.settings.activeSubVault = file.path;
								await this.saveSettings();
								new Notice(`Active sub-vault set to: ${file.path}`);
								this.applyVisualScoping();
							});
					});
				}
			})
		);

		// Prevent opening files outside the active sub-vault
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (!this.settings.activeSubVault || !file) return;
				
				if (!this.isPathAllowed(file.path)) {
					new Notice("Blocked: That file is outside your active sub-vault.");
					const leaf = this.app.workspace.getMostRecentLeaf();
					if (leaf && leaf.view && leaf.view.getState().file === file.path) {
					    leaf.detach();
					}
				}
			})
		);
		
		// Command: Set active sub-vault
		this.addCommand({
			id: 'set-active-sub-vault',
			name: 'Set active sub-vault',
			callback: () => {
				new SubVaultSuggestModal(this.app, this).open();
			},
		});

		// Listen for renaming folders
		this.registerEvent(
			this.app.vault.on('rename', async (file, oldPath) => {
				let updated = false;
				if (this.settings.activeSubVault === oldPath) {
					this.settings.activeSubVault = file.path;
					updated = true;
					new Notice(`Active Sub-Vault renamed to: ${file.path}`);
				} else if (this.settings.activeSubVault && this.settings.activeSubVault.startsWith(oldPath + '/')) {
					this.settings.activeSubVault = this.settings.activeSubVault.replace(oldPath, file.path);
					updated = true;
				}
				
				const newGlobals = this.settings.globalAllowedFolders.map(g => {
					if (g === oldPath) { updated = true; return file.path; }
					if (g.startsWith(oldPath + '/')) { updated = true; return g.replace(oldPath, file.path); }
					return g;
				});
				if (updated) {
					this.settings.globalAllowedFolders = newGlobals;
					await this.saveSettings();
					this.applyVisualScoping();
				}
			})
		);

		// Listen for deleting folders
		this.registerEvent(
			this.app.workspace.onLayoutReady(() => {
				this.app.vault.on('delete', async (file) => {
					if (this.settings.activeSubVault === file.path || this.settings.activeSubVault.startsWith(file.path + '/')) {
						this.settings.activeSubVault = '';
						await this.saveSettings();
						new Notice('Active sub-vault was deleted. Cleared sub-vault.');
						this.applyVisualScoping();
					}
				});
			})
		);

		// Listen for new notes created outside the active sub-vault
		this.registerEvent(
			this.app.workspace.onLayoutReady(() => {
				this.app.vault.on('create', (file) => {
					if (!this.settings.activeSubVault) return;
					if (file instanceof TFile && file.extension === 'md') {
						if (!this.isPathAllowed(file.path)) {
							// Wait a tiny bit to avoid Obsidian getting confused
							window.setTimeout(() => {
								void (async () => {
									try {
										const newPath = `${this.settings.activeSubVault}/${file.name}`;
										await this.app.vault.rename(file, newPath);
										new Notice(`Moved new note into sub-vault: ${file.name}`);
									} catch (e) {
										console.error("Could not move file", e);
									}
								})();
							}, 100);
						}
					}
				});
			})
		);
		
		// Apply visual scoping on load
		this.app.workspace.onLayoutReady(() => {
			this.applyVisualScoping();
			this.setupDomObserver();
		});
	}

	onunload() {
		if (this.observer) {
			this.observer.disconnect();
		}
		this.clearVisualScoping();
	}

	async loadSettings() {
		 
		const data: unknown = await this.loadData();
		
		// Migration for globalAllowedFolders from string to string[]
		 
		if (data && typeof data.globalAllowedFolders === 'string') {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
			data.globalAllowedFolders = data.globalAllowedFolders.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
		}
		
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			data as Partial<NestedVaultsSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// This is a naive visual scoping - just adds a class to the body 
	// so CSS can dim non-active folders
	applyVisualScoping() {
		if (!this.settings.activeSubVault) {
			this.clearVisualScoping();
			return;
		}
		activeDocument.body.classList.add("nested-vault-active");
		
		if (this.statusBarEl) {
			this.statusBarEl.setText(`Sub-vault: ${this.settings.activeSubVault}`);
			// eslint-disable-next-line obsidianmd/no-static-styles-assignment
			this.statusBarEl.style.display = '';
			// eslint-disable-next-line obsidianmd/no-static-styles-assignment
			this.statusBarEl.style.cursor = 'pointer';
		}
		
		this.updateFileExplorerElements();
	}
	
	clearVisualScoping() {
		activeDocument.body.classList.remove("nested-vault-active");
		if (this.statusBarEl) {
			this.statusBarEl.setText('');
			// eslint-disable-next-line obsidianmd/no-static-styles-assignment
			this.statusBarEl.style.display = 'none';
		}
		this.updateFileExplorerElements();
		this.updateTagsPaneScoping();
		this.updateBacklinksScoping();
	}

	isPathAllowed(path: string): boolean {
		if (!this.settings.activeSubVault) return true;
		if (path === this.settings.activeSubVault || path.startsWith(this.settings.activeSubVault + '/')) return true;
		
		const globals = this.settings.globalAllowedFolders || [];
		for (const g of globals) {
			if (path === g || path.startsWith(g + '/')) return true;
		}
		return false;
	}

	getAllowedTags(): Set<string> {
		const allowedTags = new Set<string>();
		if (!this.settings.activeSubVault) return allowedTags;
		
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			if (file.path.startsWith(this.settings.activeSubVault + '/')) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache && cache.tags) {
					cache.tags.forEach(tagCache => allowedTags.add(tagCache.tag.toLowerCase()));
				}
				// Also check frontmatter tags
				if (cache && cache.frontmatter && cache.frontmatter.tags) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
					const fmTags: any = cache.frontmatter.tags;
					if (Array.isArray(fmTags)) {
						fmTags.forEach(t => allowedTags.add(`#${t}`.toLowerCase()));
					} else if (typeof fmTags === 'string') {
						fmTags.split(',').forEach(t => allowedTags.add(`#${t.trim()}`.toLowerCase()));
					}
				}
			}
		}
		
		// Expand tags to include parent tags
		const expandedTags = new Set<string>();
		allowedTags.forEach(tag => {
			if (!tag) return;
			const parts = tag.split('/');
			if (parts.length === 0 || !parts[0]) return;
			let current = parts[0];
			expandedTags.add(current);
			for (let i = 1; i < parts.length; i++) {
				current += '/' + parts[i];
				expandedTags.add(current);
			}
		});
		return expandedTags;
	}

	updateTagsPaneScoping() {
		if (!this.settings.activeSubVault) {
			activeDocument.querySelectorAll('.tag-pane .tree-item').forEach(el => {
				el.classList.remove('is-outside-subvault');
			});
			return;
		}
		
		const allowedTags = this.getAllowedTags();
		activeDocument.querySelectorAll('.tag-pane .tree-item').forEach(el => {
			const tagEl = el.querySelector('.tree-item-inner');
			if (tagEl && tagEl.textContent) {
				const tag: string = String(tagEl.textContent).trim().toLowerCase();
				if (!allowedTags.has(tag)) {
					el.classList.add('is-outside-subvault');
				} else {
					el.classList.remove('is-outside-subvault');
				}
			}
		});
	}

	enforceSearchPrefix() {
		if (!this.settings.activeSubVault) return;
		const prefix = `path:"${this.settings.activeSubVault}"`;
		
		// Strictly target native file search and graph views to avoid breaking other plugins (like Settings Search)
		const selectors = [
			'.workspace-leaf-content[data-type="search"] .search-input-container input',
			'.workspace-leaf-content[data-type="graph"] .graph-controls input',
			'.workspace-leaf-content[data-type="localgraph"] .graph-controls input'
		].join(', ');

		const searchInputs = activeDocument.querySelectorAll(selectors);
		searchInputs.forEach((input) => {
			const el = input as HTMLInputElement;
			if (!el.value.includes(prefix)) {
				el.value = `${prefix} ` + el.value.replace(/path:".*?"\s*/g, ''); // Clean up any partial old paths
				el.dispatchEvent(new Event('input', { bubbles: true }));
			}
		});
	}

	updateFileExplorerElements() {
		const activeSubVault = this.settings.activeSubVault;
		
		const allNavElements = activeDocument.querySelectorAll('.nav-folder, .nav-file');
		
		if (!activeSubVault) {
			allNavElements.forEach(el => {
				el.classList.remove('is-outside-subvault');
			});
			return;
		}

		allNavElements.forEach(el => {
			const titleEl = el.querySelector('.nav-folder-title, .nav-file-title');
			if (!titleEl) return;
			
			const path = titleEl.getAttribute('data-path');
			if (!path) return;

			// Is it the active vault, a child of it, or globally allowed?
			const isInside = this.isPathAllowed(path);
			
			// Is it a parent folder of the active sub-vault? (We must show parents to reach the child)
			const isParent = this.settings.activeSubVault.startsWith(path + '/');
			
			if (isInside || isParent) {
				el.classList.remove('is-outside-subvault');
			} else {
				el.classList.add('is-outside-subvault');
			}
		});
	}

	updateBacklinksScoping() {
		if (!this.settings.activeSubVault) {
			activeDocument.querySelectorAll('.backlink-pane .tree-item, .workspace-leaf-content[data-type="backlink"] .tree-item').forEach(el => {
				el.classList.remove('is-outside-subvault');
			});
			return;
		}
		
		activeDocument.querySelectorAll('.backlink-pane .search-result-file-title, .workspace-leaf-content[data-type="backlink"] .search-result-file-title').forEach(el => {
			const path = el.getAttribute('data-path');
			const treeItem = el.closest('.tree-item');
			if (path && treeItem) {
				if (!this.isPathAllowed(path)) {
					treeItem.classList.add('is-outside-subvault');
				} else {
					treeItem.classList.remove('is-outside-subvault');
				}
			}
		});
	}

	// Watch the DOM to inject path filter into search and graph
	setupDomObserver() {
		// Run checks periodically to catch programmatic changes (like clicking a tag to search)
		this.registerInterval(
			window.setInterval(() => {
				if (this.settings.activeSubVault) {
					this.enforceSearchPrefix();
					this.updateTagsPaneScoping();
					this.updateBacklinksScoping();
				}
			}, 500)
		);

		this.observer = new MutationObserver((mutations) => {
			if (!this.settings.activeSubVault) return;

			for (const mutation of mutations) {
				if (mutation.addedNodes.length > 0) {
					// Check for newly added file explorer or tags elements
					mutation.addedNodes.forEach(node => {
						if (node.instanceOf(HTMLElement)) {
							if (node.classList.contains('nav-folder') || node.classList.contains('nav-file') || node.querySelector('.nav-folder, .nav-file')) {
								this.updateFileExplorerElements();
							}
							if (node.classList.contains('tree-item') || node.querySelector('.tree-item')) {
								this.updateTagsPaneScoping();
							}
						}
					});
				}
			}
		});

		this.observer.observe(activeDocument.body, {
			childList: true,
			subtree: true,
		});
	}
}
