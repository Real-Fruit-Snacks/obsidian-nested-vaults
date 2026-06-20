import { App, FuzzySuggestModal, TFolder, Notice } from 'obsidian';
import NestedVaultsPlugin from './main';

export class SubVaultSuggestModal extends FuzzySuggestModal<TFolder> {
	plugin: NestedVaultsPlugin;

	constructor(app: App, plugin: NestedVaultsPlugin) {
		super(app);
		this.plugin = plugin;
		this.setPlaceholder("Select a folder to set as active sub-vault...");
	}

	getItems(): TFolder[] {
		const folders: TFolder[] = [];
		this.app.vault.getAllLoadedFiles().forEach(file => {
			if (file instanceof TFolder && file.path !== '/') {
				folders.push(file);
			}
		});
		return folders;
	}

	getItemText(folder: TFolder): string {
		return folder.path;
	}

	onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
		this.plugin.settings.activeSubVault = folder.path;
		void this.plugin.saveSettings();
		new Notice(`Active sub-vault set to: ${folder.path}`);
		this.plugin.applyVisualScoping();
	}
}
