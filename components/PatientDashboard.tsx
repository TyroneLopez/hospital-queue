"use client";

import React, { useEffect, useState } from 'react';
import { supabase, Ticket } from '../utils/supabase/supabaseClient';
import { BRAND } from '../utils/theme'; // <--- IMPORT THE THEME

const ITEMS_PER_PAGE = 6; 

type Room = { 
  id: number; 
  name: string; 
  service: string; 
  capacity: number; 
  is_active: boolean; 
  position: number; 
}

export default function PatientDashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [now, setNow] = useState(new Date());
  
  const [activeRooms, setActiveRooms] = useState<Record<number, boolean>>({});
  const [currentPage, setCurrentPage] = useState(0);

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ 
    key: 'id', direction: 'asc' 
  });
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>('All');


  // --- DATA FETCHING ---
  const fetchRooms = async () => {
      const { data } = await supabase.from('rooms').select('*').order('position', { ascending: true });
      if (data) {
          setRooms(data);
          const statusMap: Record<number, boolean> = {};
          data.forEach((r: any) => statusMap[r.id] = r.is_active);
          setActiveRooms(statusMap);
      }
  };

  const fetchTickets = async () => {
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: true });
    setTickets(data ?? []);
  };

  useEffect(()=>{
    fetchTickets();
    fetchRooms(); 
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);

    const ticketChannel = supabase
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

    const roomChannel = supabase
      .channel('public:rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => fetchRooms())
      .subscribe();

    // SIMULATOR
    const simInterval = setInterval(async () => {
        if (!isSimulating || rooms.length === 0) return;
        
        const prefixes = ['Guest', 'Student', 'Faculty'];
        const randomName = `${prefixes[Math.floor(Math.random() * prefixes.length)]} #${Math.floor(Math.random()*900)+100}`;
        
        const services = rooms.map(r => r.service);
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
        supabase.removeChannel(ticketChannel);
        supabase.removeChannel(roomChannel);
    };
  }, [isSimulating, rooms]); 

  // --- HELPER CALCULATIONS ---
  const waitingTickets = tickets.filter((t) => t.status === 'waiting');

  const getAvgTimeForService = (serviceName: string) => {
      const completedForService = tickets.filter(t => 
        t.status === 'completed' && 
        t.service_type === serviceName &&
        t.service_start_time && t.service_end_time
      );

      const durations = completedForService.map(t => {
         const start = new Date(t.service_start_time!).getTime();
         const end = new Date(t.service_end_time!).getTime();
         return end - start;
      });

      const validDurations = durations.filter(d => d > 30000 && d < 7200000);
      if (validDurations.length === 0) return 15 * 60000;

      const recentDurations = validDurations.slice(-5); 
      const total = recentDurations.reduce((acc, curr) => acc + curr, 0);
      return total / recentDurations.length;
  };

  const formatDuration = (ms: number) => {
      if (ms < 60000) return "< 1 min"; 
      const minutes = Math.floor(ms / 60000);
      return `${minutes} min`;
  };

  const getProjectedTime = (ticket: Ticket) => {
      const room = rooms.find(r => r.service === ticket.service_type);
      if (room && activeRooms[room.id] === false) return "CLOSED";

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

  const filteredQueue = waitingTickets.filter(t => {
      if (selectedServiceFilter === 'All') return true;
      return t.service_type === selectedServiceFilter;
  });

  const sortedQueue = [...filteredQueue].sort((a: any, b: any) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
  });

  const totalPages = Math.ceil(rooms.length / ITEMS_PER_PAGE);
  const currentRooms = rooms.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
  const handleNext = () => { if (currentPage < totalPages - 1) setCurrentPage(p => p + 1); };
  const handlePrev = () => { if (currentPage > 0) setCurrentPage(p => p - 1); };

  const uniqueServices = Array.from(new Set(rooms.map(r => r.service)));

  return (
    <div className={`h-full w-full flex gap-3 p-1 overflow-hidden bg-slate-50 ${BRAND.font}`}>
      
      {/* ------------------------------------------------ */}
      {/* LEFT COLUMN: QUEUE + FILTERS (30% Width)         */}
      {/* ------------------------------------------------ */}
      <div className="w-[30%] flex flex-col bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden h-[calc(100vh-135px)]">
         <div 
            className="border-b-4 p-3 shrink-0"
            style={{ 
                backgroundColor: BRAND.colors.primary, 
                borderColor: BRAND.colors.secondary 
            }}
         >
            <h1 className="text-xl font-bold tracking-tight leading-none mb-3" style={{ color: BRAND.colors.primaryText }}>Waiting List</h1>
            
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase" style={{ color: BRAND.colors.textHighlight }}>Filter:</span>
                <select 
                    value={selectedServiceFilter}
                    onChange={(e) => setSelectedServiceFilter(e.target.value)}
                    className="flex-1 text-xs border-none rounded px-2 py-1 font-bold bg-white focus:outline-none focus:ring-2"
                    style={{ 
                        color: BRAND.colors.primary,
                        // @ts-ignore - Tailwind CSS Variable hack
                        '--tw-ring-color': BRAND.colors.secondary 
                    }}
                >
                    <option value="All">All Services</option>
                    {uniqueServices.map(s => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            </div>

            <div className="text-[9px] uppercase font-bold" style={{ color: BRAND.colors.textHighlight }}>
                Sorted by: <span className="text-white">{sortConfig.key}</span>
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
                            <tr 
                                key={t.id} 
                                className="transition-colors border-l-4 border-l-transparent hover:bg-slate-100"
                                style={{ 
                                    // We use inline styles to override the hover color dynamically if needed, 
                                    // but specifically for the border color on hover:
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderLeftColor = BRAND.colors.primary; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderLeftColor = 'transparent'; }}
                            >
                                <td className="px-3 py-3">
                                    <div className="text-lg font-black leading-none" style={{ color: BRAND.colors.primary }}>#{t.id}</div>
                                    <div className="text-[10px] font-bold text-slate-500 uppercase truncate max-w-[80px] mt-1">
                                        {t.patient_name}
                                    </div>
                                </td>
                                <td className="px-3 py-3">
                                    <span 
                                        className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded uppercase border"
                                        style={{ 
                                            backgroundColor: BRAND.colors.primary,
                                            borderColor: BRAND.colors.primary 
                                        }}
                                    >
                                        {t.service_type || 'General'}
                                    </span>
                                </td>
                                <td className="px-3 py-3 text-right">
                                    <div className={`font-mono font-bold text-xs ${getProjectedTime(t) === 'CLOSED' ? 'text-red-500' : 'text-slate-400'}`}>
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
      {/* RIGHT COLUMN: DYNAMIC ROOM GRID (70%)            */}
      {/* ------------------------------------------------ */}
      <div className="flex-1 flex flex-col h-[570px] min-h-0 bg-slate-100 rounded-xl border border-slate-300 p-2 shadow-inner ">
          
          {/* HEADER with PAGINATION */}
          <div className="flex justify-between items-center mb-2 px-1 shrink-0">
             <div className="flex items-center gap-2">
                <h3 className="text-sm font-black uppercase tracking-widest" style={{ color: BRAND.colors.primary }}>Service Status</h3>
                <span className="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-500 font-bold">
                    Page {currentPage + 1} / {totalPages || 1}
                </span>
             </div>
             <div className="flex gap-2">
                 <button onClick={handlePrev} disabled={currentPage === 0} className="px-3 py-1 bg-white border border-slate-300 rounded text-xs font-bold uppercase hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 shadow-sm" style={{ color: currentPage > 0 ? BRAND.colors.primary : '' }}>◀ Prev</button>
                 <button onClick={handleNext} disabled={currentPage === totalPages - 1} className="px-3 py-1 bg-white border border-slate-300 rounded text-xs font-bold uppercase hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 shadow-sm" style={{ color: currentPage < totalPages - 1 ? BRAND.colors.primary : '' }}>Next ▶</button>
             </div>
          </div>

          {/* DYNAMIC GRID: 3x2 */}
          <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3 min-h-0">
            {currentRooms.map((room) => {
                const occupants = tickets.filter(t => (t.status === 'serving' || t.status === 'in_progress') && t.room_number === room.id);
                const isOccupied = occupants.length > 0;
                
                // Use dynamic active status
                const isLive = activeRooms[room.id] ?? true; 
                
                const queueForRoom = waitingTickets.filter(t => t.service_type === room.service).length;
                const avgTime = getAvgTimeForService(room.service);

                return (
                    <div 
                        key={room.id} 
                        className={`relative rounded-xl border shadow-sm flex flex-col overflow-hidden transition-all ${isOccupied ? 'bg-white border-l-[8px]' : 'bg-slate-50 border-slate-200'}`}
                        style={{ borderLeftColor: isOccupied ? BRAND.colors.secondary : '' }}
                    >
                        
                        {/* HEADER */}
                        <div className="px-4 py-2 flex justify-between items-start border-b border-slate-100/50 shrink-0">
                            <div>
                                <h3 
                                    className="text-base font-black uppercase tracking-wider truncate"
                                    style={{ color: isLive ? BRAND.colors.primary : '#64748b' }}
                                >
                                    {room.name}
                                </h3>
                                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND.colors.secondary }}>{room.service}</div>
                            </div>
                            
                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${isLive ? (isOccupied ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-blue-50 text-blue-600 border-blue-200') : 'bg-slate-200 text-slate-500 border-slate-300'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? (isOccupied ? 'bg-amber-500 animate-pulse' : 'bg-blue-500 animate-pulse') : 'bg-slate-400'}`}></span>
                                {isLive ? (isOccupied ? 'Busy' : 'Live') : 'Closed'}
                            </div>
                        </div>

                        {/* BODY (Patient Info) */}
                        <div className="flex-1 flex flex-col items-center justify-center p-2 min-h-0">
                            
                            {!isLive ? (
                                // --- CLOSED STATE ---
                                <div className="text-center opacity-40">
                                    <div className="text-5xl mb-2 grayscale">🔒</div>
                                    <span className="text-sm font-bold text-slate-400 uppercase tracking-widest border-2 border-slate-300 px-4 py-1 rounded bg-slate-100">
                                        Clinic Closed
                                    </span>
                                </div>
                            ) : isOccupied ? (
                                // --- OCCUPIED STATE ---
                                occupants.map((patient) => (
                                    <div key={patient.id} className="flex flex-col items-center w-full animate-in zoom-in-95 duration-300">
                                        <div 
                                            className="text-xl font-black tracking-tighter leading-none mb-1 drop-shadow-sm"
                                            style={{ color: BRAND.colors.primary }}
                                        >
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
                                ))
                            ) : (
                                // --- VACANT STATE ---
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
                                <span className={`px-1.5 py-0.5 rounded ${queueForRoom > 0 && isLive ? 'bg-red-100 text-red-600' : 'bg-slate-200'}`}>
                                    {isLive ? queueForRoom : '-'}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span>Est. Wait:</span>
                                <span className={`${queueForRoom > 0 ? 'text-red-600' : 'text-blue-600'}`}>
                                    {!isLive 
                                        ? 'CLOSED' 
                                        : (queueForRoom === 0 
                                            ? (isOccupied ? 'Next' : 'Available') 
                                            : formatDuration(avgTime * queueForRoom)
                                        )
                                    }
                                </span>
                            </div>
                        </div>

                    </div>
                );
            })}
          </div>
      </div>
      
      {/* Demo Button */}
      <button onClick={() => setIsSimulating(!isSimulating)} className={`fixed bottom-2 right-4 z-50 px-3 py-1 rounded-full font-bold shadow-lg text-[10px] uppercase tracking-wider transition-all opacity-20 hover:opacity-100 ${isSimulating ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
          {isSimulating ? 'Stop Demo' : 'Demo'}
      </button>

    </div>
  );
}