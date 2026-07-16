import { StyleSpecification } from "maplibre-gl";
import type { MapSettings, MapTextLabelSettings } from "../settings";

type StyleLayer = Omit<StyleSpecification["layers"][number], "filter"> & {
	"source-layer"?: string;
	layout?: Record<string, unknown>;
	filter?: unknown;
};

const ROAD_CLASS_PATTERN = /"(motorway|trunk|primary|secondary|tertiary|minor|service|track|path)"/;
const NON_ROAD_TRANSPORT_PATTERN = /"(rail|transit|ferry)"/;
const ROAD_LAYER_ID_PATTERN = /^(highway|road_oneway)/;

const COUNTRY_ADMIN_LEVELS = [2];
const STATE_ADMIN_LEVELS = [3, 4];
const COUNTY_ADMIN_LEVELS = [5, 6];

function getFilterJson(layer: StyleLayer): string {
	return layer.filter ? JSON.stringify(layer.filter) : "";
}

function getSourceLayer(layer: StyleLayer): string {
	return layer["source-layer"] ?? "";
}

function hasTextField(layer: StyleLayer): boolean {
	return layer.type === "symbol" && layer.layout?.["text-field"] !== undefined;
}

function hasIconImage(layer: StyleLayer): boolean {
	return layer.type === "symbol" && layer.layout?.["icon-image"] !== undefined;
}

function isFerryLayer(layer: StyleLayer): boolean {
	return layer.id.toLowerCase().includes("ferry") || getFilterJson(layer).includes('"ferry"');
}

function isRouteShieldLayer(layer: StyleLayer): boolean {
	return getSourceLayer(layer) === "transportation_name" && hasIconImage(layer);
}

function isRoadNetworkLayer(layer: StyleLayer): boolean {
	if (getSourceLayer(layer) !== "transportation") {
		return false;
	}

	const filterJson = getFilterJson(layer);
	if (NON_ROAD_TRANSPORT_PATTERN.test(filterJson)) {
		return false;
	}

	return ROAD_CLASS_PATTERN.test(filterJson) || ROAD_LAYER_ID_PATTERN.test(layer.id);
}

function getTextLabelCategory(layer: StyleLayer): keyof MapTextLabelSettings | null {
	const sourceLayer = getSourceLayer(layer);

	if (sourceLayer === "water_name" || sourceLayer === "waterway") {
		return "bodiesOfWater";
	}

	if (sourceLayer === "transportation_name") {
		return "roads";
	}

	if (sourceLayer === "place") {
		const filterJson = getFilterJson(layer);
		if (
			filterJson.includes('["get","class"],"country"') ||
			filterJson.includes('["get","class"],"continent"')
		) {
			return "countries";
		}
		if (filterJson.includes('["get","class"],"state"')) {
			return "regions";
		}
		return "cities";
	}

	return null;
}

function stripTextFromLayer(layer: StyleLayer): StyleLayer | null {
	if (hasIconImage(layer)) {
		delete layer.layout?.["text-field"];
		return layer;
	}

	return null;
}

function applyTextLabelSettings(layers: StyleLayer[], settings: MapSettings): StyleLayer[] {
	const sanitizedLayers: StyleLayer[] = [];

	for (const layer of layers) {
		if (!hasTextField(layer)) {
			sanitizedLayers.push(layer);
			continue;
		}

		const category = getTextLabelCategory(layer);
		const categoryEnabled = category === null || settings.textLabels[category];
		if (settings.showTextLabels && categoryEnabled) {
			sanitizedLayers.push(layer);
			continue;
		}

		const iconOnlyLayer = stripTextFromLayer(layer);
		if (iconOnlyLayer) {
			sanitizedLayers.push(iconOnlyLayer);
		}
	}

	return sanitizedLayers;
}

function getAllowedBoundaryLevels(settings: MapSettings): number[] {
	const allowedLevels: number[] = [];
	if (settings.mapLayers.countryBorders) {
		allowedLevels.push(...COUNTRY_ADMIN_LEVELS);
	}
	if (settings.mapLayers.stateBorders) {
		allowedLevels.push(...STATE_ADMIN_LEVELS);
	}
	if (settings.mapLayers.countyBorders) {
		allowedLevels.push(...COUNTY_ADMIN_LEVELS);
	}
	return allowedLevels;
}

function excludeMaritimeBoundaries(layer: StyleLayer): void {
	if (getFilterJson(layer).includes('"maritime"')) {
		return;
	}

	const maritimeClause = ["!=", ["get", "maritime"], 1];
	layer.filter = layer.filter ? ["all", layer.filter, maritimeClause] : maritimeClause;
}

function applyBoundarySettings(layers: StyleLayer[], settings: MapSettings): StyleLayer[] {
	const allowedLevels = getAllowedBoundaryLevels(settings);
	const allBordersEnabled =
		allowedLevels.length ===
		COUNTRY_ADMIN_LEVELS.length + STATE_ADMIN_LEVELS.length + COUNTY_ADMIN_LEVELS.length;

	const sanitizedLayers: StyleLayer[] = [];

	for (const layer of layers) {
		if (getSourceLayer(layer) !== "boundary" || layer.type !== "line") {
			sanitizedLayers.push(layer);
			continue;
		}

		if (allowedLevels.length === 0) {
			continue;
		}

		excludeMaritimeBoundaries(layer);

		if (!allBordersEnabled) {
			const levelClause = ["match", ["get", "admin_level"], allowedLevels, true, false];
			layer.filter = layer.filter ? ["all", layer.filter, levelClause] : levelClause;
		}

		sanitizedLayers.push(layer);
	}

	return sanitizedLayers;
}

function applyRoadLayerSetting(layers: StyleLayer[], settings: MapSettings): StyleLayer[] {
	if (settings.mapLayers.roads) {
		return layers;
	}

	return layers.filter((layer) => !isRoadNetworkLayer(layer));
}

function applyCapitalMarkerSetting(layers: StyleLayer[], settings: MapSettings): void {
	if (settings.mapLayers.capitalMarkers) {
		return;
	}

	for (const layer of layers) {
		if (getSourceLayer(layer) === "place" && hasIconImage(layer)) {
			delete layer.layout?.["icon-image"];
		}
	}
}

export function sanitizeMapStyle(
	style: StyleSpecification,
	settings: MapSettings,
): StyleSpecification {
	if (!Array.isArray(style.layers)) {
		return style;
	}

	let layers = (style.layers as StyleLayer[]).filter(
		(layer) => !isFerryLayer(layer) && !isRouteShieldLayer(layer),
	);

	layers = applyBoundarySettings(layers, settings);
	layers = applyRoadLayerSetting(layers, settings);
	applyCapitalMarkerSetting(layers, settings);
	layers = applyTextLabelSettings(layers, settings);

	style.layers = layers as StyleSpecification["layers"];

	return style;
}
