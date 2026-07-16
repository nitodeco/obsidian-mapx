import { App, BasesEntry, BasesPropertyId, ListValue, Value } from "obsidian";
import { Popup, Map } from "maplibre-gl";

const MAX_PREVIEW_LENGTH = 220;

export class PopupManager {
	private map: Map | null = null;
	private sharedPopup: Popup | null = null;
	private popupHideTimeout: number | null = null;
	private popupHideTimeoutWin: Window | null = null;
	private containerEl: HTMLElement;
	private app: App;
	private isPopupPinned = false;
	private popupRequestId = 0;

	constructor(containerEl: HTMLElement, app: App) {
		this.containerEl = containerEl;
		this.app = app;
	}

	setMap(map: Map | null): void {
		this.map = map;
	}

	showPopup(
		entry: BasesEntry,
		coordinates: [number, number],
		properties: BasesPropertyId[],
		coordinatesProp: BasesPropertyId | null,
		markerIconProp: BasesPropertyId | null,
		markerColorProp: BasesPropertyId | null,
		getDisplayName: (prop: BasesPropertyId) => string,
		isPinned = false,
	): void {
		if (!this.map) return;

		this.clearPopupHideTimeout();
		this.isPopupPinned = isPinned;
		const popupRequestId = ++this.popupRequestId;

		if (!this.sharedPopup) {
			const sharedPopup = (this.sharedPopup = new Popup({
				closeButton: false,
				closeOnClick: false,
				offset: 25,
			}));

			sharedPopup.on("open", () => {
				const popupEl = sharedPopup.getElement();
				if (popupEl) {
					popupEl.addEventListener("mouseenter", () => {
						this.clearPopupHideTimeout();
					});
					popupEl.addEventListener("mouseleave", () => {
						this.hidePopup();
					});
				}
			});
		}

		const [lat, lng] = coordinates;
		const popupContent = this.createPopupContent(
			entry,
			properties,
			coordinatesProp,
			markerIconProp,
			markerColorProp,
			getDisplayName,
			popupRequestId,
		);
		this.sharedPopup.setDOMContent(popupContent).setLngLat([lng, lat]).addTo(this.map);
	}

	hidePopup(): void {
		if (this.isPopupPinned) {
			return;
		}

		this.clearPopupHideTimeout();

		const win = (this.popupHideTimeoutWin = this.containerEl.win);
		this.popupHideTimeout = win.setTimeout(() => {
			if (this.sharedPopup) {
				this.sharedPopup.remove();
			}
			this.popupHideTimeout = null;
			this.popupHideTimeoutWin = null;
		}, 150); // Small delay to allow moving to popup
	}

	clearPopupHideTimeout(): void {
		if (this.popupHideTimeout) {
			const win = this.popupHideTimeoutWin || this.containerEl.win;
			win.clearTimeout(this.popupHideTimeout);
		}

		this.popupHideTimeoutWin = null;
		this.popupHideTimeout = null;
	}

	destroy(): void {
		this.clearPopupHideTimeout();
		this.isPopupPinned = false;
		if (this.sharedPopup) {
			this.sharedPopup.remove();
			this.sharedPopup = null;
		}
	}

	private createPopupContent(
		entry: BasesEntry,
		properties: BasesPropertyId[],
		coordinatesProp: BasesPropertyId | null,
		markerIconProp: BasesPropertyId | null,
		markerColorProp: BasesPropertyId | null,
		getDisplayName: (prop: BasesPropertyId) => string,
		popupRequestId: number,
	): HTMLElement {
		const containerEl = createDiv("bases-map-popup");

		const propertiesSlice = properties.slice(0, 20);
		const propertiesWithValues = [];

		for (const prop of propertiesSlice) {
			if (
				prop === coordinatesProp ||
				prop === markerIconProp ||
				prop === markerColorProp ||
				this.isAddressProperty(prop, getDisplayName)
			)
				continue;

			try {
				const value = entry.getValue(prop);
				if (value && this.hasNonEmptyValue(value)) {
					propertiesWithValues.push({ prop, value });
				}
			} catch {
				// Skip properties that can't be rendered
			}
		}

		const titleEl = containerEl.createDiv("bases-map-popup-title");
		const titleLinkEl = titleEl.createEl("a", {
			href: entry.file.path,
			cls: "internal-link",
		});

		if (propertiesWithValues.length > 0) {
			const [firstProperty, ...remainingProperties] = propertiesWithValues;
			firstProperty.value.renderTo(titleLinkEl, this.app.renderContext);

			if (remainingProperties.length > 0) {
				const propContainerEl = containerEl.createDiv("bases-map-popup-properties");
				for (const { prop, value } of remainingProperties) {
					const propEl = propContainerEl.createDiv("bases-map-popup-property");
					const labelEl = propEl.createDiv("bases-map-popup-property-label");
					labelEl.textContent = getDisplayName(prop);
					const valueEl = propEl.createDiv("bases-map-popup-property-value");
					value.renderTo(valueEl, this.app.renderContext);
				}
			}
		} else {
			titleLinkEl.textContent = entry.file.basename;
		}

		const previewEl = containerEl.createDiv("bases-map-popup-preview");
		void this.updatePopupPreview(previewEl, entry, popupRequestId);

		const actionsEl = containerEl.createDiv("bases-map-popup-actions");
		actionsEl
			.createEl("button", {
				cls: "mod-cta",
				text: "Open",
			})
			.addEventListener("click", () => {
				void this.app.workspace.openLinkText(entry.file.path, "", false);
			});

		return containerEl;
	}

	private isAddressProperty(
		prop: BasesPropertyId,
		getDisplayName: (prop: BasesPropertyId) => string,
	): boolean {
		const displayName = getDisplayName(prop).trim().toLowerCase();
		const propertyName = prop.split(".").at(-1)?.trim().toLowerCase();

		return displayName === "address" || propertyName === "address";
	}

	private async updatePopupPreview(
		previewEl: HTMLElement,
		entry: BasesEntry,
		popupRequestId: number,
	): Promise<void> {
		try {
			const fileText = await this.app.vault.cachedRead(entry.file);
			if (this.popupRequestId !== popupRequestId) {
				return;
			}

			const previewText = this.getPreviewText(fileText);
			if (!previewText) {
				previewEl.remove();
				return;
			}

			previewEl.textContent = previewText;
		} catch {
			previewEl.remove();
		}
	}

	private getPreviewText(fileText: string): string {
		const previewText = fileText
			.replace(/^---\s*[\s\S]*?\n---\s*/, "")
			.replace(/```[\s\S]*?```/g, " ")
			.replace(/!\[\[[^\]]+\]\]/g, " ")
			.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
			.replace(/\[\[([^\]]+)\]\]/g, "$1")
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replace(/[#*_`>~-]/g, "")
			.replace(/\s+/g, " ")
			.trim();

		if (previewText.length <= MAX_PREVIEW_LENGTH) {
			return previewText;
		}

		return `${previewText.slice(0, MAX_PREVIEW_LENGTH - 3).trimEnd()}...`;
	}

	private hasNonEmptyValue(value: Value): boolean {
		if (!value || !value.isTruthy()) return false;

		// Handle ListValue - check if it has any non-empty items
		if (value instanceof ListValue) {
			for (let i = 0; i < value.length(); i++) {
				const item = value.get(i);
				if (item && this.hasNonEmptyValue(item)) {
					return true;
				}
			}
			return false;
		}

		return true;
	}
}
