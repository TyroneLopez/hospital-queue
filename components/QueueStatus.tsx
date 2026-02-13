"use client";

import React, { useEffect, useState } from 'react';
import { supabase, Ticket } from '../utils/supabase/supabaseClient';
import { calculatePredictedWaitTime, CompletedTicket } from '../utils/predictionEngine';

type QueueStatusProps = {
  /** The current user's ticket id (optional) */
  userTicketId?: string;
  /** Array of recently completed tickets used to predict wait time */
  completedTickets?: CompletedTicket[];
  /** How many completed tickets to average for prediction (default 5) */
  lookback?: number;
};

export default function QueueStatus({
  userTicketId,
  completedTickets = [],
  lookback = 5,
}: QueueStatusProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch tickets:', error);
      setLoading(false);
      return;
    }

    setTickets(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;

    // schedule initial fetch asynchronously to avoid setState sync inside effect
    setTimeout(() => { void fetchTickets(); }, 0)

    const channel = supabase
      .channel('public:tickets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => {
          // For simplicity and correctness we re-fetch on any insert/update/delete
          if (mounted) void fetchTickets();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      // unsubscribe, ignore errors on cleanup
      channel.unsubscribe().catch(() => {});
    };
  }, []);

  // Current being served (ticket with status 'in_progress')
  const currentServing = tickets.find((t) => t.status === 'in_progress') ?? null;

  const waitingTickets = tickets
    .filter((t) => t.status === 'waiting')
    .sort((a, b) => (new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()));

  // Compute user's position and number of people ahead
  let userPositionDisplay = 'Not in queue';
  let peopleAhead = 0; // number of people ahead of the user

  if (userTicketId) {
    const userTicket = tickets.find((t) => String(t.id) === String(userTicketId));

    if (!userTicket) {
      userPositionDisplay = 'Not in queue';
    } else if (userTicket.status === 'in_progress' || userTicket.status === 'serving') {
      userPositionDisplay = 'Being served';
      peopleAhead = 0;
    } else if (userTicket.status === 'waiting') {
      const idx = waitingTickets.findIndex((t) => String(t.id) === String(userTicketId));
      if (idx >= 0) {
        peopleAhead = idx; // number of people ahead
        userPositionDisplay = String(idx + 1); // 1-based position
      } else {
        userPositionDisplay = 'Not in queue';
      }
    } else {
      // canceled or completed
      userPositionDisplay = userTicket.status;
    }
  } else {
    userPositionDisplay = 'No ticket selected';
  }

  const predictedMinutes = calculatePredictedWaitTime(completedTickets ?? [], peopleAhead, lookback);

  return (
    <div className="w-full max-w-md rounded-md border bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-lg font-semibold">Queue Status</h3>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">Currently serving</div>
            <div className="text-sm font-medium text-gray-900">
              {currentServing ? (
                <span>{currentServing.patient_name ?? currentServing.id}</span>
              ) : (
                <span className="text-gray-500">None</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">Your position</div>
            <div className="text-sm font-medium text-gray-900">{userPositionDisplay}</div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">Predicted wait</div>
            <div>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                {Number.isFinite(predictedMinutes) ? `${predictedMinutes} min` : 'N/A'}
              </span>
            </div>
          </div>

          <div className="text-xs text-gray-400">Updated in real-time via Supabase Realtime</div>
        </div>
      )}
    </div>
  );
}
