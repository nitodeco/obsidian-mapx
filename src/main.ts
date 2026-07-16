import { Plugin, Workspace } from "obsidian";
import { MapView } from "./map-view";
import { MapSettings, DEFAULT_SETTINGS, MapSettingTab } from "./settings";
import { MAPX_SETTINGS_CHANGED_EVENT, notifyMapViews } from "./plugin-settings";

export default class ObsidianMapsPlugin extends Plugin {
	settings: MapSettings;

	async onload() {
		await this.loadSettings();

		this.registerBasesView("map", {
			name: "Map",
			icon: "lucide-map",
			factory: (controller, containerEl) => new MapView(controller, containerEl, this),
			options: MapView.getViewOptions,
		});

		this.addSettingTab(new MapSettingTab(this.app, this));
	}

	async loadSettings() {
		const savedData = ((await this.loadData()) ?? {}) as Partial<MapSettings>;
		this.settings = {
			...DEFAULT_SETTINGS,
			...savedData,
			showMarkerLabels: savedData.showMarkerLabels ?? savedData.showTextLabels ?? false,
			textLabels: {
				...DEFAULT_SETTINGS.textLabels,
				...savedData.textLabels,
			},
			mapLayers: {
				...DEFAULT_SETTINGS.mapLayers,
				...savedData.mapLayers,
			},
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	notifySettingsChanged(): void {
		const settingsSnapshot: MapSettings = {
			...DEFAULT_SETTINGS,
			...this.settings,
			showMarkerLabels: this.settings.showMarkerLabels,
		};

		(
			this.app.workspace as Workspace & {
				trigger(name: typeof MAPX_SETTINGS_CHANGED_EVENT, settings: MapSettings): void;
			}
		).trigger(MAPX_SETTINGS_CHANGED_EVENT, settingsSnapshot);

		notifyMapViews(settingsSnapshot);
	}
}
