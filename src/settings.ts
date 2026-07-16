import { App, Modal, PluginSettingTab, Setting, setIcon, setTooltip } from "obsidian";
import ObsidianMapsPlugin from "./main";

export interface TileSet {
	id: string;
	name: string;
	lightTiles: string;
	darkTiles: string;
}

export type MapTheme = "system" | "light" | "dark";

export interface MapTextLabelSettings {
	countries: boolean;
	regions: boolean;
	cities: boolean;
	bodiesOfWater: boolean;
	roads: boolean;
}

export interface MapLayerSettings {
	countryBorders: boolean;
	stateBorders: boolean;
	countyBorders: boolean;
	roads: boolean;
	capitalMarkers: boolean;
}

export interface MapSettings {
	tileSets: TileSet[];
	mapTheme: MapTheme;
	showTextLabels: boolean;
	showMarkerLabels: boolean;
	textLabels: MapTextLabelSettings;
	mapLayers: MapLayerSettings;
}

export const DEFAULT_SETTINGS: MapSettings = {
	tileSets: [],
	mapTheme: "system",
	showTextLabels: false,
	showMarkerLabels: false,
	textLabels: {
		countries: true,
		regions: true,
		cities: true,
		bodiesOfWater: true,
		roads: true,
	},
	mapLayers: {
		countryBorders: true,
		stateBorders: true,
		countyBorders: true,
		roads: true,
		capitalMarkers: true,
	},
};

class TileSetModal extends Modal {
	tileSet: TileSet;
	onSave: (tileSet: TileSet) => void;
	isNew: boolean;

	constructor(app: App, tileSet: TileSet | null, onSave: (tileSet: TileSet) => void) {
		super(app);
		this.isNew = !tileSet;
		this.tileSet = tileSet || {
			id: Date.now().toString(),
			name: "",
			lightTiles: "",
			darkTiles: "",
		};
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl, modalEl } = this;

		this.setTitle(this.isNew ? "Add background" : "Edit background");

		new Setting(contentEl)
			.setName("Name")
			.setDesc("A name for this background.")
			.addText((text) =>
				text
					.setPlaceholder("e.g. Terrain, Satellite")
					.setValue(this.tileSet.name)
					.onChange((value) => {
						this.tileSet.name = value;
					}),
			);

		const lightModeSetting = new Setting(contentEl).setName("Light mode").addText((text) =>
			text
				.setPlaceholder("https://tiles.openfreemap.org/styles/bright")
				.setValue(this.tileSet.lightTiles)
				.onChange((value) => {
					this.tileSet.lightTiles = value;
				}),
		);

		lightModeSetting.descEl.innerHTML =
			'Tile URL or style URL for light mode. See the <a href="https://help.obsidian.md/bases/views/map">Map view documentation</a> for examples.';

		new Setting(contentEl)
			.setName("Dark mode (optional)")
			.setDesc(
				"Tile URL or style URL for dark mode. If not specified, light mode tiles will be used.",
			)
			.addText((text) =>
				text
					.setPlaceholder("https://tiles.openfreemap.org/styles/dark")
					.setValue(this.tileSet.darkTiles)
					.onChange((value) => {
						this.tileSet.darkTiles = value;
					}),
			);

		const buttonContainerEl = modalEl.createDiv("modal-button-container");

		buttonContainerEl
			.createEl("button", { cls: "mod-cta", text: "Save" })
			.addEventListener("click", () => {
				this.onSave(this.tileSet);
				this.close();
			});

		buttonContainerEl.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export class MapSettingTab extends PluginSettingTab {
	plugin: ObsidianMapsPlugin;

	constructor(app: App, plugin: ObsidianMapsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Map theme")
			.setDesc("Choose which map tiles to use. System follows your Obsidian theme.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("system", "System")
					.addOption("light", "Light")
					.addOption("dark", "Dark")
					.setValue(this.plugin.settings.mapTheme)
					.onChange(async (value) => {
						this.plugin.settings.mapTheme = value as MapTheme;
						await this.plugin.saveSettings();
						this.plugin.notifySettingsChanged();
					}),
			);

		new Setting(containerEl).setHeading().setName("Text labels");

		new Setting(containerEl)
			.setName("Show text labels")
			.setDesc("Show place names from the map background.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showTextLabels).onChange(async (value) => {
					this.plugin.settings.showTextLabels = value;
					await this.plugin.saveSettings();
					this.plugin.notifySettingsChanged();
				}),
			);

		new Setting(containerEl)
			.setName("Show marker labels")
			.setDesc("Show note names next to marked places.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showMarkerLabels).onChange(async (value) => {
					this.plugin.settings.showMarkerLabels = value;
					await this.plugin.saveSettings();
					this.plugin.notifySettingsChanged();
				}),
			);

		this.addTextLabelToggle(
			containerEl,
			"Countries",
			"Country and continent names.",
			"countries",
		);
		this.addTextLabelToggle(containerEl, "Regions", "State and province names.", "regions");
		this.addTextLabelToggle(containerEl, "Cities", "City, town, and village names.", "cities");
		this.addTextLabelToggle(
			containerEl,
			"Bodies of water",
			"Sea, lake, and river names.",
			"bodiesOfWater",
		);
		this.addTextLabelToggle(containerEl, "Roads", "Street names and route shields.", "roads");

		new Setting(containerEl).setHeading().setName("Map layers");

		this.addMapLayerToggle(containerEl, "Country borders", "", "countryBorders");
		this.addMapLayerToggle(containerEl, "State borders", "", "stateBorders");
		this.addMapLayerToggle(containerEl, "County borders", "", "countyBorders");
		this.addMapLayerToggle(containerEl, "Roads", "Streets, highways, and paths.", "roads");
		this.addMapLayerToggle(
			containerEl,
			"Capital markers",
			"Dot markers on cities, towns, and capitals.",
			"capitalMarkers",
		);

		new Setting(containerEl)
			.setHeading()
			.setName("Backgrounds")
			.addButton((button) =>
				button
					.setButtonText("Add background")
					.setCta()
					.onClick(() => {
						new TileSetModal(this.app, null, async (tileSet) => {
							this.plugin.settings.tileSets.push(tileSet);
							await this.plugin.saveSettings();
							this.plugin.notifySettingsChanged();
							this.display();
						}).open();
					}),
			);

		// Display existing tile sets as a list
		const listContainer = containerEl.createDiv("map-tileset-list");

		this.plugin.settings.tileSets.forEach((tileSet, index) => {
			this.displayTileSetItem(listContainer, tileSet, index);
		});

		if (this.plugin.settings.tileSets.length === 0) {
			listContainer.createDiv({
				cls: "mobile-option-setting-item",
				text: "Add background sets available to all maps.",
			});
		}
	}

	private addTextLabelToggle(
		containerEl: HTMLElement,
		name: string,
		description: string,
		key: keyof MapTextLabelSettings,
	): void {
		const setting = new Setting(containerEl).setName(name).addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.textLabels[key]).onChange(async (value) => {
				this.plugin.settings.textLabels[key] = value;
				await this.plugin.saveSettings();
				this.plugin.notifySettingsChanged();
			}),
		);

		if (description) {
			setting.setDesc(description);
		}
	}

	private addMapLayerToggle(
		containerEl: HTMLElement,
		name: string,
		description: string,
		key: keyof MapLayerSettings,
	): void {
		const setting = new Setting(containerEl).setName(name).addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.mapLayers[key]).onChange(async (value) => {
				this.plugin.settings.mapLayers[key] = value;
				await this.plugin.saveSettings();
				this.plugin.notifySettingsChanged();
			}),
		);

		if (description) {
			setting.setDesc(description);
		}
	}

	private displayTileSetItem(containerEl: HTMLElement, tileSet: TileSet, index: number): void {
		const itemEl = containerEl.createDiv("mobile-option-setting-item");

		itemEl.createSpan({
			cls: "mobile-option-setting-item-name",
			text: tileSet.name || "Untitled",
		});

		itemEl.createDiv("clickable-icon", (el) => {
			setIcon(el, "pencil");
			setTooltip(el, "Edit");
			el.addEventListener("click", () => {
				new TileSetModal(this.app, { ...tileSet }, async (updatedTileSet) => {
					this.plugin.settings.tileSets[index] = updatedTileSet;
					await this.plugin.saveSettings();
					this.plugin.notifySettingsChanged();
					this.display();
				}).open();
			});
		});

		itemEl.createDiv("clickable-icon", (el) => {
			setIcon(el, "trash-2");
			setTooltip(el, "Delete");
			el.addEventListener("click", async () => {
				this.plugin.settings.tileSets.splice(index, 1);
				await this.plugin.saveSettings();
				this.plugin.notifySettingsChanged();
				this.display();
			});
		});
	}
}
