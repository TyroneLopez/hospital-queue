"use client";

import React, { useEffect, useState } from 'react';
import { supabase, Ticket } from '../utils/supabase/supabaseClient';

// --- CONFIGURATION: MAPPED TO SERVICES ---
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

const ITEMS_PER_PAGE = 6; 

export default function PatientDashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [now, setNow] = useState(new Date());
  
  // PAGINATION STATE
  const [currentPage, setCurrentPage] = useState(0);

  // SORTING & FILTERING STATE
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ 
    key: 'id', 
    direction: 'asc' 
  });
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>('All');


  // --- DATA & REALTIME ---
  const fetchTickets = async () => {
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: true });
    setTickets(data ?? []);
  };

  useEffect(() => {
    fetchTickets();
    const timer = setInterval(() => setNow(new Date()), 1000);

    const channel = supabase
      .channel('public:tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => fetchTickets())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets' }, (payload: any) => {
            fetchTickets();
            const newRec = payload.new;
            if (newRec.status === 'serving') {
                 const audio = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/pang/pop.mp3');
                 audio.play().catch(e => console.log(e));
            }
        })
      .subscribe();

    // SIMULATOR
    const simInterval = setInterval(async () => {
        if (!isSimulating) return;
        const prefixes = ['Guest', 'Student', 'Faculty'];
        const randomName = `${prefixes[Math.floor(Math.random() * prefixes.length)]} #${Math.floor(Math.random()*900)+100}`;
        const services = ROOMS_CONFIG.map(r => r.service);
        const randomService = services[Math.floor(Math.random() * services.length)];

        await supabase.from('tickets').insert([{ 
            patient_name: randomName, 
            status: 'waiting',
            service_type: randomService 
        }] as any);
    }, 4000);

    return () => {
        clearInterval(timer);
        clearInterval(simInterval);
        supabase.removeChannel(channel);
    };
  }, [isSimulating]);

  // --- HELPER CALCULATIONS ---
  const waitingTickets = tickets.filter((t) => t.status === 'waiting');

  const getAvgTimeForService = (serviceName: string) => {
      const completedForService = tickets.filter(t => 
        t.status === 'completed' && 
        t.service_type === serviceName &&
        t.service_start_time && t.service_end_time
      );
      if (completedForService.length === 0) return 15 * 60000;
      const totalDuration = completedForService.reduce((acc, t) => {
         const start = new Date(t.service_start_time!).getTime();
         const end = new Date(t.service_end_time!).getTime();
         return acc + (end - start);
      }, 0);
      return totalDuration / completedForService.length;
  };

  const formatDuration = (ms: number) => {
      const minutes = Math.floor(ms / 60000);
      return `${minutes} min`;
  };

  const getProjectedTime = (ticket: Ticket) => {
      const peopleAhead = waitingTickets.filter(t => 
          t.service_type === ticket.service_type && 
          t.id < ticket.id
      ).length;
      const avgServiceMs = getAvgTimeForService(ticket.service_type || '');
      const waitMs = (peopleAhead + 1) * avgServiceMs;
      const currentTime = new Date().getTime();
      return new Date(currentTime + waitMs).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }

  const getDuration = (startTime: string) => {
      if (!startTime) return '00:00';
      const start = new Date(startTime).getTime();
      const current = now.getTime();
      const diff = Math.max(0, current - start);
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // --- SORTING & FILTERING LOGIC ---
  const handleSort = (key: string) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setSortConfig({ key, direction });
  };

  // 1. Filter first
  const filteredQueue = waitingTickets.filter(t => {
      if (selectedServiceFilter === 'All') return true;
      return t.service_type === selectedServiceFilter;
  });

  // 2. Sort second
  const sortedQueue = [...filteredQueue].sort((a: any, b: any) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
  });

  // --- PAGINATION LOGIC ---
  const totalPages = Math.ceil(ROOMS_CONFIG.length / ITEMS_PER_PAGE);
  const currentRooms = ROOMS_CONFIG.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
  const handleNext = () => { if (currentPage < totalPages - 1) setCurrentPage(p => p + 1); };
  const handlePrev = () => { if (currentPage > 0) setCurrentPage(p => p - 1); };

  // Generate unique service list for dropdown
  const uniqueServices = Array.from(new Set(ROOMS_CONFIG.map(r => r.service)));

  return (
    <div className="h-full w-full flex gap-3 p-1 overflow-hidden">
      
      {/* ------------------------------------------------ */}
      {/* LEFT COLUMN: QUEUE + FILTERS (30% Width)         */}
      {/* ------------------------------------------------ */}
      <div className="w-[30%] flex flex-col bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
         <div className="bg-slate-50 border-b border-slate-200 p-3 shrink-0">
            <h2 className="text-xl font-black text-[#1b4d3e] uppercase tracking-widest mb-2">
                Patient Queue
            </h2>
            
            {/* FILTER DROPDOWN */}
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase text-slate-400">Filter:</span>
                <select 
                    value={selectedServiceFilter}
                    onChange={(e) => setSelectedServiceFilter(e.target.value)}
                    className="flex-1 text-xs border border-slate-300 rounded px-2 py-1 font-bold text-slate-700 bg-white focus:outline-none focus:border-[#1b4d3e]"
                >
                    <option value="All">All Services</option>
                    {uniqueServices.map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </div>

            <div className="text-[9px] uppercase text-slate-400 font-bold">
                Sorted by: <span className="text-[#1b4d3e]">{sortConfig.key}</span>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto bg-white">
            {sortedQueue.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 opacity-50">
                    <span className="text-4xl">☕</span>
                    <span className="text-sm font-bold uppercase">No Patients Found</span>
                </div>
            ) : (
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                            <th 
                                onClick={() => handleSort('patient_name')} 
                                className="cursor-pointer hover:bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest"
                            >
                                Name {sortConfig.key === 'patient_name' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                            <th 
                                onClick={() => handleSort('service_type')} 
                                className="cursor-pointer hover:bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest"
                            >
                                Service {sortConfig.key === 'service_type' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                            </th>
                            <th className="px-3 py-2 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Est.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sortedQueue.map((t) => (
                            <tr key={t.id} className="hover:bg-yellow-50 transition-colors">
                                <td className="px-3 py-3">
                                    <div className="text-lg font-black text-[#1b4d3e] leading-none">#{t.id}</div>
                                    <div className="text-[10px] font-bold text-slate-500 uppercase truncate max-w-[80px] mt-1">
                                        {t.patient_name}
                                    </div>
                                </td>
                                <td className="px-3 py-3">
                                    <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded uppercase border border-emerald-100">
                                        {t.service_type || 'General'}
                                    </span>
                                </td>
                                <td className="px-3 py-3 text-right">
                                    <div className="font-mono font-bold text-xs text-slate-400">
                                        {getProjectedTime(t)}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
         </div>
      </div>

      {/* ------------------------------------------------ */}
      {/* RIGHT COLUMN: 3x2 ROOM GRID + ANALYTICS (70%)    */}
      {/* ------------------------------------------------ */}
      <div className="flex-1 flex flex-col h-[570px] min-h-0 bg-slate-100 rounded-xl border border-slate-300 p-2 shadow-inner">
          
          {/* HEADER with PAGINATION */}
          <div className="flex justify-between items-center mb-2 px-1 shrink-0">
             <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Clinic Status</h3>
                <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded-full text-slate-500 font-bold">
                    Page {currentPage + 1} / {totalPages}
                </span>
             </div>
             <div className="flex gap-2">
                 <button onClick={handlePrev} disabled={currentPage === 0} className="px-3 py-1 bg-white border border-slate-300 rounded text-xs font-bold uppercase hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 shadow-sm">◀ Prev</button>
                 <button onClick={handleNext} disabled={currentPage === totalPages - 1} className="px-3 py-1 bg-white border border-slate-300 rounded text-xs font-bold uppercase hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 shadow-sm">Next ▶</button>
             </div>
          </div>

          {/* GRID: 3x2 */}
          <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3 min-h-0">
            {currentRooms.map((room) => {
                const occupants = tickets.filter(t => (t.status === 'serving' || t.status === 'in_progress') && t.room_number === room.id);
                const isOccupied = occupants.length > 0;
                
                const queueForRoom = waitingTickets.filter(t => t.service_type === room.service).length;
                const avgTime = getAvgTimeForService(room.service);

                return (
                    <div key={room.id} className={`relative rounded-xl border shadow-sm flex flex-col overflow-hidden ${isOccupied ? 'bg-white border-l-[8px] border-l-[#fcc200]' : 'bg-slate-50 border-slate-200'}`}>
                        
                        {/* HEADER */}
                        <div className="px-4 py-2 flex justify-between items-start border-b border-slate-100/50 shrink-0">
                            <div>
                                <h3 className="text-base font-black uppercase text-slate-500 tracking-wider truncate">{room.name}</h3>
                                <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{room.service}</div>
                            </div>
                            {isOccupied && <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded animate-pulse uppercase tracking-wider">Busy</span>}
                        </div>

                        {/* BODY (Patient Info) - BOLDER & BIGGER */}
                        <div className="flex-1 flex flex-col items-center justify-center p-2 min-h-0">
                            {isOccupied ? occupants.map((patient) => (
                                <div key={patient.id} className="flex flex-col items-center w-full animate-in zoom-in-95 duration-300">
                                    {/* UPDATED: Bigger and Bolder Ticket Number */}
                                    <div className="text-8xl lg:text-9xl font-black text-[#1b4d3e] tracking-tighter leading-none mb-1 drop-shadow-sm">
                                        #{patient.id}
                                    </div>
                                    <div className="text-lg font-black text-slate-700 uppercase truncate max-w-[220px] mb-2">
                                        {patient.patient_name}
                                    </div>
                                    <div className="bg-slate-100 text-slate-700 px-4 py-1 rounded-lg text-lg font-mono font-bold flex items-center gap-2 shadow-sm border border-slate-200">
                                        <span className="opacity-50 text-sm">⏱</span>
                                        <span>{getDuration(patient.service_start_time!)}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center opacity-40">
                                    <div className="text-5xl mb-2">🚪</div>
                                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest border-2 border-slate-300 px-4 py-1 rounded">Vacant</span>
                                </div>
                            )}
                        </div>

                        {/* FOOTER: ANALYTICS */}
                        <div className="bg-slate-50/80 border-t border-slate-200 px-3 py-1.5 flex justify-between items-center text-[10px] uppercase font-bold text-slate-500">
                            <div className="flex items-center gap-1">
                                <span>Queue:</span>
                                <span className={`px-1.5 py-0.5 rounded ${queueForRoom > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-200'}`}>
                                    {queueForRoom}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span>Avg Wait:</span>
                                <span className="text-emerald-600">{formatDuration(avgTime)}</span>
                            </div>
                        </div>

                    </div>
                );
            })}
          </div>
      </div>
      
      {/* Demo Button */}
      <button onClick={() => setIsSimulating(!isSimulating)} className={`fixed bottom-4 right-4 z-50 px-3 py-1 rounded-full font-bold shadow-lg text-[10px] uppercase tracking-wider transition-all opacity-20 hover:opacity-100 ${isSimulating ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
          {isSimulating ? 'Stop Demo' : 'Demo'}
      </button>

    </div>
  );
}