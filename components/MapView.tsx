"use client";

import { useCallback, useRef, useEffect } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Polygon,
  Marker,
} from "@react-google-maps/api";
import { Point, PanelRect, RoofFace, metersToDegreesLat, metersToDegreesLng } from "@/lib/geometry";
import { PanelType } from "@/lib/panels";
import { getSunPosition, getShadowLength, getShadowDirection } from "@/lib/solar";

const MAP_CONTAINER_STYLE = {
  width: "100%",
  height: "100%",
};

const DEFAULT_CENTER = { lat: 51.43259951423126, lng: -2.5754143683042474 };

interface MapViewProps {
  center: { lat: number; lng: number } | null;
  panelType: PanelType;
  roofFaces: RoofFace[];
  activeRoofFaceId: string | null;
  onRoofVertexAdd: (vertex: Point) => void;
  panels: PanelRect[];
  onPanelMove: (panelId: string, newCenter: Point) => void;
  isDrawing: boolean;
  month: number;
  hour: number;
}

export default function MapView({
  center,
  panelType,
  roofFaces,
  activeRoofFaceId,
  onRoofVertexAdd,
  panels,
  onPanelMove,
  isDrawing,
  month,
  hour,
}: MapViewProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places"],
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const panelOverlaysRef = useRef<google.maps.Polygon[]>([]);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Manage panel polygons as native Google Maps overlays for dragging
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear old overlays
    panelOverlaysRef.current.forEach((p) => p.setMap(null));
    panelOverlaysRef.current = [];

    const map = mapRef.current;

    panels.forEach((panel) => {
      const path = panel.corners.map((c) => ({ lat: c.lat, lng: c.lng }));

      const poly = new google.maps.Polygon({
        paths: path,
        map,
        draggable: true,
        editable: false,
        fillColor: "#1e3a5f",
        fillOpacity: 0.85,
        strokeColor: "#60a5fa",
        strokeOpacity: 1,
        strokeWeight: 1,
        zIndex: 10,
      });

      poly.addListener("dragend", () => {
        // Compute new center from the dragged polygon's path
        const newPath = poly.getPath();
        let sumLat = 0;
        let sumLng = 0;
        const len = newPath.getLength();
        for (let i = 0; i < len; i++) {
          const pt = newPath.getAt(i);
          sumLat += pt.lat();
          sumLng += pt.lng();
        }
        const newCenter: Point = {
          lat: sumLat / len,
          lng: sumLng / len,
        };
        onPanelMove(panel.id, newCenter);
      });

      panelOverlaysRef.current.push(poly);
    });

    return () => {
      panelOverlaysRef.current.forEach((p) => p.setMap(null));
      panelOverlaysRef.current = [];
    };
  }, [panels, onPanelMove]);

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <p className="text-red-500">
          Error loading Google Maps. Check your API key.
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Loading map...</p>
      </div>
    );
  }

  const mapCenter = center || DEFAULT_CENTER;

  // Calculate sun position for shadow rendering
  const date = new Date(2024, month, 15, hour, 0, 0);
  const sunPos = getSunPosition(mapCenter.lat, mapCenter.lng, date);
  const sunAboveHorizon = sunPos.altitude > 0;
  const shadowLenMultiplier = sunAboveHorizon
    ? Math.min(getShadowLength(sunPos.altitude), 10)
    : 0;
  const shadowDir = getShadowDirection(sunPos.azimuth);

  const handleMapClick = (e: google.maps.MapMouseEvent) => {
    if (!isDrawing || !e.latLng) return;
    const newVertex: Point = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };
    onRoofVertexAdd(newVertex);
  };

  // Shadow polygons for panels (offset each corner by shadow vector)
  const panelShadows: { id: string; path: Point[] }[] = [];
  if (sunAboveHorizon && shadowLenMultiplier > 0) {
    const panelHeightAboveRoof = 0.05;
    const shadowOffsetM = panelHeightAboveRoof * shadowLenMultiplier * 20;
    const shadowDx = Math.sin(shadowDir) * shadowOffsetM;
    const shadowDy = Math.cos(shadowDir) * shadowOffsetM;

    panels.forEach((panel) => {
      const dxDeg = metersToDegreesLng(shadowDx, panel.center.lat);
      const dyDeg = metersToDegreesLat(shadowDy);

      panelShadows.push({
        id: panel.id + "-shadow",
        path: panel.corners.map((c) => ({
          lat: c.lat + dyDeg,
          lng: c.lng + dxDeg,
        })),
      });
    });
  }

  // Roof face colors
  const faceColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER_STYLE}
      center={mapCenter}
      zoom={20}
      onLoad={onLoad}
      onClick={handleMapClick}
      options={{
        tilt: 0,
        mapTypeId: "satellite",
        mapTypeControl: false,
        streetViewControl: false,
      }}
    >
      {/* Roof face polygons */}
      {roofFaces.map((face, idx) => {
        const color = faceColors[idx % faceColors.length];
        const isActive = face.id === activeRoofFaceId;
        return face.vertices.length >= 3 ? (
          <Polygon
            key={face.id}
            paths={face.vertices}
            options={{
              fillColor: color,
              fillOpacity: isActive ? 0.25 : 0.1,
              strokeColor: color,
              strokeOpacity: isActive ? 1 : 0.6,
              strokeWeight: isActive ? 3 : 2,
            }}
          />
        ) : null;
      })}

      {/* Roof vertex markers for active face */}
      {roofFaces
        .filter((f) => f.id === activeRoofFaceId)
        .flatMap((face) =>
          face.vertices.map((v, i) => (
            <Marker
              key={`vertex-${face.id}-${i}`}
              position={v}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: faceColors[roofFaces.indexOf(face) % faceColors.length],
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              }}
            />
          ))
        )}

      {/* Shadow polygons */}
      {panelShadows.map((shadow) => (
        <Polygon
          key={shadow.id}
          paths={shadow.path}
          options={{
            fillColor: "#000000",
            fillOpacity: 0.3,
            strokeColor: "#000000",
            strokeOpacity: 0.2,
            strokeWeight: 0,
          }}
        />
      ))}

      {/* Panels are rendered as native Polygon overlays via useEffect for dragging */}
    </GoogleMap>
  );
}
