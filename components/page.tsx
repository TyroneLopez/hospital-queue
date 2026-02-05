'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase, Ticket } from '../../utils/supabase/supabaseClient'

// Define Room Type to match Database
type Room = {
  id: number;
  name: string;
  service: string;
  capacity: number;
  is_active: boolean;
  position: number; // [NEW] Added for sorting
}

export default function StaffDashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [now, setNow] = useState(new Date())
  
  // --- DYNAMIC ROOM STATE ---
  const [rooms, setRooms] = useState<Room[]>([]) 
  const [activeRooms, setActiveRooms] = useState<Record<number, boolean>>({});

  // --- ROOM MANAGER STATE ---
  const [showRoomManager, setShowRoomManager] = useState(false)
  const [newRoom, setNewRoom] = useState({ name: '', service: '', capacity: 1 })

  // [NEW] DRAG AND DROP REFS
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // FILTERS
  const [selectedRoomId, setSelectedRoomId] = useState<number | 'All'>('All')
  const [waitingSearch, setWaitingSearch] = useState('')
  const [servingSearch, setServingSearch] = useState('')

  // --- 1. FETCH & SYNC DATA ---
  const fetchRooms = async () => {
    // [UPDATED] Order by 'position' instead of 'id'
    const { data } = await supabase.from('rooms').select('*').order('position', { ascending: true });
    if (data) {
        setRooms(data);
        // Keep the status map for easy lookup
        const statusMap: Record<number, boolean> = {};
        data.forEach((r: any) => statusMap[r.id] = r.is_active);
        setActiveRooms(statusMap);
    }
  };

  const fetchTickets = async () => {
    const { data } = await supabase.from('tickets').select('*').order('created_at', { ascending: true })
    if (data) setTickets(data)
  }

  // --- 2. ROOM MANAGEMENT ACTIONS ---
  const handleAddRoom = async () => {
    if (!newRoom.name || !newRoom.service) return alert("Name and Service are required!")
    
    // [UPDATED] Calculate new position (append to end)
    const nextPos = rooms.length + 1;

    const { error } = await supabase.from('rooms').insert([
        { name: newRoom.name, service: newRoom.service, capacity: newRoom.capacity, is_active: true, position: nextPos }
    ])

    if (error) alert("Error adding room: " + error.message)
    else {
        setNewRoom({ name: '', service: '', capacity: 1 }) // Reset form
        fetchRooms(); // Refresh list immediately
    }
  }

  const handleDeleteRoom = async (id: number) => {
    if (!confirm("Are you sure? If this room has active tickets, this might fail.")) return;
    
    const { error } = await supabase.from('rooms').delete().eq('id', id)
    if (error) alert("Cannot delete: This room likely has ticket history.")
    else fetchRooms();
  }

  // [NEW] HANDLE DRAG SORTING
  const handleSort = async () => {
    // Duplicate items
    let _rooms = [...rooms];

    // Remove and insert dragged item
    if (dragItem.current === null || dragOverItem.current === null) return;
    const draggedItemContent = _rooms.splice(dragItem.current, 1)[0];
    _rooms.splice(dragOverItem.current, 0, draggedItemContent);

    // Reset Refs
    dragItem.current = null;
    dragOverItem.current = null;

    // Update Local State (Optimistic)
    setRooms(_rooms);

    // Save to Database
    const updates = _rooms.map((room, index) => ({
        id: room.id,
        position: index + 1
    }));

    for (const update of updates) {
        await supabase.from('rooms').update({ position: update.position }).eq('id', update.id);
    }
  };

  // --- 3. TOGGLES ---
  const toggleRoom = async (roomId: number) => {
      const currentStatus = activeRooms[roomId];
      const newStatus = !currentStatus;
      setActiveRooms(prev => ({ ...prev, [roomId]: newStatus }));
      await supabase.from('rooms').update({ is_active: newStatus }).eq('id', roomId);
  };

  const handleGlobalToggle = async () => {
      if (selectedRoomId === 'All') {
          const isAnyOpen = Object.values(activeRooms).some(isOpen => isOpen);
          const confirmMsg = isAnyOpen 
            ? "⚠ CLOSE SOLANO QUEUE? (This will close all clinics)" 
            : "✅ OPEN SOLANO QUEUE? (This will open all clinics)";

          if (window.confirm(confirmMsg)) {
              const newState = !isAnyOpen;
              // Optimistic update
              const newMap: Record<number, boolean> = {};
              rooms.forEach(r => newMap[r.id] = newState);
              setActiveRooms(newMap);
              // DB Update
              await supabase.from('rooms').update({ is_active: newState }).gt('id', 0);
          }
      } else {
          toggleRoom(selectedRoomId);
      }
  };

  useEffect(() => {
    fetchTickets();
    fetchRooms();
    const t = setInterval(() => setNow(new Date()), 1000);

    const ticketSub = supabase.channel('staff_tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, fetchTickets)
      .subscribe();

    const roomSub = supabase.channel('staff_rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, fetchRooms)
      .subscribe();

    return () => { 
        clearInterval(t); 
        supabase.removeChannel(ticketSub);
        supabase.removeChannel(roomSub);
    }
  }, [])

  // --- HELPERS ---
  const getElapsedTime = (startTime: string) => {
    if (!startTime) return '00:00';
    const start = new Date(startTime).getTime();
    const diff = Math.max(0, now.getTime() - start);
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return hours > 0 ? `${hours}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}` : `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
  };

  const isCurrentViewLive = () => {
      if (selectedRoomId === 'All') return Object.values(activeRooms).some(status => status === true);
      return activeRooms[selectedRoomId] ?? true;
  };
  const isLive = isCurrentViewLive();

  // --- FILTERS ---
  const waitingList = tickets.filter(t => {
      if (t.status !== 'waiting') return false;
      const matchesSearch = t.patient_name?.toLowerCase().includes(waitingSearch.toLowerCase()) || t.id.toString().includes(waitingSearch);
      if (!matchesSearch) return false;
      if (selectedRoomId !== 'All') {
        const targetRoom = rooms.find(r => r.id === selectedRoomId);
        if (targetRoom && t.service_type !== targetRoom.service) return false;
      }
      return true;
  });

  const servingList = tickets.filter(t => {
      if (t.status !== 'serving' && t.status !== 'in_progress') return false;
      const matchesSearch = t.patient_name?.toLowerCase().includes(servingSearch.toLowerCase()) || t.id.toString().includes(servingSearch);
      if (!matchesSearch) return false;
      if (selectedRoomId !== 'All' && t.room_number !== selectedRoomId) return false;
      return true;
  }).sort((a, b) => (a.room_number || 0) - (b.room_number || 0));

  // --- ACTIONS ---
  const callPatient = async (ticket: Ticket) => {
    const targetRoom = rooms.find(r => r.service === ticket.service_type);
    if (!targetRoom) {
        alert(`No room found for service: ${ticket.service_type}`);
        return;
    }
    if (!activeRooms[targetRoom.id]) { 
        alert(`Cannot call patient. ${targetRoom.name} is CLOSED.`); 
        return; 
    }
    const currentOccupants = tickets.filter(t => (t.status === 'serving' || t.status === 'in_progress') && t.room_number === targetRoom.id);
    if (currentOccupants.length >= targetRoom.capacity) { 
        alert(`${targetRoom.name} is FULL.`); 
        return; 
    }
    await supabase.from('tickets').update({ status: 'serving', room_number: targetRoom.id, service_start_time: new Date().toISOString() } as any).eq('id', ticket.id);
  };

  const finishTicket = async (id: number | string) => {
    await supabase.from('tickets').update({ status: 'completed', service_end_time: new Date().toISOString() } as any).eq('id', id)
  }

  const returnToQueue = async (id: number | string) => {
    if (!window.confirm("Return patient to queue?")) return;
    await supabase.from('tickets').update({ status: 'waiting', room_number: null } as any).eq('id', id)
  }

  const markNoShow = async (id: number | string) => {
    if(!window.confirm("Mark patient as No Show?")) return;
    await supabase.from('tickets').update({ status: 'cancelled', service_end_time: new Date().toISOString() } as any).eq('id', id)
  }

  // --- RENDER ---
  return (
    <div className="h-full w-full flex flex-col bg-slate-100 overflow-hidden rounded-xl shadow-2xl border border-slate-300 font-sans">
      
      {/* BRANDED HEADER (SOLANO THEME) */}
      <header className="flex-none bg-[#1e3a8a] text-white px-6 py-4 z-10 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Solano Badge */}
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[#1e3a8a] font-black text-xl border-2 border-[#facc15]">
              S
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Solano <span className="text-[#facc15]">SmartQueue</span></h1>
              <p className="text-[10px] text-blue-100 font-medium uppercase tracking-wider">Rural Health Unit Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
                onClick={() => setShowRoomManager(!showRoomManager)}
                className="bg-[#1e40af] hover:bg-[#172554] text-blue-100 px-3 py-1.5 rounded text-xs font-bold uppercase border border-[#1e3a8a] mr-2 transition-colors flex items-center gap-2"
            >
                {showRoomManager ? 'Hide Settings' : '⚙️ Manage Rooms'}
            </button>
            <span className="text-[10px] font-bold uppercase text-blue-200">View:</span>
            <select
              value={selectedRoomId}
              onChange={e => setSelectedRoomId(e.target.value === 'All' ? 'All' : Number(e.target.value))}
              className="rounded bg-[#1e40af] border border-[#1e3a8a] px-3 py-1.5 text-sm font-bold text-white outline-none focus:ring-1 focus:ring-[#facc15]"
            >
              <option value="All">Global Overview</option>
              {rooms.map(room => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* QUICK STATUS STRIP */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto whitespace-nowrap shadow-sm">
        <div className="flex items-center gap-2">
            {rooms.map((room) => {
                const isActive = activeRooms[room.id];
                return (
                    <button
                        key={room.id}
                        onClick={() => toggleRoom(room.id)}
                        className={`
                            px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider border transition-all flex items-center gap-2
                            ${isActive 
                                ? 'bg-blue-50 text-[#1e3a8a] border-blue-200 hover:bg-blue-100' 
                                : 'bg-gray-50 text-gray-400 border-gray-200 grayscale'
                            }
                        `}
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#1e3a8a]' : 'bg-gray-300'}`}></span>
                        {room.name}
                    </button>
                )
            })}
        </div>
      </div>

      {/* ROOM MANAGER PANEL (Collapsible) */}
      {showRoomManager && (
        <div className="bg-slate-50 border-b border-slate-200 p-4 animate-in slide-in-from-top-2">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-black text-[#1e3a8a] uppercase">Manage Clinic Rooms</h3>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">⇅ Drag to Reorder</span>
                </div>
                
                {/* [NEW] DRAGGABLE LIST */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    {rooms.map((r, index) => (
                        <div 
                            key={r.id}
                            draggable 
                            onDragStart={(e) => (dragItem.current = index)}
                            onDragEnter={(e) => (dragOverItem.current = index)}
                            onDragEnd={handleSort}
                            onDragOver={(e) => e.preventDefault()}
                            className="flex justify-between items-center bg-white p-2 border rounded shadow-sm cursor-move active:bg-blue-50 hover:border-blue-400 select-none transition-all"
                        >
                            <div className="truncate flex items-center gap-2">
                                <span className="text-slate-300 text-lg leading-none">⋮⋮</span>
                                <div>
                                    <div className="text-xs font-bold text-[#1e3a8a]">{r.name}</div>
                                    <div className="text-[9px] text-slate-400">{r.service}</div>
                                </div>
                            </div>
                            <button onClick={() => handleDeleteRoom(r.id)} className="text-red-400 hover:text-red-600 px-2 font-bold">×</button>
                        </div>
                    ))}
                </div>

                {/* ADD FORM */}
                <div className="flex flex-wrap gap-2 items-end bg-white p-3 rounded border border-slate-200 shadow-sm inline-flex">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Room Name</label>
                        <input 
                            placeholder="e.g. Table 5" 
                            className="text-xs border p-2 rounded w-32 outline-none focus:border-[#1e3a8a]"
                            value={newRoom.name}
                            onChange={e => setNewRoom({...newRoom, name: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 block mb-1">Service Type</label>
                        <select 
                            className="text-xs border p-2 rounded w-40 outline-none focus:border-[#1e3a8a]"
                            value={newRoom.service}
                            onChange={e => setNewRoom({...newRoom, service: e.target.value})}
                        >
                            <option value="">Select...</option>
                            <option value="Triage / Vitals">Triage / Vitals</option>
                            <option value="Admin / Permits">Admin / Permits</option>
                            <option value="Consultation">Consultation</option>
                            <option value="Immunization">Immunization</option>
                            <option value="Pre-Natal/FP">Pre-Natal/FP</option>
                            <option value="Laboratory">Laboratory</option>
                            <option value="TB / Sputum">TB / Sputum</option>
                            <option value="Dental">Dental</option>
                        </select>
                    </div>
                    <div>
                         <label className="text-[10px] font-bold text-slate-400 block mb-1">Cap.</label>
                         <input 
                            type="number" 
                            className="text-xs border p-2 rounded w-16 outline-none focus:border-[#1e3a8a]"
                            value={newRoom.capacity}
                            onChange={e => setNewRoom({...newRoom, capacity: parseInt(e.target.value)})}
                        />
                    </div>
                    <button 
                        onClick={handleAddRoom}
                        className="bg-[#1e3a8a] text-white px-4 py-2 rounded text-xs font-bold uppercase hover:bg-[#172554]"
                    >
                        + Add Room
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 overflow-hidden relative">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            
            {/* LEFT: WAITING LIST */}
            <section className="bg-white rounded-lg border border-slate-200 flex flex-col overflow-hidden h-full shadow-sm">
                <div className="p-3 border-b border-slate-100 bg-slate-50 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-4 bg-[#1e3a8a] rounded-sm"></span>
                            Waiting List
                        </h2>
                        <span className="bg-[#1e3a8a] text-white px-2 py-0.5 rounded text-xs font-bold">{waitingList.length}</span>
                    </div>
                    <input
                        placeholder="Search patient name or ID..."
                        value={waitingSearch}
                        onChange={e => setWaitingSearch(e.target.value)}
                        className="w-full rounded bg-white border border-slate-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#1e3a8a] outline-none"
                    />
                </div>

                <div className="flex-1 overflow-y-auto bg-white relative">
                    {!isLive && (
                        <div className="absolute inset-0 bg-white/90 z-10 flex items-center justify-center">
                             <div className="text-center">
                                <span className="text-2xl text-slate-300 block mb-1">🔒</span>
                                <p className="text-xs font-bold text-slate-400 uppercase">Queue Closed</p>
                             </div>
                        </div>
                    )}

                    {waitingList.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-300 italic flex-col gap-2">
                            <span>No patients waiting</span>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {waitingList.map(t => {
                                const targetRoom = rooms.find(r => r.service === t.service_type);
                                const isRoomActive = targetRoom && activeRooms[targetRoom.id];
                                const isRoomBusy = targetRoom && tickets.filter(tic => (tic.status === 'serving' || tic.status === 'in_progress') && tic.room_number === targetRoom.id).length >= targetRoom.capacity;

                                return (
                                    <div key={t.id} className="grid grid-cols-12 gap-2 items-center px-4 py-3 hover:bg-blue-50/50 transition-colors group border-l-4 border-l-transparent hover:border-l-[#1e3a8a]">
                                        <div className="col-span-2 text-center"><span className="font-black text-[#1e3a8a] text-lg">#{t.id}</span></div>
                                        <div className="col-span-7">
                                            <span className="font-bold text-slate-800 text-sm block truncate">{t.patient_name}</span>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">{t.service_type}</span>
                                        </div>
                                        <div className="col-span-3 text-right">
                                            <button
                                                onClick={() => callPatient(t)}
                                                disabled={!isRoomActive}
                                                className={`px-3 py-1.5 text-[10px] font-bold rounded shadow-sm uppercase tracking-wide w-full transition-all ${!isRoomActive ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : (isRoomBusy ? 'bg-amber-100 text-amber-700' : 'bg-[#1e3a8a] text-white hover:bg-[#172554]')}`}
                                            >
                                                {!isRoomActive ? 'Closed' : (isRoomBusy ? 'Wait' : 'Call')}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* RIGHT: NOW SERVING */}
            <section className={`bg-white rounded-lg border ${isLive ? 'border-blue-500' : 'border-slate-200'} flex flex-col overflow-hidden h-full shadow-md`}>
                <div className={`p-3 border-b ${isLive ? 'bg-[#1e3a8a] text-white' : 'bg-slate-100 text-slate-500'} flex flex-col gap-2 transition-colors duration-300`}>
                    <div className="flex justify-between items-center">
                        <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            {isLive && <span className="w-2 h-2 bg-[#facc15] rounded-full animate-pulse"></span>}
                            Now Serving
                        </h2>
                        
                        <button 
                            onClick={handleGlobalToggle}
                            className={`px-3 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest transition-all ${isLive ? 'bg-white text-[#c02424] hover:bg-red-50' : 'bg-[#1e3a8a] text-white hover:bg-[#172554]'}`}
                        >
                            {isLive ? 'CLOSE QUEUE' : 'GO LIVE'}
                        </button>
                    </div>
                    {isLive && (
                        <input
                            placeholder="Filter serving list..."
                            value={servingSearch}
                            onChange={e => setServingSearch(e.target.value)}
                            className="w-full rounded bg-[#172554] border-none text-white placeholder-blue-300/50 px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#facc15] outline-none"
                        />
                    )}
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50 relative">
                    {!isLive && (
                        <div className="absolute inset-0 bg-slate-100 z-10 flex flex-col items-center justify-center">
                             <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Operations Suspended</p>
                             <button onClick={handleGlobalToggle} className="px-6 py-2 bg-[#1e3a8a] text-white text-xs font-bold uppercase rounded shadow hover:bg-[#172554]">Start Operations</button>
                        </div>
                    )}

                    {servingList.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">No Active Patients</div>
                    ) : (
                        <div className="p-3 grid gap-3">
                            {servingList.map(t => {
                                const roomName = rooms.find(r => r.id === t.room_number)?.name || `Room ${t.room_number}`;
                                return (
                                    <div key={t.id} className="bg-white p-3 rounded shadow-sm border-l-[6px] border-l-[#facc15] flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="text-[10px] font-black uppercase text-[#1e3a8a] tracking-wider mb-1 block">{roomName}</span>
                                                <span className="font-bold text-slate-900 text-lg leading-none">{t.patient_name}</span>
                                            </div>
                                            <span className="font-mono font-bold text-xs text-[#1e3a8a] bg-blue-50 px-2 py-1 rounded">
                                                {t.service_start_time && getElapsedTime(t.service_start_time)}
                                            </span>
                                        </div>
                                        
                                        <div className="flex gap-2 pt-2 border-t border-slate-100 mt-1">
                                            <button onClick={() => markNoShow(t.id)} className="flex-1 py-1.5 text-[10px] font-bold uppercase text-slate-400 hover:bg-slate-50 rounded">No Show</button>
                                            <button onClick={() => returnToQueue(t.id)} className="flex-1 py-1.5 text-[10px] font-bold uppercase text-blue-600 hover:bg-blue-50 rounded">Return</button>
                                            <button onClick={() => finishTicket(t.id)} className="flex-1 py-1.5 text-[10px] font-bold uppercase text-white bg-[#1e3a8a] hover:bg-[#172554] rounded shadow-sm">Complete</button>
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