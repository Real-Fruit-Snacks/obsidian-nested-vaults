import { App, SuggestModal, TFile } from 'obsidian';
import NestedVaultsPlugin from './main';

export class ScopedSuggestModal extends SuggestModal<TFile> {
	plugin: NestedVaultsPlugin;

	constructor(app: App, plugin: NestedVaultsPlugin) {
		super(app);
		this.plugin = plugin;
		this.setPlaceholder("Search files in active sub-vault...");
	}

	getSuggestions(query: string): TFile[] {
		const files = this.app.vault.getMarkdownFiles();
		const activeSubVault = this.plugin.settings.activeSubVault;
		
		if (!activeSubVault) {
			return files.filter(file => file.path.toLowerCase().includes(query.toLowerCase()));
		}

		return files.filter(file => {
			if (!file.path.startsWith(activeSubVault + '/')) {
				return false;
			}
			const relativePath = file.path.substring(activeSubVault.length + 1);
			return relativePath.toLowerCase().includes(query.toLowerCase());
		});
	}

	renderSuggestion(file: TFile, el: HTMLElement) {
		const activeSubVault = this.plugin.settings.activeSubVault;
		let displayPath = file.path;
		if (activeSubVault && file.path.startsWith(activeSubVault + '/')) {
			displayPath = file.path.substring(activeSubVault.length + 1);
		}
		
		el.createEl("div", { text: file.basename });
		el.createEl("small", { text: displayPath, cls: "navigation-item-url" });
	}

	onChooseSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent) {
		void this.app.workspace.getLeaf(evt.ctrlKey || evt.metaKey).openFile(file);
	}
}
