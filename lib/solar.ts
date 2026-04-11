import SunCalc from "suncalc";

export interface SunPosition {
  altitude: number; // radians
  azimuth: number; // radians
}

export function getSunPosition(
  lat: number,
  lng: number,
  date: Date
): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lng);
  return {
    altitude: pos.altitude,
    azimuth: pos.azimuth,
  };
}

/**
 * Calculate shadow length multiplier based on sun altitude.
 * Returns how many times the object height the shadow extends.
 */
export function getShadowLength(altitudeRad: number): number {
  if (altitudeRad <= 0) return Infinity; // Sun below horizon
  return 1 / Math.tan(altitudeRad);
}

/**
 * Calculate shadow direction (opposite of sun azimuth).
 * Returns angle in radians from north, clockwise.
 */
export function getShadowDirection(azimuthRad: number): number {
  return azimuthRad + Math.PI;
}

/**
 * Estimate annual power generation.
 * @param panelCount Number of panels
 * @param panelWattage Wattage per panel in W
 * @param annualRadiation Total annual solar radiation in kWh/m2
 * @param panelEfficiency Panel efficiency (0-1)
 * @param panelAreaM2 Area of each panel in m2
 * @param shadingLoss Estimated shading loss factor (0-1, where 0 = no loss)
 */
export function estimateAnnualPower(
  panelCount: number,
  panelWattage: number,
  annualRadiation: number,
  panelEfficiency: number,
  panelAreaM2: number,
  shadingLoss: number = 0.1
): number {
  // Method: Total panel area * radiation * efficiency * (1 - shading loss)
  // This gives kWh per year
  const totalArea = panelCount * panelAreaM2;
  return totalArea * annualRadiation * panelEfficiency * (1 - shadingLoss);
}

/**
 * Estimate monthly power generation.
 */
export function estimateMonthlyPower(
  panelCount: number,
  panelWattage: number,
  monthlyRadiationKwhM2: number,
  panelEfficiency: number,
  panelAreaM2: number,
  shadingLoss: number = 0.1
): number {
  const totalArea = panelCount * panelAreaM2;
  return totalArea * monthlyRadiationKwhM2 * panelEfficiency * (1 - shadingLoss);
}

/**
 * Estimate CO2 savings in kg.
 * UK grid average: ~0.233 kg CO2/kWh (2023 figure)
 */
export function estimateCO2Savings(annualKwh: number): number {
  return annualKwh * 0.233;
}
