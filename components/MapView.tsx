"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Polygon,
  Rectangle,
  Marker,
} from "@react-google-maps/api";
import { Point, PanelRect, autoPlacePanels, metersToDegreesLat, metersToDegreesLng } from "@/lib/geometry";
import { PanelType } from "@/lib/panels";
import { getSunPosition, getShadowLength, getShadowDirection } from "@/lib/solar";

const MAP_CONTAINER_STYLE = {
  width: "100%",
  height: "100%",
};

const DEFAULT_CENTER = { lat: 51.4545, lng: -2.5879 }; // Bristol

interface MapViewProps {
  center: { lat: number; lng: number } | null;
  panelType: PanelType;
  roofVertices: Point[];
  onRoofVerticesChange: (vertices: Point[]) => void;
  panels: PanelRect[];
  onPanelsChange: (panels: PanelRect[]) => void;
  isDrawing: boolean;
  month: number;
  hour: number;
}

export default function MapView({
  center,
  panelType,
  roofVertices,
  onRoofVerticesChange,
  panels,
  onPanelsChange,
  isDrawing,
  month,
  hour,
}: MapViewProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places"],
  });

  const mapRef = useRef<google.maps.Map | null>(null);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

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
    onRoofVerticesChange([...roofVertices, newVertex]);
  };

  // Shadow polygons for panels
  const panelShadows: { id: string; path: Point[] }[] = [];
  if (sunAboveHorizon && shadowLenMultiplier > 0) {
    const panelHeightAboveRoof = 0.05; // 5cm above roof for tilt
    const shadowOffsetM = panelHeightAboveRoof * shadowLenMultiplier * 20; // exaggerate for visibility
    const shadowDx = Math.sin(shadowDir) * shadowOffsetM;
    const shadowDy = Math.cos(shadowDir) * shadowOffsetM;

    panels.forEach((panel) => {
      const dxDeg = metersToDegreesLng(shadowDx, panel.center.lat);
      const dyDeg = metersToDegreesLat(shadowDy);

      const halfW = panel.widthDeg / 2;
      const halfH = panel.heightDeg / 2;

      panelShadows.push({
        id: panel.id + "-shadow",
        path: [
          { lat: panel.center.lat - halfH + dyDeg, lng: panel.center.lng - halfW + dxDeg },
          { lat: panel.center.lat - halfH + dyDeg, lng: panel.center.lng + halfW + dxDeg },
          { lat: panel.center.lat + halfH + dyDeg, lng: panel.center.lng + halfW + dxDeg },
          { lat: panel.center.lat + halfH + dyDeg, lng: panel.center.lng - halfW + dxDeg },
        ],
      });
    });
  }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER_STYLE}
      center={mapCenter}
      zoom={20}
      mapTypeId="satellite"
      onLoad={onLoad}
      onClick={handleMapClick}
      options={{
        tilt: 0,
        mapTypeControl: false,
        streetViewControl: false,
      }}
    >
      {/* Roof polygon */}
      {roofVertices.length >= 3 && (
        <Polygon
          paths={roofVertices}
          options={{
            fillColor: "#3b82f6",
            fillOpacity: 0.15,
            strokeColor: "#3b82f6",
            strokeOpacity: 0.8,
            strokeWeight: 2,
          }}
        />
      )}

      {/* Roof vertex markers */}
      {roofVertices.map((v, i) => (
        <Marker
          key={`vertex-${i}`}
          position={v}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: "#3b82f6",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          }}
        />
      ))}

      {/* Shadow polygons (render before panels so panels appear on top) */}
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

      {/* Solar panels */}
      {panels.map((panel) => (
        <Rectangle
          key={panel.id}
          bounds={{
            north: panel.center.lat + panel.heightDeg / 2,
            south: panel.center.lat - panel.heightDeg / 2,
            east: panel.center.lng + panel.widthDeg / 2,
            west: panel.center.lng - panel.widthDeg / 2,
          }}
          options={{
            fillColor: "#1e3a5f",
            fillOpacity: 0.8,
            strokeColor: "#60a5fa",
            strokeOpacity: 1,
            strokeWeight: 1,
          }}
        />
      ))}
    </GoogleMap>
  );
}
