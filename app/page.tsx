"use client";

import { useState, useCallback, useEffect } from "react";
import MapView from "@/components/MapView";
import PanelSelector from "@/components/PanelSelector";
import ShadowSim from "@/components/ShadowSim";
import PowerCalc from "@/components/PowerCalc";
import { PanelType, PANEL_TYPES } from "@/lib/panels";
import { Point, PanelRect, RoofFace, autoPlaceAllFaces, recomputePanelCorners } from "@/lib/geometry";
import { getSunPosition } from "@/lib/solar";
import { saveToStorage, loadFromStorage } from "@/lib/storage";

const DEFAULT_ADDRESS = "109 Broad Walk, BS4 2RT";
const DEFAULT_COORDS = { lat: 51.43259951423126, lng: -2.5754143683042474 };

export default function Home() {
  const [address, setAddress] = useState(DEFAULT_ADDRESS);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(DEFAULT_COORDS);
  const [selectedPanel, setSelectedPanel] = useState<PanelType>(PANEL_TYPES[0]);
  const [roofFaces, setRoofFaces] = useState<RoofFace[]>([]);
  const [activeRoofFaceId, setActiveRoofFaceId] = useState<string | null>(null);
  const [panels, setPanels] = useState<PanelRect[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [month, setMonth] = useState(6);
  const [hour, setHour] = useState(12);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Load saved data from localStorage
  useEffect(() => {
    const saved = loadFromStorage();
    if (saved) {
      if (saved.roofFaces.length > 0) setRoofFaces(saved.roofFaces);
      if (saved.panels.length > 0) setPanels(saved.panels);
      if (saved.selectedPanelId) {
        const panel = PANEL_TYPES.find((p) => p.id === saved.selectedPanelId);
        if (panel) setSelectedPanel(panel);
      }
    }
    setLoaded(true);
  }, []);

  // Save to localStorage on changes
  useEffect(() => {
    if (!loaded) return;
    saveToStorage({
      roofFaces,
      panels,
      selectedPanelId: selectedPanel.id,
    });
  }, [roofFaces, panels, selectedPanel, loaded]);

  // Search using Places API (findPlaceFromQuery) instead of Geocoder
  const doSearch = useCallback(async (addr: string) => {
    setSearching(true);
    setSearchError(null);
    try {
      const service = new google.maps.places.PlacesService(
        document.createElement("div")
      );
      const request = {
        query: addr,
        fields: ["geometry"],
      };
      service.findPlaceFromQuery(request, (results, status) => {
        if (
          status === google.maps.places.PlacesServiceStatus.OK &&
          results &&
          results.length > 0 &&
          results[0].geometry?.location
        ) {
          const loc = results[0].geometry.location;
          setMapCenter({ lat: loc.lat(), lng: loc.lng() });
        } else {
          setSearchError("Address not found");
        }
        setSearching(false);
      });
    } catch {
      setSearchError("Search failed. Check your API key and address.");
      setSearching(false);
    }
  }, []);

  const handleSearch = useCallback(() => {
    if (!address.trim()) return;
    doSearch(address);
  }, [address, doSearch]);

  const handleAddRoofFace = useCallback(() => {
    const newFace: RoofFace = {
      id: `face-${Date.now()}`,
      vertices: [],
      pitchDeg: 45,
    };
    setRoofFaces((prev) => [...prev, newFace]);
    setActiveRoofFaceId(newFace.id);
    setIsDrawing(true);
  }, []);

  const handleRoofVertexAdd = useCallback(
    (vertex: Point) => {
      if (!activeRoofFaceId) return;
      setRoofFaces((prev) =>
        prev.map((f) =>
          f.id === activeRoofFaceId
            ? { ...f, vertices: [...f.vertices, vertex] }
            : f
        )
      );
    },
    [activeRoofFaceId]
  );

  const handleDeleteRoofFace = useCallback(
    (faceId: string) => {
      setRoofFaces((prev) => prev.filter((f) => f.id !== faceId));
      setPanels((prev) => prev.filter((p) => p.roofFaceId !== faceId));
      if (activeRoofFaceId === faceId) {
        setActiveRoofFaceId(null);
        setIsDrawing(false);
      }
    },
    [activeRoofFaceId]
  );

  const handlePitchChange = useCallback(
    (faceId: string, pitchDeg: number) => {
      setRoofFaces((prev) =>
        prev.map((f) => (f.id === faceId ? { ...f, pitchDeg } : f))
      );
    },
    []
  );

  const handleAutoPlace = useCallback(() => {
    if (roofFaces.length === 0) return;
    const facesWithVertices = roofFaces.filter((f) => f.vertices.length >= 3);
    if (facesWithVertices.length === 0) return;
    const placed = autoPlaceAllFaces(
      facesWithVertices,
      selectedPanel.widthM,
      selectedPanel.heightM
    );
    setPanels(placed);
  }, [roofFaces, selectedPanel]);

  const handleClearAll = useCallback(() => {
    setRoofFaces([]);
    setPanels([]);
    setActiveRoofFaceId(null);
    setIsDrawing(false);
  }, []);

  const handlePanelTypeChange = useCallback(
    (panel: PanelType) => {
      setSelectedPanel(panel);
      const facesWithVertices = roofFaces.filter((f) => f.vertices.length >= 3);
      if (facesWithVertices.length > 0) {
        const placed = autoPlaceAllFaces(
          facesWithVertices,
          panel.widthM,
          panel.heightM
        );
        setPanels(placed);
      }
    },
    [roofFaces]
  );

  const handlePanelMove = useCallback(
    (panelId: string, newCenter: Point) => {
      setPanels((prev) =>
        prev.map((p) =>
          p.id === panelId ? recomputePanelCorners({ ...p, center: newCenter }) : p
        )
      );
    },
    []
  );

  const handleStopDrawing = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // Sun position for display
  let sunAltDeg: number | null = null;
  let sunAzDeg: number | null = null;
  if (mapCenter) {
    const date = new Date(2024, month, 15, hour, 0, 0);
    const pos = getSunPosition(mapCenter.lat, mapCenter.lng, date);
    sunAltDeg = (pos.altitude * 180) / Math.PI;
    sunAzDeg = ((pos.azimuth * 180) / Math.PI + 360) % 360;
  }

  const totalArea = panels.reduce((sum, p) => sum + p.widthM * p.heightM, 0);
  const faceColors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

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
          {/* Roof faces */}
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-gray-800 mb-2">Roof Faces</h3>
            <p className="text-xs text-gray-500 mb-3">
              Add roof faces and click the map to draw each outline. Set pitch angle per face.
            </p>

            {roofFaces.map((face, idx) => (
              <div
                key={face.id}
                className={`border rounded p-2 mb-2 cursor-pointer ${
                  face.id === activeRoofFaceId
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200"
                }`}
                onClick={() => {
                  setActiveRoofFaceId(face.id);
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ backgroundColor: faceColors[idx % faceColors.length] }}
                    />
                    Face {idx + 1}
                    <span className="text-xs text-gray-400">
                      ({face.vertices.length} pts)
                    </span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRoofFace(face.id);
                    }}
                    className="text-red-400 hover:text-red-600 text-xs"
                  >
                    Delete
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 whitespace-nowrap">
                    Pitch:
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={face.pitchDeg}
                    onChange={(e) =>
                      handlePitchChange(face.id, parseInt(e.target.value))
                    }
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-700 w-8 text-right">
                    {face.pitchDeg}&deg;
                  </span>
                </div>
              </div>
            ))}

            <div className="flex gap-2 mt-2">
              {isDrawing ? (
                <button
                  onClick={handleStopDrawing}
                  className="flex-1 px-3 py-2 rounded text-sm font-medium bg-red-500 text-white hover:bg-red-600"
                >
                  Stop Drawing
                </button>
              ) : (
                <button
                  onClick={handleAddRoofFace}
                  className="flex-1 px-3 py-2 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                >
                  + Add Roof Face
                </button>
              )}
              <button
                onClick={handleClearAll}
                className="px-3 py-2 rounded text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Auto-place button */}
          <div className="bg-white rounded-lg shadow p-4">
            <button
              onClick={handleAutoPlace}
              disabled={roofFaces.filter((f) => f.vertices.length >= 3).length === 0}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Auto-Place Panels
            </button>
            {panels.length > 0 && (
              <div className="mt-2 text-xs text-gray-600 space-y-1">
                <p>Panels placed: {panels.length}</p>
                <p>Total panel area: {totalArea.toFixed(1)} m&sup2;</p>
                <p>
                  Total capacity:{" "}
                  {((panels.length * selectedPanel.wattage) / 1000).toFixed(1)} kWp
                </p>
              </div>
            )}
            {panels.length > 0 && (
              <p className="mt-2 text-xs text-gray-400">
                Drag panels on the map to reposition them.
              </p>
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
              roofFaces={roofFaces}
              activeRoofFaceId={activeRoofFaceId}
              onRoofVertexAdd={handleRoofVertexAdd}
              panels={panels}
              onPanelMove={handlePanelMove}
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
