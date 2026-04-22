export interface PanelType {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  widthM: number;
  heightM: number;
  wattage: number;
  efficiency: number;
}

export const PANEL_TYPES: PanelType[] = [
  {
    id: "sunpower-maxeon6",
    name: "SunPower Maxeon 6 (440W)",
    manufacturer: "SunPower",
    model: "Maxeon 6",
    widthM: 1.046,
    heightM: 1.690,
    wattage: 440,
    efficiency: 0.228,
  },
  {
    id: "canadian-hihero",
    name: "Canadian Solar HiHero (460W)",
    manufacturer: "Canadian Solar",
    model: "HiHero CS6R-460H-HE",
    widthM: 1.134,
    heightM: 1.722,
    wattage: 460,
    efficiency: 0.235,
  },
  {
    id: "ja-deepblue",
    name: "JA Solar DeepBlue 4.0 (425W)",
    manufacturer: "JA Solar",
    model: "DeepBlue 4.0 JAM72S30-425",
    widthM: 1.134,
    heightM: 1.722,
    wattage: 425,
    efficiency: 0.217,
  },
  {
    id: "rec-alpha",
    name: "REC Alpha Pure-R (430W)",
    manufacturer: "REC",
    model: "Alpha Pure-R REC430AA",
    widthM: 1.016,
    heightM: 1.821,
    wattage: 430,
    efficiency: 0.232,
  },
  {
    id: "longi-himo",
    name: "Longi Hi-MO X6 (450W)",
    manufacturer: "Longi",
    model: "Hi-MO X6 LR5-54HTH-450M",
    widthM: 1.134,
    heightM: 1.722,
    wattage: 450,
    efficiency: 0.230,
  },
];
