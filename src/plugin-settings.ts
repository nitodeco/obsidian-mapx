import type { MapSettings } from "./settings";
import { DEFAULT_SETTINGS } from "./settings";
import type { MapView } from "./map-view";
import type ObsidianMapsPlugin from "./main";

export const MAPX_PLUGIN_ID = "mapx";
export const MAPX_SETTINGS_CHANGED_EVENT = "mapx:settings-changed";

const mapViews = new Set<MapView>();

export function registerMapView(mapView: MapView): void {
	mapViews.add(mapView);
}

export function unregisterMapView(mapView: MapView): void {
	mapViews.delete(mapView);
}

export function notifyMapViews(settings: MapSettings): void {
	for (const mapView of mapViews) {
		mapView.applyPluginSettings(settings);
	}
}

export function resolveMapSettings(plugin: ObsidianMapsPlugin | null | undefined): MapSettings {
	if (!plugin?.settings) {
		return DEFAULT_SETTINGS;
	}

	return {
		...DEFAULT_SETTINGS,
		...plugin.settings,
		showMarkerLabels:
			plugin.settings.showMarkerLabels ?? plugin.settings.showTextLabels ?? false,
		textLabels: {
			...DEFAULT_SETTINGS.textLabels,
			...plugin.settings.textLabels,
		},
		mapLayers: {
			...DEFAULT_SETTINGS.mapLayers,
			...plugin.settings.mapLayers,
		},
	};
}

export function buildMapStyleKey(
	mapTiles: string[],
	mapTilesDark: string[],
	resolvedIsDark: boolean,
	settings: MapSettings,
): string {
	return JSON.stringify({
		mapTiles,
		mapTilesDark,
		resolvedIsDark,
		showTextLabels: settings.showTextLabels,
		textLabels: settings.textLabels,
		mapLayers: settings.mapLayers,
	});
}
