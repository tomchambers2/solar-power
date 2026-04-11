export interface PanelType {
  id: string;
  name: string;
  widthM: number;
  heightM: number;
  wattage: number;
  efficiency: number;
}

export const PANEL_TYPES: PanelType[] = [
  {
    id: "standard",
    name: "Standard (400W)",
    widthM: 1.0,
    heightM: 1.7,
    wattage: 400,
    efficiency: 0.2,
  },
  {
    id: "high-efficiency",
    name: "High-Efficiency (450W)",
    widthM: 1.0,
    heightM: 1.7,
    wattage: 450,
    efficiency: 0.22,
  },
  {
    id: "compact",
    name: "Compact (300W)",
    widthM: 0.8,
    heightM: 1.3,
    wattage: 300,
    efficiency: 0.19,
  },
];
