'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import PinGate from '@/components/PinGate';
import ActiveParkingCard from '@/components/ActiveParkingCard';
import SegmentDrawer from '@/components/SegmentDrawer';
import { StreetSegment } from '@/lib/sweeping';

// Dynamic import for Leaflet map with no SSR
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
      <span className="text-sm font-medium">Loading NOPA Map...</span>
    </div>
  ),
});

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [segments, setSegments] = useState<StreetSegment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<StreetSegment | null>(null);
  const [parkingStatus, setParkingStatus] = useState<any>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Fetch active parking status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setParkingStatus(data);
      }
    } catch (err) {
      console.error('Error fetching parking status:', err);
    }
  }, []);

  // Fetch segments
  const fetchSegments = useCallback(async () => {
    try {
      const res = await fetch('/api/segments');
      if (res.ok) {
        const data = await res.json();
        setSegments(data);
      }
    } catch (err) {
      console.error('Error fetching segments:', err);
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSegments();
      fetchStatus();

      // Poll status every 30 seconds while page is open
      const interval = setInterval(fetchStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchSegments, fetchStatus]);

  const handleConfirmPark = async (segmentId: string) => {
    try {
      const res = await fetch('/api/park', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentId }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (err) {
      console.error('Error setting parking spot:', err);
    }
  };

  const handleClearParking = async () => {
    try {
      const res = await fetch('/api/clear', { method: 'POST' });
      if (res.ok) {
        await fetchStatus();
        setSelectedSegment(null);
      }
    } catch (err) {
      console.error('Error clearing parking:', err);
    }
  };

  if (!isAuthenticated) {
    return <PinGate onSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <main className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Top Active Parking Card */}
      <ActiveParkingCard status={parkingStatus} onClear={handleClearParking} />

      {/* Map View */}
      <MapView
        segments={segments}
        selectedSegment={selectedSegment}
        currentSession={parkingStatus}
        onSelectSegment={(seg) => setSelectedSegment(seg)}
      />

      {/* Bottom Segment Detail Drawer */}
      <SegmentDrawer
        segment={selectedSegment}
        currentSession={parkingStatus}
        onClose={() => setSelectedSegment(null)}
        onConfirmPark={handleConfirmPark}
      />
    </main>
  );
}
