import { App, PluginSettingTab, Setting, TFolder, TAbstractFile, AbstractInputSuggest } from 'obsidian';
import NestedVaultsPlugin from './main';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    textInputEl: HTMLInputElement;

    constructor(app: App, textInputEl: HTMLInputElement) {
        super(app, textInputEl);
        this.textInputEl = textInputEl;
    }

    getSuggestions(inputStr: string): TFolder[] {
        const abstractFiles = this.app.vault.getAllLoadedFiles();
        const folders: TFolder[] = [];
        const lowerCaseInputStr = inputStr.toLowerCase();

        abstractFiles.forEach((folder: TAbstractFile) => {
            if (folder instanceof TFolder && folder.path.toLowerCase().includes(lowerCaseInputStr)) {
                folders.push(folder);
            }
        });

        return folders;
    }

    renderSuggestion(file: TFolder, el: HTMLElement): void {
        el.setText(file.path);
    }

    selectSuggestion(file: TFolder): void {
        this.textInputEl.value = file.path;
        this.textInputEl.trigger("input");
        this.close();
    }
}

export interface NestedVaultsSettings {
	activeSubVault: string;
	globalAllowedFolders: string[];
}

export const DEFAULT_SETTINGS: NestedVaultsSettings = {
	activeSubVault: '',
	globalAllowedFolders: ['Attachments', 'Templates'],
};

export class NestedVaultsSettingTab extends PluginSettingTab {
	plugin: NestedVaultsPlugin;

	constructor(app: App, plugin: NestedVaultsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		
		new Setting(containerEl).setName("Nested vault configuration").setHeading();

		new Setting(containerEl)
			.setName('Active sub-vault')
			.setDesc('The path to the folder to act as your nested vault. Leave empty to clear.')
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl);
				text.setPlaceholder('E.g., projects/myproject')
					.setValue(this.plugin.settings.activeSubVault)
					.onChange(async (value) => {
						this.plugin.settings.activeSubVault = value;
						await this.plugin.saveSettings();
						this.plugin.applyVisualScoping();
					});
			});
			
		containerEl.createEl('br');
		new Setting(containerEl).setName("Global allowed folders").setHeading();
		containerEl.createEl('p', {text: 'These folders will always remain visible and accessible, even when you are scoped inside a sub-vault. This is useful for global attachment or template folders.', cls: 'setting-item-description'});

		let newFolderPath = '';
		new Setting(containerEl)
			.setName('Add global allowed folder')
			.setDesc('Select a folder to add to your whitelist.')
			.addText(text => {
				new FolderSuggest(this.app, text.inputEl);
				text.setPlaceholder('Select folder...')
				    .onChange(val => {
						newFolderPath = val;
					});
			})
			.addButton(btn => {
				btn.setButtonText('Add')
				   .setCta()
				   .onClick(async () => {
						if (newFolderPath && !this.plugin.settings.globalAllowedFolders.includes(newFolderPath)) {
							this.plugin.settings.globalAllowedFolders.push(newFolderPath);
							await this.plugin.saveSettings();
							this.display(); // re-render the settings
							this.plugin.applyVisualScoping();
						}
				   });
			});

		// Render existing global folders
		for (const folder of this.plugin.settings.globalAllowedFolders) {
			new Setting(containerEl)
				.setName(folder)
				.addButton(btn => {
					btn.setIcon('trash')
					   .setTooltip('Remove')
					   .onClick(async () => {
							this.plugin.settings.globalAllowedFolders = this.plugin.settings.globalAllowedFolders.filter(f => f !== folder);
							await this.plugin.saveSettings();
							this.display();
							this.plugin.applyVisualScoping();
					   });
				});
		}
	}
}
