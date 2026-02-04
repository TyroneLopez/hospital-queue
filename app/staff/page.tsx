'use client'
import { useEffect, useState } from 'react'
import { supabase, Ticket } from '../../utils/supabase/supabaseClient'

// --- CONFIGURATION: SERVICE MAPPING ---
// Each room is dedicated to a specific service
const ROOMS_CONFIG = [
  { id: 1, name: 'Clinic 1', capacity: 1, service: 'OBGYNE' },
  { id: 2, name: 'Clinic 2', capacity: 1, service: 'Urinalysis' },
  { id: 3, name: 'Clinic 3', capacity: 1, service: 'Pediatrics' },
  { id: 4, name: 'Clinic 4', capacity: 1, service: 'General' },
  { id: 5, name: 'Clinic 5', capacity: 1, service: 'Dental' },
  { id: 6, name: 'Clinic 6', capacity: 1, service: 'X-Ray' },
  { id: 7, name: 'Clinic 7', capacity: 1, service: 'ENT' },
  { id: 8, name: 'Clinic 8', capacity: 1, service: 'Ortho' },
  { id: 9, name: 'Laboratory', capacity: 2, service: 'Lab Test' },
];

export default function StaffDashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [now, setNow] = useState(new Date())
  
  // FILTERS & SEARCH
  const [activeView, setActiveView] = useState<'waiting' | 'serving'>('waiting')
  const [selectedRoomId, setSelectedRoomId] = useState<number | 'All'>('All')
  const [waitingSearch, setWaitingSearch] = useState('')
  const [servingSearch, setServingSearch] = useState('')

  // --- DATA SYNC ---
  const fetchTickets = async () => {
    const { data } = await supabase.from('tickets').select('*').order('created_at', { ascending: true })
    if (data) setTickets(data)
  }

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetchTickets()
    const sub = supabase.channel('staff_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, fetchTickets)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [])

  // --- HELPERS ---
  
  // 1. Time Formatter (hr:min:sec)
  const getElapsedTime = (startTime: string) => {
    if (!startTime) return '00:00';
    const start = new Date(startTime).getTime();
    const current = now.getTime();
    const diff = Math.max(0, current - start);
    
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // 2. Filter Logic
  const getFilteredWaiting = () => {
    return tickets.filter(t => {
      // Basic checks
      if (t.status !== 'waiting') return false;
      const matchesSearch = t.patient_name?.toLowerCase().includes(waitingSearch.toLowerCase()) || t.id.toString().includes(waitingSearch);
      if (!matchesSearch) return false;

      // Room/Service Filter
      if (selectedRoomId !== 'All') {
        const targetRoom = ROOMS_CONFIG.find(r => r.id === selectedRoomId);
        if (targetRoom && t.service_type !== targetRoom.service) return false;
      }
      return true;
    });
  };

  const getFilteredServing = () => {
    return tickets.filter(t => {
      if (t.status !== 'serving' && t.status !== 'in_progress') return false;
      const matchesSearch = t.patient_name?.toLowerCase().includes(servingSearch.toLowerCase()) || t.id.toString().includes(servingSearch);
      if (!matchesSearch) return false;

      if (selectedRoomId !== 'All') {
        if (t.room_number !== selectedRoomId) return false;
      }
      return true;
    }).sort((a, b) => (a.room_number || 0) - (b.room_number || 0));
  };

  const waitingList = getFilteredWaiting();
  const servingList = getFilteredServing();

  // --- ACTIONS ---

  // 1. CALL PATIENT (Smart Assignment)
  const callPatient = async (ticket: Ticket) => {
    // A. Find the Designated Room for this Service
    const targetRoom = ROOMS_CONFIG.find(r => r.service === ticket.service_type);
    
    if (!targetRoom) {
      alert(`Error: No room configured for service "${ticket.service_type}"`);
      return;
    }

    // B. Check if Room is Available
    const currentOccupants = tickets.filter(t => 
      (t.status === 'serving' || t.status === 'in_progress') && 
      t.room_number === targetRoom.id
    );

    if (currentOccupants.length >= targetRoom.capacity) {
      alert(`${targetRoom.name} (${targetRoom.service}) is currently FULL.`);
      return;
    }

    // C. Assign to Room (FIXED: Added 'as any' to bypass TS error)
    await supabase.from('tickets').update({
      status: 'serving',
      room_number: targetRoom.id,
      service_start_time: new Date().toISOString()
    } as any).eq('id', ticket.id);
  };

  // 2. FINISH (Complete) (FIXED: Added 'as any')
  const finishTicket = async (id: number | string) => {
    await supabase.from('tickets').update({
      status: 'completed',
      service_end_time: new Date().toISOString()
    } as any).eq('id', id)
  }

  // 3. RETURN TO QUEUE (Priority Re-queue) (FIXED: Added 'as any')
  // Resets status to 'waiting'. Since created_at is old, they will jump to the top of the list naturally.
  const returnToQueue = async (id: number | string) => {
    const confirmReturn = window.confirm("Return patient to queue? They will be placed based on their arrival time (High Priority).");
    if (!confirmReturn) return;

    await supabase.from('tickets').update({
      status: 'waiting',
      room_number: null,
      // We DO NOT update created_at, so they maintain their original "place" in line (sorted by time)
    } as any).eq('id', id)
  }

  // 4. NO SHOW (Cancel) (FIXED: Added 'as any')
  const markNoShow = async (id: number | string) => {
    if(!window.confirm("Mark patient as No Show?")) return;
    
    await supabase.from('tickets').update({
      status: 'cancelled',
      service_end_time: new Date().toISOString()
    } as any).eq('id', id)
  }

  return (
    <div className="h-full w-full flex flex-col bg-slate-50 overflow-hidden rounded-2xl shadow-xl border border-slate-200">
      
      {/* HEADER */}
      <header className="flex-none bg-white border-b border-slate-200 px-6 py-4 z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#1b4d3e]">Staff Console</h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
               Manage Patient Flow & Room Assignments
            </p>
          </div>
          
          {/* ROOM FILTER DROPDOWN */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-slate-500">View:</span>
            <select
              value={selectedRoomId}
              onChange={e => setSelectedRoomId(e.target.value === 'All' ? 'All' : Number(e.target.value))}
              className="rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 min-w-[200px]"
            >
              <option value="All">All Rooms / Global</option>
              {ROOMS_CONFIG.map(room => (
                <option key={room.id} value={room.id}>
                  {room.name} - {room.service}
                </option>
              ))}
            </select>
          </div>

          {/* MOBILE VIEW TOGGLE */}
          <div className="md:hidden">
            <select
              value={activeView}
              onChange={e => setActiveView(e.target.value as any)}
              className="w-full rounded-lg bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700"
            >
              <option value="waiting">Queue ({waitingList.length})</option>
              <option value="serving">Serving ({servingList.length})</option>
            </select>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            
            {/* ------------------------------------------- */}
            {/* LEFT: WAITING LIST                          */}
            {/* ------------------------------------------- */}
            <section className={`bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden h-full shadow-sm ${activeView !== 'waiting' ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                            Waiting List 
                            {selectedRoomId !== 'All' && <span className="text-emerald-600 ml-1">({ROOMS_CONFIG.find(r=>r.id===selectedRoomId)?.service})</span>}
                        </h2>
                        <span className="bg-slate-200 text-slate-600 px-2 py-1 rounded text-xs font-bold">{waitingList.length}</span>
                    </div>
                    <input
                        placeholder="Search patient..."
                        value={waitingSearch}
                        onChange={e => setWaitingSearch(e.target.value)}
                        className="w-full rounded-xl bg-white border border-slate-200 px-4 py-2 text-sm focus:ring-2 focus:ring-[#1b4d3e] outline-none"
                    />
                </div>

                <div className="flex-1 overflow-y-auto bg-white">
                    {waitingList.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-300 italic flex-col">
                            <span className="text-2xl not-italic">📂</span>
                            <span>No patients waiting {selectedRoomId !== 'All' ? 'for this room' : ''}</span>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {waitingList.map(t => {
                                // Determine Target Room for Display Logic
                                const targetRoom = ROOMS_CONFIG.find(r => r.service === t.service_type);
                                const isRoomBusy = targetRoom && tickets.filter(tic => (tic.status === 'serving' || tic.status === 'in_progress') && tic.room_number === targetRoom.id).length >= targetRoom.capacity;

                                return (
                                    <div key={t.id} className="grid grid-cols-12 gap-2 items-center px-4 py-4 hover:bg-blue-50 transition-colors group">
                                        <div className="col-span-2 text-center">
                                            <span className="font-black text-slate-700 text-lg">#{t.id}</span>
                                        </div>
                                        <div className="col-span-7">
                                            <span className="font-bold text-slate-800 text-base block truncate">{t.patient_name}</span>
                                            {/* DESIGNATED SERVICE PILL */}
                                            <span className="inline-block mt-1 text-[9px] font-bold uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                                                For: {t.service_type || 'General'}
                                            </span>
                                        </div>
                                        <div className="col-span-3 text-right">
                                            <button
                                                onClick={() => callPatient(t)}
                                                className={`
                                                    px-3 py-2 text-xs font-bold rounded-lg shadow-md uppercase tracking-wide w-full transition-all
                                                    ${isRoomBusy 
                                                        ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' // Busy Style
                                                        : 'bg-[#1b4d3e] text-white hover:bg-emerald-800 active:scale-95' // Available Style
                                                    }
                                                `}
                                            >
                                                {isRoomBusy ? 'Wait' : 'Call'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>


            {/* ------------------------------------------- */}
            {/* RIGHT: NOW SERVING                          */}
            {/* ------------------------------------------- */}
            <section className={`bg-white rounded-2xl border border-emerald-100 flex flex-col overflow-hidden h-full shadow-sm ${activeView !== 'serving' ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b border-emerald-100 bg-emerald-50/40 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xs font-black text-emerald-800 uppercase tracking-widest">Now Serving</h2>
                        <span className="text-[10px] text-red-500 font-black animate-pulse bg-red-50 px-2 py-1 rounded-full">LIVE</span>
                    </div>
                    <input
                        placeholder="Search serving..."
                        value={servingSearch}
                        onChange={e => setServingSearch(e.target.value)}
                        className="w-full rounded-xl bg-white border border-emerald-200 px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                </div>

                <div className="flex-1 overflow-y-auto bg-white">
                    {servingList.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-300 italic">No Active Patients</div>
                    ) : (
                        <div className="divide-y divide-emerald-50">
                            {servingList.map(t => {
                                const roomName = ROOMS_CONFIG.find(r => r.id === t.room_number)?.name || `Room ${t.room_number}`;
                                
                                return (
                                    <div key={t.id} className="px-4 py-4 bg-white hover:bg-emerald-50 transition-colors border-l-4 border-l-[#fcc200]">
                                        
                                        {/* TOP ROW: Room & Patient */}
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-[#fcc200] text-[#1b4d3e] font-black text-xs px-2 py-2 rounded-lg leading-none shadow-sm min-w-[60px] text-center">
                                                    {roomName}
                                                </div>
                                                <div>
                                                    <span className="font-bold text-slate-800 text-lg block leading-tight">{t.patient_name}</span>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="font-black text-slate-400 text-xs">#{t.id}</span>
                                                        <span className="text-slate-300">•</span>
                                                        <span className="font-mono font-bold text-xs text-emerald-600 bg-emerald-50 px-1.5 rounded">
                                                            {t.service_start_time && getElapsedTime(t.service_start_time)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* BOTTOM ROW: Actions */}
                                        <div className="flex gap-2 justify-end pt-2 border-t border-slate-50">
                                            <button
                                                onClick={() => markNoShow(t.id)}
                                                className="px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                            >
                                                No Show
                                            </button>
                                            <button
                                                onClick={() => returnToQueue(t.id)}
                                                className="px-3 py-1.5 text-[10px] font-bold uppercase text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                                                title="Return to waiting list (Maintains priority)"
                                            >
                                                ↩ Return to Queue
                                            </button>
                                            <button
                                                onClick={() => finishTicket(t.id)}
                                                className="px-5 py-1.5 text-xs font-bold uppercase text-white bg-slate-800 hover:bg-slate-900 rounded shadow-md active:scale-95 transition-all"
                                            >
                                                Finish
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

        </div>
      </main>
    </div>
  )
}