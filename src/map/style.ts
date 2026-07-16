import { App } from "obsidian";
import { StyleSpecification } from "maplibre-gl";
import { transformMapboxStyle } from "../mapbox-transform";
import { sanitizeMapStyle } from "./style-sanitizer";
import type { MapSettings, MapTheme } from "../settings";

const DEFAULT_LIGHT_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const DEFAULT_DARK_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
const OPENFREEMAP_GLYPHS_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

const PAIRED_STYLE_URLS: Record<string, string> = {
	[DEFAULT_LIGHT_STYLE_URL]: DEFAULT_DARK_STYLE_URL,
	[DEFAULT_DARK_STYLE_URL]: DEFAULT_LIGHT_STYLE_URL,
};

export class StyleManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	private isDarkMode(mapTheme: MapTheme): boolean {
		if (mapTheme === "dark") {
			return true;
		}
		if (mapTheme === "light") {
			return false;
		}
		return this.app.isDarkMode();
	}

	resolveIsDarkMode(mapTheme: MapTheme): boolean {
		return this.isDarkMode(mapTheme);
	}

	private resolveStyleUrl(styleUrl: string, isDark: boolean): string {
		const pairedStyleUrl = PAIRED_STYLE_URLS[styleUrl];
		if (!pairedStyleUrl) {
			return styleUrl;
		}

		const isLightStyleUrl = styleUrl === DEFAULT_LIGHT_STYLE_URL;
		const isDarkStyleUrl = styleUrl === DEFAULT_DARK_STYLE_URL;

		if (isDark && isLightStyleUrl) {
			return pairedStyleUrl;
		}

		if (!isDark && isDarkStyleUrl) {
			return pairedStyleUrl;
		}

		return styleUrl;
	}

	private resolveTileUrls(mapTiles: string[], mapTilesDark: string[], isDark: boolean): string[] {
		if (isDark && mapTilesDark.length > 0) {
			return mapTilesDark;
		}

		if (mapTiles.length > 0) {
			if (mapTiles.length === 1 && !this.isTileTemplateUrl(mapTiles[0])) {
				return [this.resolveStyleUrl(mapTiles[0], isDark)];
			}

			return mapTiles;
		}

		return [];
	}

	async getMapStyle(
		mapTiles: string[],
		mapTilesDark: string[],
		settings: MapSettings,
	): Promise<string | StyleSpecification> {
		const isDark = this.isDarkMode(settings.mapTheme);
		const tileUrls = this.resolveTileUrls(mapTiles, mapTilesDark, isDark);

		let styleUrl: string;
		if (tileUrls.length === 0) {
			styleUrl = isDark ? DEFAULT_DARK_STYLE_URL : DEFAULT_LIGHT_STYLE_URL;
		} else if (tileUrls.length === 1 && !this.isTileTemplateUrl(tileUrls[0])) {
			styleUrl = tileUrls[0];
		} else {
			styleUrl = "";
		}

		// Fetch style JSON for any style URL (default or custom) to avoid CORS issues
		if (styleUrl) {
			try {
				const response = await fetch(styleUrl);
				if (response.ok) {
					const styleJson = await response.json();
					// Extract access token from URL for Mapbox styles
					const accessTokenMatch = styleUrl.match(/access_token=([^&]+)/);
					const accessToken = accessTokenMatch ? accessTokenMatch[1] : "";
					// Transform mapbox:// protocol URLs to HTTPS URLs if needed
					const transformedStyle = accessToken
						? transformMapboxStyle(styleJson, accessToken)
						: styleJson;
					return sanitizeMapStyle(transformedStyle as StyleSpecification, settings);
				}
			} catch (error) {
				console.warn("Failed to fetch style JSON, falling back to URL:", error);
			}
			// If fetch fails, fall back to returning the URL directly
			return styleUrl;
		}

		// Create a custom style with the configured tile sources (raster tiles)
		const spec: StyleSpecification = {
			version: 8,
			glyphs: OPENFREEMAP_GLYPHS_URL,
			sources: {},
			layers: [],
		};
		tileUrls.forEach((tileUrl, index) => {
			const sourceId = `custom-tiles-${index}`;
			spec.sources[sourceId] = {
				type: "raster",
				tiles: [tileUrl],
				tileSize: 256,
			};

			spec.layers.push({
				id: `custom-layer-${index}`,
				type: "raster",
				source: sourceId,
			});
		});
		return spec;
	}

	private isTileTemplateUrl(url: string): boolean {
		// Check if the URL contains tile template placeholders
		return url.includes("{z}") || url.includes("{x}") || url.includes("{y}");
	}
}
