import { Map as MapLibreMap } from "maplibre-gl";
import { MapMarker } from "./types";

const MARKER_LABEL_OFFSET_IN_PX = 12;

export class MarkerLabelOverlay {
	private map: MapLibreMap | null = null;
	private containerEl: HTMLElement;
	private labelElementsByIndex = new globalThis.Map<number, HTMLElement>();
	private markers: MapMarker[] = [];
	private showLabels = false;

	constructor(parentEl: HTMLElement) {
		this.containerEl = parentEl.createDiv("mapx-marker-labels");
	}

	setMap(map: MapLibreMap | null): void {
		if (this.map) {
			this.map.off("move", this.repositionLabels);
			this.map.off("zoom", this.repositionLabels);
			this.map.off("rotate", this.repositionLabels);
			this.map.off("pitch", this.repositionLabels);
			this.map.off("resize", this.repositionLabels);
			this.map.off("load", this.repositionLabels);
			this.map.off("render", this.repositionLabels);
		}

		this.map = map;

		if (map) {
			map.on("move", this.repositionLabels);
			map.on("zoom", this.repositionLabels);
			map.on("rotate", this.repositionLabels);
			map.on("pitch", this.repositionLabels);
			map.on("resize", this.repositionLabels);
			map.on("load", this.repositionLabels);
			map.on("render", this.repositionLabels);
			this.repositionLabels();
		}
	}

	setShowLabels(showLabels: boolean): void {
		this.showLabels = showLabels;
		this.containerEl.style.display = showLabels ? "block" : "none";
		this.repositionLabels();
	}

	update(markers: MapMarker[]): void {
		this.markers = markers;
		this.syncLabelElements();
		this.repositionLabels();
	}

	destroy(): void {
		this.setMap(null);
		this.labelElementsByIndex.clear();
		this.containerEl.remove();
	}

	private syncLabelElements(): void {
		const activeMarkerIndexes = new Set<number>();

		for (const [markerIndex, markerData] of this.markers.entries()) {
			activeMarkerIndexes.add(markerIndex);

			let labelElement = this.labelElementsByIndex.get(markerIndex);
			if (!labelElement) {
				labelElement = this.containerEl.createDiv("mapx-marker-label");
				this.labelElementsByIndex.set(markerIndex, labelElement);
			}

			labelElement.textContent = markerData.entry.file.basename;
		}

		for (const [markerIndex, labelElement] of this.labelElementsByIndex.entries()) {
			if (!activeMarkerIndexes.has(markerIndex)) {
				labelElement.remove();
				this.labelElementsByIndex.delete(markerIndex);
			}
		}
	}

	private repositionLabels = (): void => {
		if (!this.map || !this.showLabels) {
			return;
		}

		for (const [markerIndex, labelElement] of this.labelElementsByIndex.entries()) {
			const maybeMarkerData = this.markers.at(markerIndex);
			if (!maybeMarkerData) {
				continue;
			}

			const [latitude, longitude] = maybeMarkerData.coordinates;
			const screenPoint = this.map.project([longitude, latitude]);

			labelElement.style.left = `${screenPoint.x}px`;
			labelElement.style.top = `${screenPoint.y + MARKER_LABEL_OFFSET_IN_PX}px`;
		}
	};
}
