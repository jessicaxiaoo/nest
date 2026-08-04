import { useState } from 'react'
import ChecklistView from './components/ChecklistView'
import Dashboard from './components/Dashboard'
import EmptyState from './components/EmptyState'
import PieceChecker from './components/PieceChecker'
import RoomDetail from './components/RoomDetail'
import RoomSetup from './components/RoomSetup'
import { useRooms } from './hooks/useRooms'

function App() {
  const {
    rooms,
    saveError,
    addRoom,
    getRoom,
    deleteRoom,
    addPlan,
    updateLatestPlan,
    updateDimensions,
    addChecklistItem,
    addCheckHistory,
    updateCheckHistory,
    deleteCheckHistory,
    updateChecklistStatus,
    updateChecklistItem,
    deleteChecklistItem,
    updateRoom,
  } = useRooms()
  const [view, setView] = useState(null)
  const [setupKey, setSetupKey] = useState(0)

  const activeView = view ?? (rooms.length === 0 ? 'empty' : 'dashboard')

  function openSetup() {
    setSetupKey((k) => k + 1)
    setView('setup')
  }

  function handleRoomCreated(roomData) {
    const room = addRoom(roomData)
    setView({ type: 'room', id: room.id })
  }

  function handleDeleteRoom(id) {
    deleteRoom(id)
    setView('dashboard')
  }

  function renderDashboard() {
    return (
      <Dashboard
        rooms={rooms}
        onAddRoom={openSetup}
        onOpenRoom={(id) => setView({ type: 'room', id })}
      />
    )
  }

  function renderView() {
    if (activeView === 'empty') {
      return <EmptyState onAddRoom={openSetup} />
    }

    if (activeView === 'setup') {
      return (
        <RoomSetup
          key={setupKey}
          onComplete={handleRoomCreated}
          onCancel={() => setView(rooms.length === 0 ? 'empty' : 'dashboard')}
        />
      )
    }

    if (activeView === 'dashboard') {
      return renderDashboard()
    }

    if (activeView.type === 'checklist') {
      const room = getRoom(activeView.roomId)
      if (!room) return renderDashboard()
      return (
        <ChecklistView
          room={room}
          onBack={() => setView({ type: 'room', id: room.id })}
          onUpdateStatus={(itemId, status) =>
            updateChecklistStatus(room.id, itemId, status)
          }
          onUpdateBudget={(itemId, updates) =>
            updateChecklistItem(room.id, itemId, updates)
          }
          onDeleteItem={(itemId) => deleteChecklistItem(room.id, itemId)}
        />
      )
    }

    if (activeView.type === 'check-piece') {
      const room = getRoom(activeView.roomId)
      if (!room) return renderDashboard()
      return (
        <PieceChecker
          room={room}
          onBack={() => setView({ type: 'room', id: room.id })}
          onSaveToChecklist={(item) =>
            addChecklistItem(room.id, item, 'compatibility')
          }
          onRemoveFromChecklist={(item) => {
            if (item.id) deleteChecklistItem(room.id, item.id)
          }}
          onSaveCheck={(entry) => addCheckHistory(room.id, entry)}
          onUpdateCheck={(checkId, updates) =>
            updateCheckHistory(room.id, checkId, updates)
          }
          onDeleteCheck={(checkId) => deleteCheckHistory(room.id, checkId)}
        />
      )
    }

    if (activeView.type === 'room') {
      const room = getRoom(activeView.id)
      if (!room) return renderDashboard()
      return (
        <RoomDetail
          key={room.id}
          room={room}
          onBack={() => setView('dashboard')}
          onDelete={handleDeleteRoom}
          onUpdateRoom={(updates) => updateRoom(room.id, updates)}
          onCheckPiece={() => setView({ type: 'check-piece', roomId: room.id })}
          onViewChecklist={() =>
            setView({ type: 'checklist', roomId: room.id })
          }
          onPlanGenerated={(plan) => addPlan(room.id, plan)}
          onUpdateAnalysis={(updates) => updateLatestPlan(room.id, updates)}
          onUpdateDimensions={(dims) => updateDimensions(room.id, dims)}
          onSaveToChecklist={(item) => addChecklistItem(room.id, item)}
          onRemoveFromChecklist={(item) => {
            if (item.id) deleteChecklistItem(room.id, item.id)
          }}
        />
      )
    }

    return null
  }

  return (
    <>
      {saveError && (
        <div
          role="alert"
          className="bg-red-50 px-6 py-3 text-center text-sm text-red-700"
        >
          {saveError}
        </div>
      )}
      {renderView()}
    </>
  )
}

export default App
