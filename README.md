# Obsidian Nested Vaults

[![Obsidian Downloads](https://img.shields.io/badge/obsidian-plugin-blue.svg)](https://obsidian.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Nested Vaults** is a powerful plugin for [Obsidian](https://obsidian.md) that lets you magically scope your entire vault down to a specific folder. 

Have a massive master vault, but want to focus entirely on a single project? Instead of opening a separate vault window, this plugin instantly restricts your File Explorer, Core Search, Tags Pane, and Backlinks to *only* show files within your chosen sub-folder!

## Features

- **Strict File Explorer Scoping**: Instantly hides all folders and files outside your active sub-vault.
- **Aggressive View Blocking**: Prevents accidental navigation outside your sub-vault. If you click a link that leads outside your scope, the plugin blocks it and closes the tab.
- **Robust Search & Graph Injection**: Automatically enforces a `path:"Your/Sub/Vault"` filter into Obsidian's native Search and Graph views. Resists programmatic overrides.
- **Smart Tags & Backlinks Filtering**: Hides tags and backlinks that belong to notes outside your sub-vault. You only see the context relevant to your current project.
- **Global Allowed Folders**: Whitelist specific folders (like `Attachments` or `Templates`) in settings. These stay accessible globally so your embedded images and standard templates never break.
- **Magical Note Creation**: Automatically moves newly created notes straight into your active sub-vault.
- **Seamless Integrations**: Supports a native Status Bar indicator, Command Palette actions, and dynamic settings updates if you rename your folders!

## Installation

### Option 1: BRAT (Beta Reviewer's Auto-update Tool)
1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the Community Plugins tab.
2. Go to BRAT settings and click **Add Beta plugin**.
3. Paste the URL of this GitHub repository.
4. Enable **Nested Vaults** in your Community Plugins list.

### Option 2: Manual Installation
1. Go to the **Releases** page of this repository.
2. Download the latest `main.js`, `manifest.json`, and `styles.css`.
3. Create a folder named `obsidian-nested-vaults` inside your `.obsidian/plugins/` directory.
4. Place the downloaded files into that folder.
5. Reload Obsidian and enable the plugin.

## Usage

1. **Set your Sub-Vault**: Right-click any folder in your File Explorer and select **Set as Active Sub-Vault**, or use the `Set Active Sub-Vault` command in your Command Palette.
2. **Focus**: Your File Explorer, Search, Tags, and Backlinks will instantly clamp down to that folder.
3. **Leave**: Click the `Leave Sub-Vault` icon in the left ribbon, or click the sub-vault name in your bottom Status Bar to return to your master vault.

## Settings

- **Active Sub-Vault**: The path to your currently focused folder.
- **Global Allowed Folders**: A professional whitelist manager for global assets (e.g., `Attachments`, `Templates`).

## License

MIT License. See [LICENSE](LICENSE) for more details.
