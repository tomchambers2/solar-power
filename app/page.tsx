"use client";

import { useState, useCallback } from "react";
import MapView from "@/components/MapView";
import PanelSelector from "@/components/PanelSelector";
import ShadowSim from "@/components/ShadowSim";
import PowerCalc from "@/components/PowerCalc";
import { PanelType, PANEL_TYPES } from "@/lib/panels";
import { Point, PanelRect, autoPlacePanels } from "@/lib/geometry";
import { getSunPosition } from "@/lib/solar";

export default function Home() {
  const [address, setAddress] = useState("");
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<PanelType>(PANEL_TYPES[0]);
  const [roofVertices, setRoofVertices] = useState<Point[]>([]);
  const [panels, setPanels] = useState<PanelRect[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [month, setMonth] = useState(6); // July
  const [hour, setHour] = useState(12); // Noon
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!address.trim()) return;
    setSearching(true);
    setSearchError(null);

    try {
      const geocoder = new google.maps.Geocoder();
      const result = await geocoder.geocode({ address });
      if (result.results.length === 0) {
        setSearchError("Address not found");
        setSearching(false);
        return;
      }
      const location = result.results[0].geometry.location;
      setMapCenter({ lat: location.lat(), lng: location.lng() });
      setSearching(false);
    } catch {
      setSearchError("Geocoding failed. Check your API key and address.");
      setSearching(false);
    }
  }, [address]);

  const handleAutoPlace = useCallback(() => {
    if (roofVertices.length < 3) return;
    const placed = autoPlacePanels(
      roofVertices,
      selectedPanel.widthM,
      selectedPanel.heightM
    );
    setPanels(placed);
  }, [roofVertices, selectedPanel]);

  const handleClearRoof = useCallback(() => {
    setRoofVertices([]);
    setPanels([]);
    setIsDrawing(false);
  }, []);

  const handlePanelTypeChange = useCallback(
    (panel: PanelType) => {
      setSelectedPanel(panel);
      if (roofVertices.length >= 3) {
        const placed = autoPlacePanels(
          roofVertices,
          panel.widthM,
          panel.heightM
        );
        setPanels(placed);
      }
    },
    [roofVertices]
  );

  // Sun position for display
  let sunAltDeg: number | null = null;
  let sunAzDeg: number | null = null;
  if (mapCenter) {
    const date = new Date(2024, month, 15, hour, 0, 0);
    const pos = getSunPosition(mapCenter.lat, mapCenter.lng, date);
    sunAltDeg = (pos.altitude * 180) / Math.PI;
    sunAzDeg = ((pos.azimuth * 180) / Math.PI + 360) % 360;
  }

  const totalArea = panels.length * selectedPanel.widthM * selectedPanel.heightM;

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-gray-900 text-white px-4 py-3 flex items-center gap-4 shrink-0">
        <h1 className="text-lg font-bold whitespace-nowrap">Solar Power Designer</h1>
        <div className="flex-1 flex gap-2">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="Enter address..."
            className="flex-1 px-3 py-1.5 rounded text-gray-900 text-sm"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
        {searchError && (
          <span className="text-red-400 text-sm">{searchError}</span>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 bg-gray-50 border-r border-gray-200 overflow-y-auto p-4 space-y-4 shrink-0">
          {/* Roof drawing controls */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-800 mb-2">Roof Definition</h3>
            <p className="text-xs text-gray-500 mb-3">
              Click on the map to define your roof outline. Minimum 3 points.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setIsDrawing(!isDrawing)}
                className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
                  isDrawing
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {isDrawing ? "Stop Drawing" : "Draw Roof"}
              </button>
              <button
                onClick={handleClearRoof}
                className="px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                Clear
              </button>
            </div>
            {roofVertices.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                {roofVertices.length} point{roofVertices.length !== 1 ? "s" : ""} defined
              </p>
            )}
          </div>

          {/* Auto-place button */}
          <div className="bg-white rounded-lg shadow p-4">
            <button
              onClick={handleAutoPlace}
              disabled={roofVertices.length < 3}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Auto-Place Panels
            </button>
            {panels.length > 0 && (
              <div className="mt-2 text-xs text-gray-600 space-y-1">
                <p>Panels placed: {panels.length}</p>
                <p>Total area: {totalArea.toFixed(1)} m&sup2;</p>
                <p>
                  Total capacity:{" "}
                  {((panels.length * selectedPanel.wattage) / 1000).toFixed(1)} kWp
                </p>
              </div>
            )}
          </div>

          <PanelSelector
            selectedPanel={selectedPanel}
            onSelect={handlePanelTypeChange}
          />

          <ShadowSim
            month={month}
            hour={hour}
            onMonthChange={setMonth}
            onHourChange={setHour}
            sunAltitudeDeg={sunAltDeg}
            sunAzimuthDeg={sunAzDeg}
          />

          <PowerCalc
            lat={mapCenter?.lat ?? null}
            lng={mapCenter?.lng ?? null}
            panelCount={panels.length}
            panelType={selectedPanel}
          />
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          {!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-200">
              <div className="text-center p-8">
                <p className="text-gray-600 text-lg mb-2">
                  Google Maps API key required
                </p>
                <p className="text-gray-500 text-sm">
                  Set <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in your environment.
                </p>
              </div>
            </div>
          ) : (
            <MapView
              center={mapCenter}
              panelType={selectedPanel}
              roofVertices={roofVertices}
              onRoofVerticesChange={setRoofVertices}
              panels={panels}
              onPanelsChange={setPanels}
              isDrawing={isDrawing}
              month={month}
              hour={hour}
            />
          )}

          {/* Drawing mode indicator */}
          {isDrawing && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium">
              Click on map to add roof points
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
