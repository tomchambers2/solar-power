/**
 * Geometry utilities for panel placement within roof polygons.
 */

export interface Point {
  lat: number;
  lng: number;
}

export interface PanelRect {
  id: string;
  center: Point;
  widthDeg: number;
  heightDeg: number;
  rotationDeg: number;
}

/**
 * Convert meters to approximate degrees at a given latitude.
 */
export function metersToDegreesLat(meters: number): number {
  return meters / 111320;
}

export function metersToDegreesLng(meters: number, lat: number): number {
  return meters / (111320 * Math.cos((lat * Math.PI) / 180));
}

/**
 * Check if a point is inside a polygon using ray casting.
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if all four corners of a panel rectangle are inside the polygon.
 */
function panelInsidePolygon(
  center: Point,
  halfW: number,
  halfH: number,
  polygon: Point[]
): boolean {
  const corners: Point[] = [
    { lat: center.lat - halfH, lng: center.lng - halfW },
    { lat: center.lat - halfH, lng: center.lng + halfW },
    { lat: center.lat + halfH, lng: center.lng - halfW },
    { lat: center.lat + halfH, lng: center.lng + halfW },
  ];
  return corners.every((c) => pointInPolygon(c, polygon));
}

/**
 * Auto-place panels in a grid within the roof polygon.
 * Panels are oriented south-facing (portrait, long side E-W in northern hemisphere).
 */
export function autoPlacePanels(
  polygon: Point[],
  panelWidthM: number,
  panelHeightM: number,
  gapM: number = 0.3
): PanelRect[] {
  if (polygon.length < 3) return [];

  // Find bounding box
  const lats = polygon.map((p) => p.lat);
  const lngs = polygon.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const centerLat = (minLat + maxLat) / 2;

  // Convert panel dimensions + gap to degrees
  const stepLatDeg = metersToDegreesLat(panelHeightM + gapM);
  const stepLngDeg = metersToDegreesLng(panelWidthM + gapM, centerLat);
  const halfWDeg = metersToDegreesLng(panelWidthM / 2, centerLat);
  const halfHDeg = metersToDegreesLat(panelHeightM / 2);

  const panels: PanelRect[] = [];
  let id = 0;

  for (let lat = minLat + halfHDeg; lat <= maxLat - halfHDeg; lat += stepLatDeg) {
    for (let lng = minLng + halfWDeg; lng <= maxLng - halfWDeg; lng += stepLngDeg) {
      const center: Point = { lat, lng };
      if (panelInsidePolygon(center, halfWDeg, halfHDeg, polygon)) {
        panels.push({
          id: `panel-${id++}`,
          center,
          widthDeg: halfWDeg * 2,
          heightDeg: halfHDeg * 2,
          rotationDeg: 0,
        });
      }
    }
  }

  return panels;
}
