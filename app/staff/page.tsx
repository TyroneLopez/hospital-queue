'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase, Ticket } from '../../utils/supabase/supabaseClient'
import { runAutoCall, runAutoComplete, generateRandomPatient, Room } from '../../utils/autoPilot'

export default function StaffDashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [now, setNow] = useState(new Date())
  
  // --- STATE ---
  const [rooms, setRooms] = useState<Room[]>([]) 
  const [activeRooms, setActiveRooms] = useState<Record<number, boolean>>({});
  
  // 👇 NEW: State for dynamic services
  const [serviceOptions, setServiceOptions] = useState<any[]>([]);

  // --- SIMULATION STATES ---
  const [autoPilotRooms, setAutoPilotRooms] = useState<Record<number, boolean>>({});
  const [isDemoArrivals, setIsDemoArrivals] = useState(false); 
  const [isAutoComplete, setIsAutoComplete] = useState(false); 

  // ROOM MANAGER
  const [showRoomManager, setShowRoomManager] = useState(false)
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [newRoom, setNewRoom] = useState({ name: '', service: '', capacity: 1 })

  // REFS
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // FILTERS
  const [selectedRoomId, setSelectedRoomId] = useState<number | 'All'>('All')
  const [waitingSearch, setWaitingSearch] = useState('')
  const [servingSearch, setServingSearch] = useState('')

  // --- DATA FETCHING ---

  // 👇 NEW: Fetch services from Supabase
  const fetchServices = async () => {
    const { data } = await supabase.from('services').select('*');
    if (data) {
      setServiceOptions(data);
    }
  };

  const fetchRooms = async () => {
    const { data } = await supabase.from('rooms').select('*').order('position', { ascending: true });
    if (data) {
        setRooms(data as any); 
        const statusMap: Record<number, boolean> = {};
        data.forEach((r: any) => statusMap[r.id] = r.is_active);
        setActiveRooms(statusMap);
        
        setAutoPilotRooms(prev => {
            const autoMap: Record<number, boolean> = {...prev};
            data.forEach((r: any) => {
                if (autoMap[r.id] === undefined) autoMap[r.id] = false;
            });
            return autoMap;
        });
    }
  };

  const fetchTickets = async () => {
    const { data } = await supabase
        .from('tickets')
        .select('*')
        .in('status', ['waiting', 'serving', 'in_progress']) 
        .order('created_at', { ascending: true });

    if (data) setTickets(data as any);
  }

  // --- LOGIC ENGINE ---
  useEffect(() => {
    let arrivalInterval: NodeJS.Timeout;
    let callInterval: NodeJS.Timeout;
    let completeInterval: NodeJS.Timeout;

    if (isDemoArrivals && rooms.length > 0) {
        arrivalInterval = setInterval(() => {
            generateRandomPatient(rooms);
        }, 3000);
    }

    if (isAutoComplete) {
        completeInterval = setInterval(() => {
            runAutoComplete(tickets);
        }, 2000);
    }

    callInterval = setInterval(() => {
        const enabledAutoRooms = rooms.filter(r => activeRooms[r.id] && autoPilotRooms[r.id]);
        if (enabledAutoRooms.length > 0) {
            runAutoCall(tickets, enabledAutoRooms, activeRooms);
        }
    }, 2000);

    return () => {
        clearInterval(arrivalInterval);
        clearInterval(callInterval);
        clearInterval(completeInterval);
    };
  }, [isDemoArrivals, isAutoComplete, rooms, tickets, activeRooms, autoPilotRooms]); 

  // --- ACTIONS ---
  const handleAddRoom = async () => {
    if (!newRoom.name || !newRoom.service) return alert("Required fields missing")
    const nextPos = rooms.length + 1;
    
    await (supabase.from('rooms') as any).insert([{ ...newRoom, is_active: true, position: nextPos }])
    
    setNewRoom({ name: '', service: '', capacity: 1 })
    fetchRooms();
  }

  const handleUpdateRoom = async () => {
    if (!editingRoomId) return;
    
    await (supabase.from('rooms') as any)
      .update({ name: newRoom.name, service: newRoom.service, capacity: newRoom.capacity })
      .eq('id', editingRoomId);

    setNewRoom({ name: '', service: '', capacity: 1 });
    setEditingRoomId(null);
    fetchRooms();
  }

  const startEditing = (room: Room) => {
    setEditingRoomId(room.id);
    setNewRoom({ name: room.name, service: room.service, capacity: room.capacity });
  }

  const cancelEdit = () => {
    setEditingRoomId(null);
    setNewRoom({ name: '', service: '', capacity: 1 });
  }

  const handleDeleteRoom = async (id: number) => {
    if (!confirm("Delete?")) return;
    if (editingRoomId === id) cancelEdit();
    
    await (supabase.from('rooms') as any).delete().eq('id', id)
    fetchRooms();
  }

  const handleSort = async () => {
    let _rooms = [...rooms];
    if (dragItem.current === null || dragOverItem.current === null) return;
    const draggedItemContent = _rooms.splice(dragItem.current, 1)[0];
    _rooms.splice(dragOverItem.current, 0, draggedItemContent);
    dragItem.current = null;
    dragOverItem.current = null;
    setRooms(_rooms);
    const updates = _rooms.map((room, index) => ({ id: room.id, position: index + 1 }));
    
    for (const update of updates) {
        await (supabase.from('rooms') as any).update({ position: update.position }).eq('id', update.id);
    }
  };

  const toggleRoom = async (roomId: number) => {
      const newStatus = !activeRooms[roomId];
      setActiveRooms(prev => ({ ...prev, [roomId]: newStatus }));
      if (!newStatus) setAutoPilotRooms(prev => ({ ...prev, [roomId]: false }));
      
      await (supabase.from('rooms') as any).update({ is_active: newStatus }).eq('id', roomId);
  };

  const toggleAutoPilot = (roomId: number) => {
      if (!activeRooms[roomId]) return alert("Open the room first.");
      setAutoPilotRooms(prev => ({ ...prev, [roomId]: !prev[roomId] }));
  };

  const handleGlobalToggle = async () => {
      if (selectedRoomId === 'All') {
          const isAnyOpen = Object.values(activeRooms).some(isOpen => isOpen);
          if (window.confirm(isAnyOpen ? "Close All?" : "Open All?")) {
              const newState = !isAnyOpen;
              const newMap: Record<number, boolean> = {};
              rooms.forEach(r => newMap[r.id] = newState);
              setActiveRooms(newMap);
              setAutoPilotRooms({});
              
              await (supabase.from('rooms') as any).update({ is_active: newState }).gt('id', 0);
          }
      } else {
          toggleRoom(selectedRoomId);
      }
  };

  // --- INITIAL LOAD ---
  useEffect(() => {
    fetchTickets();
    fetchRooms();
    fetchServices(); // 👈 NEW: Called here
    const t = setInterval(() => setNow(new Date()), 1000);
    const sub1 = supabase.channel('st1').on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, fetchTickets).subscribe();
    const sub2 = supabase.channel('sr1').on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, fetchRooms).subscribe();
    return () => { clearInterval(t); supabase.removeChannel(sub1); supabase.removeChannel(sub2); }
  }, [])

  // --- HELPERS ---
  const getElapsedTime = (startTime: string) => {
    if (!startTime) return '00:00';
    const diff = Math.max(0, now.getTime() - new Date(startTime).getTime());
    return `${Math.floor(diff / 60000)}:${Math.floor((diff % 60000) / 1000).toString().padStart(2,'0')}`;
  };

  const isLive = selectedRoomId === 'All' ? Object.values(activeRooms).some(s=>s) : (activeRooms[selectedRoomId] ?? true);

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

  const callPatient = async (ticket: Ticket) => {
    const targetRoom = rooms.find(r => r.service === ticket.service_type);
    if (!targetRoom || !activeRooms[targetRoom.id]) return alert("Room unavailable");
    const count = tickets.filter(t => (t.status === 'serving' || t.status === 'in_progress') && t.room_number === targetRoom.id).length;
    if (count >= targetRoom.capacity) return alert("Room Full");
    
    await (supabase.from('tickets') as any)
        .update({ status: 'serving', room_number: targetRoom.id, service_start_time: new Date().toISOString() })
        .eq('id', ticket.id);
  };

  const finishTicket = async (id: number | string) => {
    await (supabase.from('tickets') as any)
        .update({ status: 'completed', service_end_time: new Date().toISOString() })
        .eq('id', id)
  }
  const returnToQueue = async (id: number | string) => {
    if (!window.confirm("Return?")) return;
    
    await (supabase.from('tickets') as any)
        .update({ status: 'waiting', room_number: null })
        .eq('id', id)
  }
  const markNoShow = async (id: number | string) => {
    if(!window.confirm("No Show?")) return;
    
    await (supabase.from('tickets') as any)
        .update({ status: 'cancelled', service_end_time: new Date().toISOString() })
        .eq('id', id)
  }

  return (
    <div className="h-full w-full flex flex-col bg-slate-100 overflow-hidden rounded-xl shadow-2xl border border-slate-300 font-sans relative">
      
      {/* HEADER */}
      <header className="flex-none bg-[#1e3a8a] text-white px-6 py-4 z-10 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[#1e3a8a] font-black text-xl border-2 border-[#facc15]">S</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SmartQueue</h1>
              <p className="text-[10px] text-blue-100 font-medium uppercase tracking-wider">Nueva Vizcaya State University</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowRoomManager(!showRoomManager)} className="bg-[#1e40af] hover:bg-[#172554] text-blue-100 px-3 py-1.5 rounded text-xs font-bold uppercase border border-[#1e3a8a] mr-2 transition-colors">
                {showRoomManager ? 'Hide Settings' : '⚙️ Manage Rooms'}
            </button>
            <select value={selectedRoomId} onChange={e => setSelectedRoomId(e.target.value === 'All' ? 'All' : Number(e.target.value))} className="rounded bg-[#1e40af] border border-[#1e3a8a] px-3 py-1.5 text-sm font-bold text-white outline-none focus:ring-1 focus:ring-[#facc15]">
              <option value="All">Global Overview</option>
              {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* QUICK STATUS STRIP */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shadow-sm flex items-center gap-4 overflow-x-auto">
         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Room Controls:</span>
         <div className="flex gap-3">
            {rooms.map((room) => {
                const isActive = activeRooms[room.id];
                const isAuto = autoPilotRooms[room.id];
                return (
                    <div key={room.id} className={`flex items-center border rounded-md transition-all shadow-sm select-none ${isActive ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50 grayscale'}`}>
                        <button onClick={() => toggleRoom(room.id)} className="px-3 py-1.5 flex items-center gap-2 hover:bg-black/5 transition-colors border-r border-black/5 outline-none" title={isActive ? "Close Room" : "Open Room"}>
                            <div className={`w-2 h-2 rounded-full shadow-sm ${isActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-[#1e3a8a]' : 'text-slate-400'}`}>{room.name}</span>
                        </button>
                        <button onClick={() => toggleAutoPilot(room.id)} disabled={!isActive} className={`px-2 py-1.5 flex items-center justify-center transition-colors outline-none w-10 ${!isActive ? 'cursor-not-allowed opacity-20' : (isAuto ? 'bg-purple-100 text-purple-600 hover:bg-purple-200' : 'hover:bg-black/5 text-slate-400')}`} title="Toggle Auto-Call">
                             <span className={`text-sm transform transition-transform ${isAuto ? 'scale-110' : 'scale-100'}`}>{isAuto ? '🤖' : '👤'}</span>
                        </button>
                    </div>
                )
            })}
         </div>
      </div>

      {/* ROOM MANAGER PANEL */}
      {showRoomManager && (
        <div className="bg-slate-50 border-b border-slate-200 p-4 animate-in slide-in-from-top-2">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-black text-[#1e3a8a] uppercase">{editingRoomId ? `Editing: ${rooms.find(r => r.id === editingRoomId)?.name}` : 'Manage Clinic Rooms'}</h3>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{editingRoomId ? '📝 Edit Mode' : '⇅ Drag to Reorder | 🖱 Click to Edit'}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                    {rooms.map((r, index) => {
                        const isEditing = editingRoomId === r.id;
                        return (
                            <div key={r.id} draggable={!editingRoomId} onDragStart={() => (dragItem.current = index)} onDragEnter={() => (dragOverItem.current = index)} onDragEnd={handleSort} onDragOver={(e) => e.preventDefault()} onClick={() => startEditing(r)} className={`flex justify-between items-center p-2 border rounded shadow-sm cursor-pointer select-none transition-all ${isEditing ? 'bg-blue-50 border-[#1e3a8a] ring-1 ring-[#1e3a8a] z-10 scale-105' : 'bg-white hover:border-blue-400 hover:bg-blue-50/20 active:bg-blue-50'}`}>
                                <div className="truncate flex items-center gap-2">
                                    <span className={`text-lg leading-none ${isEditing ? 'text-[#1e3a8a]' : 'text-slate-300'}`}>{isEditing ? '✎' : '⋮⋮'}</span>
                                    <div><div className="text-xs font-bold text-[#1e3a8a]">{r.name}</div><div className="text-[9px] text-slate-400">{r.service}</div></div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteRoom(r.id); }} className="text-red-400 hover:text-red-600 px-2 font-bold z-20">×</button>
                            </div>
                        );
                    })}
                </div>
                <div className={`flex flex-wrap gap-2 items-end p-3 rounded border shadow-sm inline-flex transition-colors ${editingRoomId ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
                    <div><label className="text-[10px] font-bold text-slate-400 block mb-1">Room Name</label><input placeholder="e.g. Table 5" className="text-xs border p-2 rounded w-32 outline-none focus:border-[#1e3a8a]" value={newRoom.name} onChange={e => setNewRoom({...newRoom, name: e.target.value})} /></div>
                    
                    {/* 👇 THIS IS THE UPDATED DYNAMIC SECTION */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 block mb-1">Service Type</label>
                      <select 
                        className="text-xs border p-2 rounded w-40 outline-none focus:border-[#1e3a8a]" 
                        value={newRoom.service} 
                        onChange={e => setNewRoom({...newRoom, service: e.target.value})}
                      >
                        <option value="">Select...</option>
                        {serviceOptions.map((service) => (
                          <option key={service.id} value={service.name}>
                            {service.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div><label className="text-[10px] font-bold text-slate-400 block mb-1">Cap.</label><input type="number" className="text-xs border p-2 rounded w-16 outline-none focus:border-[#1e3a8a]" value={newRoom.capacity} onChange={e => setNewRoom({...newRoom, capacity: parseInt(e.target.value)})} /></div>
                    {editingRoomId ? (<><button onClick={handleUpdateRoom} className="bg-[#1e3a8a] text-white px-4 py-2 rounded text-xs font-bold uppercase hover:bg-[#172554] shadow-md">Save</button><button onClick={cancelEdit} className="bg-slate-200 text-slate-600 px-3 py-2 rounded text-xs font-bold uppercase hover:bg-slate-300">Cancel</button></>) : (<button onClick={handleAddRoom} className="bg-[#1e3a8a] text-white px-4 py-2 rounded text-xs font-bold uppercase hover:bg-[#172554]">+ Add Room</button>)}
                </div>
            </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 overflow-hidden relative mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            {/* WAITING LIST */}
            <section className="bg-white rounded-lg border border-slate-200 flex flex-col overflow-hidden h-full shadow-sm">
                <div className="p-3 border-b border-slate-100 bg-slate-50 flex flex-col gap-2">
                    <div className="flex justify-between items-center"><h2 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><span className="w-2 h-4 bg-[#1e3a8a] rounded-sm"></span>Waiting List</h2><span className="bg-[#1e3a8a] text-white px-2 py-0.5 rounded text-xs font-bold">{waitingList.length}</span></div>
                    <input placeholder="Search..." value={waitingSearch} onChange={e => setWaitingSearch(e.target.value)} className="w-full rounded bg-white border border-slate-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#1e3a8a] outline-none" />
                </div>
                <div className="flex-1 overflow-y-auto bg-white relative">
                    {!isLive && <div className="absolute inset-0 bg-white/90 z-10 flex items-center justify-center"><div className="text-center"><span className="text-2xl text-slate-300 block mb-1">🔒</span><p className="text-xs font-bold text-slate-400 uppercase">Queue Closed</p></div></div>}
                    {waitingList.length === 0 ? <div className="h-full flex items-center justify-center text-slate-300 italic">No patients</div> : <div className="divide-y divide-slate-100">
                        {waitingList.map(t => {
                            const targetRoom = rooms.find(r => r.service === t.service_type);
                            const isRoomActive = targetRoom && activeRooms[targetRoom.id];
                            const isRoomBusy = targetRoom && tickets.filter(tic => (tic.status === 'serving' || tic.status === 'in_progress') && tic.room_number === targetRoom.id).length >= targetRoom.capacity;
                            return (
                                <div key={t.id} className="grid grid-cols-12 gap-2 items-center px-4 py-3 hover:bg-blue-50/50 transition-colors border-l-4 border-l-transparent hover:border-l-[#1e3a8a]">
                                    <div className="col-span-2 text-center"><span className="font-black text-[#1e3a8a] text-lg">#{t.id}</span></div>
                                    <div className="col-span-7"><span className="font-bold text-slate-800 text-sm block truncate">{t.patient_name}</span><span className="text-[10px] font-bold text-slate-400 uppercase">{t.service_type}</span></div>
                                    <div className="col-span-3 text-right"><button onClick={() => callPatient(t)} disabled={!isRoomActive} className={`px-3 py-1.5 text-[10px] font-bold rounded shadow-sm uppercase tracking-wide w-full transition-all ${!isRoomActive ? 'bg-slate-100 text-slate-400' : (isRoomBusy ? 'bg-amber-100 text-amber-700' : 'bg-[#1e3a8a] text-white hover:bg-[#172554]')}`}>{!isRoomActive ? 'Closed' : (isRoomBusy ? 'Wait' : 'Call')}</button></div>
                                </div>
                            );
                        })}
                    </div>}
                </div>
            </section>

            {/* SERVING LIST */}
            <section className={`bg-white rounded-lg border ${isLive ? 'border-blue-500' : 'border-slate-200'} flex flex-col overflow-hidden h-full shadow-md`}>
                <div className={`p-3 border-b ${isLive ? 'bg-[#1e3a8a] text-white' : 'bg-slate-100 text-slate-500'} flex flex-col gap-2 transition-colors duration-300`}>
                    <div className="flex justify-between items-center"><h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">{isLive && <span className="w-2 h-2 bg-[#facc15] rounded-full animate-pulse"></span>}Now Serving</h2><button onClick={handleGlobalToggle} className={`px-3 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest transition-all ${isLive ? 'bg-white text-[#c02424] hover:bg-red-50' : 'bg-[#1e3a8a] text-white hover:bg-[#172554]'}`}>{isLive ? 'CLOSE QUEUE' : 'GO LIVE'}</button></div>
                    {isLive && <input placeholder="Filter..." value={servingSearch} onChange={e => setServingSearch(e.target.value)} className="w-full rounded bg-[#172554] border-none text-white placeholder-blue-300/50 px-3 py-1.5 text-sm focus:ring-1 focus:ring-[#facc15] outline-none" />}
                </div>
                <div className="flex-1 overflow-y-auto bg-slate-50 relative">
                    {!isLive && <div className="absolute inset-0 bg-slate-100 z-10 flex flex-col items-center justify-center"><p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Operations Suspended</p><button onClick={handleGlobalToggle} className="px-6 py-2 bg-[#1e3a8a] text-white text-xs font-bold uppercase rounded shadow hover:bg-[#172554]">Start Operations</button></div>}
                    {servingList.length === 0 ? <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">No Active Patients</div> : <div className="p-3 grid gap-3">
                        {servingList.map(t => {
                            const roomName = rooms.find(r => r.id === t.room_number)?.name || `Room ${t.room_number}`;
                            return (
                                <div key={t.id} className="bg-white p-3 rounded shadow-sm border-l-[6px] border-l-[#facc15] flex flex-col gap-2">
                                    <div className="flex justify-between items-start"><div><span className="text-[10px] font-black uppercase text-[#1e3a8a] tracking-wider mb-1 block">{roomName}</span><span className="font-bold text-slate-900 text-lg leading-none">{t.patient_name}</span></div><span className="font-mono font-bold text-xs text-[#1e3a8a] bg-blue-50 px-2 py-1 rounded">{t.service_start_time && getElapsedTime(t.service_start_time)}</span></div>
                                    <div className="flex gap-2 pt-2 border-t border-slate-100 mt-1"><button onClick={() => markNoShow(t.id)} className="flex-1 py-1.5 text-[10px] font-bold uppercase text-slate-400 hover:bg-slate-50 rounded">No Show</button><button onClick={() => returnToQueue(t.id)} className="flex-1 py-1.5 text-[10px] font-bold uppercase text-blue-600 hover:bg-blue-50 rounded">Return</button><button onClick={() => finishTicket(t.id)} className="flex-1 py-1.5 text-[10px] font-bold uppercase text-white bg-[#1e3a8a] hover:bg-[#172554] rounded shadow-sm">Complete</button></div>
                                </div>
                            );
                        })}
                    </div>}
                </div>
            </section>
        </div>
      </main>

      {/* FLOATING DEMO BUTTONS */}
      <div className="fixed bottom-1 right-4 z-50 flex gap-2">
          {/* 1. AUTO-COMPLETE BUTTON (FINISH) */}
          <button 
              onClick={() => setIsAutoComplete(!isAutoComplete)} 
              className={`px-4 py-1.5 rounded-full font-bold shadow-lg text-[10px] uppercase tracking-wider transition-all opacity-90 hover:opacity-100 ${isAutoComplete ? 'bg-orange-500 text-white animate-pulse' : 'bg-slate-700 text-slate-300'}`}
          >
              {isAutoComplete ? '⏹ Stop Auto-Complete' : '⚡ Start Auto-Complete'}
          </button>

          {/* 2. DEMO ARRIVALS BUTTON (START) */}
          <button 
              onClick={() => setIsDemoArrivals(!isDemoArrivals)} 
              className={`px-4 py-1.5 rounded-full font-bold shadow-lg text-[10px] uppercase tracking-wider transition-all opacity-90 hover:opacity-100 ${isDemoArrivals ? 'bg-green-600 text-white animate-pulse' : 'bg-slate-800 text-slate-400'}`}
          >
              {isDemoArrivals ? '⏹ Stop Demo Arrivals' : '▶ Start Demo Arrivals'}
          </button>
      </div>

    </div>
  )
}