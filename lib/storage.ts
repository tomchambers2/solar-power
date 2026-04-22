import { RoofFace, PanelRect } from "./geometry";

const STORAGE_KEY = "solar-power-data";

interface StoredData {
  roofFaces: RoofFace[];
  panels: PanelRect[];
  selectedPanelId: string;
}

export function saveToStorage(data: StoredData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadFromStorage(): StoredData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as StoredData;
}

export function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}
