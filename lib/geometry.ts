/**
 * Geometry utilities for panel placement within roof polygons.
 */

export interface Point {
  lat: number;
  lng: number;
}

// Local cartesian point in meters
interface Vec2 {
  x: number;
  y: number;
}

export interface PanelRect {
  id: string;
  center: Point;
  widthDeg: number;
  heightDeg: number;
  widthM: number;
  heightM: number;
  rotationDeg: number;
  roofFaceId: string;
  // Pre-computed rotated corners in lat/lng for rendering
  corners: [Point, Point, Point, Point];
}

export interface RoofFace {
  id: string;
  vertices: Point[];
  pitchDeg: number;
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

export function degreesToMetersLat(degrees: number): number {
  return degrees * 111320;
}

export function degreesToMetersLng(degrees: number, lat: number): number {
  return degrees * 111320 * Math.cos((lat * Math.PI) / 180);
}

/**
 * Convert lat/lng polygon to local meter coordinates relative to centroid.
 */
function toLocal(polygon: Point[]): { points: Vec2[]; origin: Point } {
  const origin = {
    lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length,
    lng: polygon.reduce((s, p) => s + p.lng, 0) / polygon.length,
  };
  const points = polygon.map((p) => ({
    x: degreesToMetersLng(p.lng - origin.lng, origin.lat),
    y: degreesToMetersLat(p.lat - origin.lat),
  }));
  return { points, origin };
}

/**
 * Convert local meter coordinates back to lat/lng.
 */
function toGlobal(point: Vec2, origin: Point): Point {
  return {
    lat: origin.lat + metersToDegreesLat(point.y),
    lng: origin.lng + metersToDegreesLng(point.x, origin.lat),
  };
}

/**
 * Check if a point is inside a polygon (2D, local coordinates).
 */
function pointInPoly2D(px: number, py: number, poly: Vec2[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Rotate a point around the origin by angle (radians).
 */
function rotate(p: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/**
 * Get the four corners of a rotated rectangle in local coordinates.
 */
function rectCorners(cx: number, cy: number, hw: number, hh: number, angle: number): Vec2[] {
  const corners: Vec2[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];
  return corners.map((c) => {
    const r = rotate(c, angle);
    return { x: cx + r.x, y: cy + r.y };
  });
}

/**
 * Check if all four corners of a rotated rectangle are inside the polygon.
 */
function rotatedRectInsidePoly(
  cx: number, cy: number, hw: number, hh: number, angle: number, poly: Vec2[]
): boolean {
  const corners = rectCorners(cx, cy, hw, hh, angle);
  return corners.every((c) => pointInPoly2D(c.x, c.y, poly));
}

/**
 * Inset a polygon by a given distance in meters (in local coordinates).
 */
function insetPoly(poly: Vec2[], insetM: number): Vec2[] {
  if (poly.length < 3 || insetM <= 0) return poly;

  const n = poly.length;

  // Compute signed area to determine winding
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  const sign = area > 0 ? 1 : -1; // CCW = positive

  // For each edge, compute the inward-offset line
  const offsetEdges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) continue;
    // Inward normal
    const nx = -sign * dy / len;
    const ny = sign * dx / len;
    offsetEdges.push({
      x1: a.x + nx * insetM,
      y1: a.y + ny * insetM,
      x2: b.x + nx * insetM,
      y2: b.y + ny * insetM,
    });
  }

  if (offsetEdges.length < 3) return poly;

  const result: Vec2[] = [];
  for (let i = 0; i < offsetEdges.length; i++) {
    const e1 = offsetEdges[i];
    const e2 = offsetEdges[(i + 1) % offsetEdges.length];
    const pt = lineIntersect(e1.x1, e1.y1, e1.x2, e1.y2, e2.x1, e2.y1, e2.x2, e2.y2);
    if (pt) result.push(pt);
  }

  return result.length >= 3 ? result : poly;
}

function lineIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): Vec2 | null {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

/**
 * Find the dominant orientation of a roof polygon.
 * Returns the angle (radians) of the longest edge.
 */
function dominantEdgeAngle(poly: Vec2[]): number {
  let longestLen = 0;
  let longestAngle = 0;

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > longestLen) {
      longestLen = len;
      longestAngle = Math.atan2(dy, dx);
    }
  }

  return longestAngle;
}

/**
 * Auto-place panels aligned with the roof's dominant edge orientation.
 * Works entirely in local meter coordinates, then converts back to lat/lng.
 */
export function autoPlacePanels(
  roofFace: RoofFace,
  panelWidthM: number,
  panelHeightM: number,
  gapM: number = 0.02,
  edgeClearanceM: number = 0.15
): PanelRect[] {
  const { vertices, pitchDeg, id: roofFaceId } = roofFace;
  if (vertices.length < 3) return [];

  const { points: polyLocal, origin } = toLocal(vertices);

  // Inset for edge clearance
  const innerPoly = insetPoly(polyLocal, edgeClearanceM);
  if (innerPoly.length < 3) return [];

  // Roof pitch foreshortening
  const cosPitch = Math.cos((pitchDeg * Math.PI) / 180);

  // Find roof orientation
  const roofAngle = dominantEdgeAngle(innerPoly);

  // Try the roof angle and roof angle + 90° (panels can run along or across the ridge)
  const anglesToTry = [roofAngle, roofAngle + Math.PI / 2];

  // Try portrait and landscape for each angle
  const configs: { angle: number; fw: number; fh: number; aw: number; ah: number }[] = [];
  for (const angle of anglesToTry) {
    // Portrait: width along the roof edge, height (foreshortened) perpendicular
    configs.push({ angle, fw: panelWidthM, fh: panelHeightM * cosPitch, aw: panelWidthM, ah: panelHeightM });
    // Landscape: height along the roof edge, width (foreshortened) perpendicular
    configs.push({ angle, fw: panelHeightM, fh: panelWidthM * cosPitch, aw: panelHeightM, ah: panelWidthM });
  }

  let bestPanels: PanelRect[] = [];

  for (const { angle, fw, fh, aw, ah } of configs) {
    const halfW = fw / 2;
    const halfH = fh / 2;
    const stepX = fw + gapM;
    const stepY = fh + gapM;

    // Rotate inner polygon into the grid's local frame to find bounding box
    const negAngle = -angle;
    const rotatedPoly = innerPoly.map((p) => rotate(p, negAngle));
    const rxs = rotatedPoly.map((p) => p.x);
    const rys = rotatedPoly.map((p) => p.y);
    const minRx = Math.min(...rxs);
    const maxRx = Math.max(...rxs);
    const minRy = Math.min(...rys);
    const maxRy = Math.max(...rys);

    // Try a few grid origin offsets for best fit
    const offsets = 4;
    for (let oi = 0; oi < offsets; oi++) {
      for (let oj = 0; oj < offsets; oj++) {
        const startX = minRx + halfW + (stepX * oi) / offsets;
        const startY = minRy + halfH + (stepY * oj) / offsets;

        const trial: PanelRect[] = [];
        let id = 0;

        for (let gx = startX; gx <= maxRx - halfW; gx += stepX) {
          for (let gy = startY; gy <= maxRy - halfH; gy += stepY) {
            // Rotate grid position back to original coordinate system
            const center = rotate({ x: gx, y: gy }, angle);

            if (rotatedRectInsidePoly(center.x, center.y, halfW, halfH, angle, innerPoly)) {
              // Compute corners in global coordinates
              const localCorners = rectCorners(center.x, center.y, halfW, halfH, angle);
              const globalCorners = localCorners.map((c) => toGlobal(c, origin)) as [Point, Point, Point, Point];
              const globalCenter = toGlobal(center, origin);

              trial.push({
                id: `panel-${roofFaceId}-${id++}`,
                center: globalCenter,
                widthDeg: metersToDegreesLng(fw, origin.lat),
                heightDeg: metersToDegreesLat(fh),
                widthM: aw,
                heightM: ah,
                rotationDeg: (angle * 180) / Math.PI,
                roofFaceId,
                corners: globalCorners,
              });
            }
          }
        }

        if (trial.length > bestPanels.length) {
          bestPanels = trial;
        }
      }
    }
  }

  return bestPanels;
}

/**
 * Recompute corners for a panel after it has been moved.
 */
export function recomputePanelCorners(panel: PanelRect): PanelRect {
  const angleRad = (panel.rotationDeg * Math.PI) / 180;
  const hw = panel.widthM / 2;
  const hh = panel.heightM / 2;

  // We need to work in local meters from the panel center
  const localCorners: Vec2[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];

  const corners = localCorners.map((c) => {
    const r = rotate(c, angleRad);
    return {
      lat: panel.center.lat + metersToDegreesLat(r.y),
      lng: panel.center.lng + metersToDegreesLng(r.x, panel.center.lat),
    };
  }) as [Point, Point, Point, Point];

  return { ...panel, corners };
}

/**
 * Auto-place panels across all roof faces.
 */
export function autoPlaceAllFaces(
  roofFaces: RoofFace[],
  panelWidthM: number,
  panelHeightM: number
): PanelRect[] {
  const allPanels: PanelRect[] = [];
  for (const face of roofFaces) {
    allPanels.push(...autoPlacePanels(face, panelWidthM, panelHeightM));
  }
  return allPanels.map((p, i) => ({ ...p, id: `panel-${i}` }));
}

// Re-export for backward compat
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
