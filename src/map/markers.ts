import { App, BasesEntry, BasesPropertyId, Menu, setIcon } from "obsidian";
import { Map, LngLatBounds, GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import { MapMarker, MapMarkerProperties } from "./types";
import { coordinateFromValue } from "./utils";
import { PopupManager } from "./popup";
import { MarkerLabelOverlay } from "./label-overlay";

const MARKER_PIN_LAYER_ID = "marker-pins";
const MARKER_CLICK_ZOOM = 14;
const MARKER_CLICK_MIN_DISTANCE_IN_PX = 64;
const MARKER_FLY_SPEED = 1.35;
const MARKER_FLY_CURVE = 1.42;
const MARKER_FLY_EXPONENT = 10;

export class MarkerManager {
	private map: Map | null = null;
	private app: App;
	private mapEl: HTMLElement;
	private markers: MapMarker[] = [];
	private bounds: LngLatBounds | null = null;
	private loadedIcons: Set<string> = new Set();
	private popupManager: PopupManager;
	private labelOverlay: MarkerLabelOverlay;
	private getData: () => any;
	private getMapConfig: () => any;
	private getDisplayName: (prop: BasesPropertyId) => string;
	private showTextLabels = false;
	private markerInteractionsInitialized = false;
	private isRestoringMarkerLayers = false;

	constructor(
		app: App,
		overlayContainerEl: HTMLElement,
		mapEl: HTMLElement,
		popupManager: PopupManager,
		getData: () => any,
		getMapConfig: () => any,
		getDisplayName: (prop: BasesPropertyId) => string,
	) {
		this.app = app;
		this.mapEl = mapEl;
		this.popupManager = popupManager;
		this.labelOverlay = new MarkerLabelOverlay(overlayContainerEl);
		this.getData = getData;
		this.getMapConfig = getMapConfig;
		this.getDisplayName = getDisplayName;
	}

	setMap(map: Map | null): void {
		if (this.map) {
			this.map.off("styledata", this.restoreMarkerLayersIfMissing);
			this.map.off("idle", this.restoreMarkerLayersIfMissing);
		}

		this.map = map;
		this.labelOverlay.setMap(map);

		if (map) {
			map.on("styledata", this.restoreMarkerLayersIfMissing);
			map.on("idle", this.restoreMarkerLayersIfMissing);
		} else {
			this.markerInteractionsInitialized = false;
		}
	}

	private restoreMarkerLayersIfMissing = (): void => {
		if (!this.map || this.isRestoringMarkerLayers) {
			return;
		}

		if (this.markers.length === 0 || this.map.getSource("markers")) {
			return;
		}

		this.isRestoringMarkerLayers = true;
		void this.updateMarkers(this.getData())
			.catch(() => {})
			.finally(() => {
				this.isRestoringMarkerLayers = false;
			});
	};

	setShowTextLabels(showTextLabels: boolean): void {
		this.showTextLabels = showTextLabels;
		this.labelOverlay.setShowLabels(showTextLabels);
		this.labelOverlay.update(this.markers);
	}

	getMarkers(): MapMarker[] {
		return this.markers;
	}

	getBounds(): LngLatBounds | null {
		return this.bounds;
	}

	clearLoadedIcons(): void {
		this.loadedIcons.clear();
	}

	async updateMarkers(data: { data: BasesEntry[] }): Promise<void> {
		const mapConfig = this.getMapConfig();
		if (!this.map || !data || !mapConfig || !mapConfig.coordinatesProp) {
			return;
		}

		const validMarkers: MapMarker[] = [];
		for (const entry of data.data) {
			if (!entry) continue;

			let coordinates: [number, number] | null = null;
			try {
				const value = entry.getValue(mapConfig.coordinatesProp);
				coordinates = coordinateFromValue(value);
			} catch (error) {
				console.error(`Error extracting coordinates for ${entry.file.name}:`, error);
			}

			if (coordinates) {
				validMarkers.push({
					entry,
					coordinates,
				});
			}
		}

		this.markers = validMarkers;

		const bounds = (this.bounds = new LngLatBounds());
		validMarkers.forEach((markerData) => {
			const [latitude, longitude] = markerData.coordinates;
			bounds.extend([longitude, latitude]);
		});

		this.labelOverlay.update(this.markers);

		const source = this.map.getSource("markers") as GeoJSONSource | undefined;
		if (!source && !this.isStyleReadyForSources()) {
			return;
		}

		await this.loadCustomIcons(validMarkers);
		const features = this.createGeoJSONFeatures(validMarkers);

		if (source) {
			source.setData({
				type: "FeatureCollection",
				features,
			});
		} else {
			this.map.addSource("markers", {
				type: "geojson",
				data: {
					type: "FeatureCollection",
					features,
				},
			});

			this.addPinLayer();
			if (!this.markerInteractionsInitialized) {
				this.setupMarkerInteractions();
				this.markerInteractionsInitialized = true;
			}
		}
	}

	private isStyleReadyForSources(): boolean {
		if (!this.map) {
			return false;
		}

		const styleInternals = this.map.style as unknown as { _loaded?: boolean };
		return styleInternals?._loaded === true;
	}

	private getCustomIcon(entry: BasesEntry): string | null {
		const mapConfig = this.getMapConfig();
		if (!mapConfig || !mapConfig.markerIconProp) return null;

		try {
			const value = entry.getValue(mapConfig.markerIconProp);
			if (!value || !value.isTruthy()) return null;

			const iconString = value.toString().trim();

			if (
				!iconString ||
				iconString.length === 0 ||
				iconString === "null" ||
				iconString === "undefined"
			) {
				return null;
			}

			return iconString;
		} catch (error) {
			console.warn(
				`Could not extract icon for ${entry.file.name}. The marker icon property should be a simple text value (e.g., "map", "star").`,
				error,
			);
			return null;
		}
	}

	private getCustomColor(entry: BasesEntry): string | null {
		const mapConfig = this.getMapConfig();
		if (!mapConfig || !mapConfig.markerColorProp) return null;

		try {
			const value = entry.getValue(mapConfig.markerColorProp);
			if (!value || !value.isTruthy()) return null;

			const colorString = value.toString().trim();
			return colorString;
		} catch {
			console.warn(
				`Could not extract color for ${entry.file.name}. The marker color property should be a simple text value (e.g., "#ff0000", "red", "var(--color-accent)").`,
			);
			return null;
		}
	}

	private async loadCustomIcons(markers: MapMarker[]): Promise<void> {
		if (!this.map) return;

		const compositeImagesToLoad: Array<{ icon: string | null; color: string }> = [];
		const uniqueKeys = new Set<string>();

		for (const markerData of markers) {
			const icon = this.getCustomIcon(markerData.entry);
			const color =
				this.getCustomColor(markerData.entry) || "var(--bases-map-marker-background)";
			const compositeKey = this.getCompositeImageKey(icon, color);

			if (!this.loadedIcons.has(compositeKey)) {
				if (!uniqueKeys.has(compositeKey)) {
					compositeImagesToLoad.push({ icon, color });
					uniqueKeys.add(compositeKey);
				}
			}
		}

		for (const { icon, color } of compositeImagesToLoad) {
			try {
				const compositeKey = this.getCompositeImageKey(icon, color);
				const image = await this.createCompositeMarkerImage(icon, color);

				if (this.map) {
					if (this.map.hasImage(compositeKey)) {
						this.map.removeImage(compositeKey);
					}
					this.map.addImage(compositeKey, image);
					this.loadedIcons.add(compositeKey);
				}
			} catch (error) {
				console.warn(`Failed to create composite marker for icon ${icon}:`, error);
			}
		}
	}

	private getCompositeImageKey(icon: string | null, color: string): string {
		return `marker-${icon || "dot"}-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
	}

	private resolveColor(color: string): string {
		const tempElement = document.createElement("div");
		tempElement.style.color = color;
		tempElement.style.display = "none";
		document.body.appendChild(tempElement);

		const computedColor = getComputedStyle(tempElement).color;
		tempElement.remove();

		return computedColor;
	}

	private async createCompositeMarkerImage(
		icon: string | null,
		color: string,
	): Promise<HTMLImageElement> {
		const resolvedColor = this.resolveColor(color);
		const resolvedIconColor = this.resolveColor("var(--bases-map-marker-icon-color)");

		const scale = 4;
		const size = 48 * scale;
		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		const context = canvas.getContext("2d");

		if (!context) {
			throw new Error("Failed to get canvas context");
		}

		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = "high";

		const centerX = size / 2;
		const centerY = size / 2;
		const radius = 12 * scale;

		context.fillStyle = resolvedColor;
		context.beginPath();
		context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
		context.fill();

		context.strokeStyle = "rgba(255, 255, 255, 0.3)";
		context.lineWidth = 1 * scale;
		context.stroke();

		if (icon) {
			const iconDiv = createDiv();
			setIcon(iconDiv, icon);
			const svgElement = iconDiv.querySelector("svg");

			if (svgElement) {
				svgElement.setAttribute("stroke", "currentColor");
				svgElement.setAttribute("fill", "none");
				svgElement.setAttribute("stroke-width", "2");
				svgElement.style.color = resolvedIconColor;

				const svgString = new XMLSerializer().serializeToString(svgElement);
				const iconImage = new Image();
				iconImage.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);

				await new Promise<void>((resolve, reject) => {
					iconImage.onload = () => {
						const iconSize = radius * 1.2;
						context.drawImage(
							iconImage,
							centerX - iconSize / 2,
							centerY - iconSize / 2,
							iconSize,
							iconSize,
						);
						resolve();
					};
					iconImage.onerror = reject;
				});
			} else {
				this.drawMarkerDot(context, centerX, centerY, scale, resolvedIconColor);
			}
		} else {
			this.drawMarkerDot(context, centerX, centerY, scale, resolvedIconColor);
		}

		return new Promise((resolve, reject) => {
			canvas.toBlob((blob) => {
				if (!blob) {
					reject(new Error("Failed to create image blob"));
					return;
				}

				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = reject;
				image.src = URL.createObjectURL(blob);
			});
		});
	}

	private drawMarkerDot(
		context: CanvasRenderingContext2D,
		centerX: number,
		centerY: number,
		scale: number,
		color: string,
	): void {
		const dotRadius = 4 * scale;
		context.fillStyle = color;
		context.beginPath();
		context.arc(centerX, centerY, dotRadius, 0, 2 * Math.PI);
		context.fill();
	}

	private createGeoJSONFeatures(markers: MapMarker[]): GeoJSON.Feature[] {
		return markers.map((markerData, index) => {
			const [latitude, longitude] = markerData.coordinates;
			const icon = this.getCustomIcon(markerData.entry);
			const color =
				this.getCustomColor(markerData.entry) || "var(--bases-map-marker-background)";
			const compositeKey = this.getCompositeImageKey(icon, color);

			const properties: MapMarkerProperties = {
				entryIndex: index,
				icon: compositeKey,
				label: markerData.entry.file.basename,
			};

			return {
				type: "Feature",
				geometry: {
					type: "Point",
					coordinates: [longitude, latitude],
				},
				properties,
			};
		});
	}

	private addPinLayer(): void {
		if (!this.map || this.map.getLayer(MARKER_PIN_LAYER_ID)) {
			return;
		}

		this.map.addLayer({
			id: MARKER_PIN_LAYER_ID,
			type: "symbol",
			source: "markers",
			layout: {
				"icon-image": ["get", "icon"],
				"icon-size": [
					"interpolate",
					["linear"],
					["zoom"],
					0,
					0.12,
					4,
					0.18,
					14,
					0.22,
					18,
					0.24,
				],
				"icon-allow-overlap": true,
				"icon-ignore-placement": true,
				"icon-padding": 0,
			},
		});
	}

	private navigateToMarker(coordinates: [number, number]): void {
		if (!this.map) return;

		const [latitude, longitude] = coordinates;
		const currentZoom = this.map.getZoom();
		const targetZoom = Math.min(
			Math.max(currentZoom, MARKER_CLICK_ZOOM),
			this.map.getMaxZoom(),
		);
		const markerPoint = this.map.project([longitude, latitude]);
		const centerPoint = this.map.project(this.map.getCenter());
		const distanceFromCenterInPx = Math.hypot(
			markerPoint.x - centerPoint.x,
			markerPoint.y - centerPoint.y,
		);
		const hasReachedClickTarget =
			distanceFromCenterInPx <= MARKER_CLICK_MIN_DISTANCE_IN_PX && currentZoom >= targetZoom;

		if (hasReachedClickTarget) {
			return;
		}

		this.map.flyTo({
			center: [longitude, latitude],
			zoom: targetZoom,
			speed: MARKER_FLY_SPEED,
			curve: MARKER_FLY_CURVE,
			easing: (animationProgress) =>
				animationProgress === 1
					? 1
					: 1 - Math.pow(2, -MARKER_FLY_EXPONENT * animationProgress),
			essential: true,
		});
	}

	private handleMarkerSelection(event: MapLayerMouseEvent): void {
		if (!event.features || event.features.length === 0) return;

		const [maybeFeature] = event.features;
		const entryIndex = maybeFeature?.properties?.entryIndex;
		if (entryIndex === undefined) {
			return;
		}

		const maybeMarkerData = this.markers.at(entryIndex);
		if (!maybeMarkerData) {
			return;
		}

		this.navigateToMarker(maybeMarkerData.coordinates);
		this.showMarkerPopup(maybeMarkerData, true);
	}

	private showMarkerPopup(markerData: MapMarker, isPinned: boolean): void {
		const data = this.getData();
		const mapConfig = this.getMapConfig();
		if (!data || !data.properties || !mapConfig) {
			return;
		}

		this.popupManager.showPopup(
			markerData.entry,
			markerData.coordinates,
			data.properties,
			mapConfig.coordinatesProp,
			mapConfig.markerIconProp,
			mapConfig.markerColorProp,
			this.getDisplayName,
			isPinned,
		);
	}

	private setupMarkerInteractions(): void {
		if (!this.map) return;

		this.map.on("mouseenter", MARKER_PIN_LAYER_ID, () => {
			if (this.map) this.map.getCanvas().style.cursor = "pointer";
		});

		this.map.on("mouseleave", MARKER_PIN_LAYER_ID, () => {
			if (this.map) this.map.getCanvas().style.cursor = "";
		});

		this.map.on("click", MARKER_PIN_LAYER_ID, (event: MapLayerMouseEvent) => {
			this.handleMarkerSelection(event);
		});

		this.map.on("mouseenter", MARKER_PIN_LAYER_ID, (event: MapLayerMouseEvent) => {
			if (!event.features || event.features.length === 0) return;
			const [maybeFeature] = event.features;
			const entryIndex = maybeFeature?.properties?.entryIndex;
			if (entryIndex !== undefined) {
				const maybeMarkerData = this.markers.at(entryIndex);
				if (maybeMarkerData) {
					this.showMarkerPopup(maybeMarkerData, false);
				}
			}
		});

		this.map.on("mouseleave", MARKER_PIN_LAYER_ID, () => {
			this.popupManager.hidePopup();
		});

		this.map.on("contextmenu", MARKER_PIN_LAYER_ID, (event: MapLayerMouseEvent) => {
			event.preventDefault();
			if (!event.features || event.features.length === 0) return;

			const feature = event.features[0];
			const entryIndex = feature.properties?.entryIndex;
			if (entryIndex !== undefined && this.markers[entryIndex]) {
				const markerData = this.markers[entryIndex];
				const [latitude, longitude] = markerData.coordinates;
				const file = markerData.entry.file;

				const menu = Menu.forEvent(event.originalEvent);
				this.app.workspace.handleLinkContextMenu(menu, file.path, "");

				menu.addItem((item) =>
					item
						.setSection("action")
						.setTitle("Copy coordinates")
						.setIcon("map-pin")
						.onClick(() => {
							const coordString = `${latitude}, ${longitude}`;
							void navigator.clipboard.writeText(coordString);
						}),
				);

				menu.addItem((item) =>
					item
						.setSection("danger")
						.setTitle("Delete file")
						.setIcon("trash-2")
						.setWarning(true)
						.onClick(() => this.app.fileManager.promptForDeletion(file)),
				);
			}
		});

		this.map.on("mouseover", MARKER_PIN_LAYER_ID, (event: MapLayerMouseEvent) => {
			if (!event.features || event.features.length === 0) return;
			const feature = event.features[0];
			const entryIndex = feature.properties?.entryIndex;
			if (entryIndex !== undefined && this.markers[entryIndex]) {
				const markerData = this.markers[entryIndex];
				this.app.workspace.trigger("hover-link", {
					event: event.originalEvent,
					source: "bases",
					hoverParent: this.app.renderContext,
					targetEl: this.mapEl,
					linktext: markerData.entry.file.path,
				});
			}
		});
	}

	destroy(): void {
		this.labelOverlay.destroy();
	}
}
