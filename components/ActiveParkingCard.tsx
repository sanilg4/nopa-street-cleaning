'use client';

import React, { useState } from 'react';
import { Car, Clock, Bell, XCircle, AlertTriangle } from 'lucide-react';

interface ActiveParkingCardProps {
  status: any;
  onClear: () => Promise<void>;
}

export default function ActiveParkingCard({ status, onClear }: ActiveParkingCardProps) {
  const [clearing, setClearing] = useState(false);

  if (!status || !status.isParked || !status.session) {
    return null;
  }

  const { session, details } = status;

  const handleClear = async () => {
    setClearing(true);
    try {
      await onClear();
    } finally {
      setClearing(false);
    }
  };

  const isUrgent = details.hoursUntilSweeping <= 12;

  return (
    <div className="absolute top-0 left-0 right-0 z-30 p-4 safe-top pointer-events-none">
      <div
        className={`pointer-events-auto rounded-2xl border p-4 shadow-xl backdrop-blur-md transition-all duration-200 ${
          details.isSweepingNow
            ? 'bg-red-950/90 border-red-500/50 shadow-red-500/10'
            : isUrgent
            ? 'bg-amber-950/90 border-amber-500/50 shadow-amber-500/10'
            : 'bg-slate-900/90 border-slate-700/60 shadow-black/40'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`p-2 rounded-xl ${
                isUrgent ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {details.isSweepingNow ? (
                <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse" />
              ) : (
                <Car className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Currently Parked
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    details.isSweepingNow
                      ? 'bg-red-500/20 text-red-300'
                      : isUrgent
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-blue-500/20 text-blue-300'
                  }`}
                >
                  {details.isSweepingNow
                    ? 'Sweeping Now!'
                    : `In ${details.hoursUntilSweeping}h`}
                </span>
              </div>
              <h2 className="text-base font-bold text-white mt-0.5 leading-tight">
                {session.corridor} ({session.side} side)
              </h2>
              <p className="text-xs text-slate-300">{session.limits}</p>
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-700/50 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate">{details.formattedNextSweeping}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <Bell className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="truncate">Alert: {details.formattedAlertTime}</span>
          </div>
        </div>

        <button
          type="button"
          disabled={clearing}
          onClick={handleClear}
          className="mt-3 w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-xs font-semibold text-rose-300 hover:text-rose-200 border border-slate-700/60 transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <XCircle className="w-4 h-4 text-rose-400" />
          {clearing ? 'Clearing Parking...' : 'Clear Parking / I Moved the Car'}
        </button>
      </div>
    </div>
  );
}
