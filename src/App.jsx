import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ReadingsProvider, useReadings } from './context/ReadingsContext.jsx';
import { Layout } from './components/Layout.jsx';
import { ReadingModal } from './components/ReadingModal.jsx';
import { DeleteConfirmModal } from './components/DeleteConfirmModal.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ReportsPage } from './pages/ReportsPage.jsx';
import { HistoryPage } from './pages/HistoryPage.jsx';
import { AssistantPage } from './pages/AssistantPage.jsx';
import { getLocalDateString } from './utils/glucose.js';

function AuthenticatedShell() {
  const { readings, addReading, editReading, removeReading } = useReadings();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState(getLocalDateString());
  const [modalSlot, setModalSlot] = useState(undefined);
  const [editingReading, setEditingReading] = useState(null);
  const [deletingReading, setDeletingReading] = useState(null);

  const handleOpenAddModal = (date, slot) => {
    setEditingReading(null);
    setModalDate(date);
    setModalSlot(slot);
    setModalOpen(true);
  };

  const handleOpenEditModal = (reading) => {
    setEditingReading(reading);
    setModalDate(reading.readingDate);
    setModalSlot(reading.slot);
    setModalOpen(true);
  };

  const handleSaveReading = async (data) => {
    if (editingReading) {
      await editReading(editingReading.id, data);
    } else {
      await addReading(data);
    }
  };

  return (
    <Layout onOpenNewReading={() => handleOpenAddModal(getLocalDateString())}>
      <Routes>
        <Route
          path="/"
          element={
            <DashboardPage
              onOpenAddModal={handleOpenAddModal}
              onOpenEditModal={handleOpenEditModal}
              onRequestDelete={setDeletingReading}
            />
          }
        />
        <Route
          path="/reports"
          element={
            <ReportsPage
              onOpenAddModal={handleOpenAddModal}
              onOpenEditModal={handleOpenEditModal}
              onRequestDelete={setDeletingReading}
            />
          }
        />
        <Route
          path="/history"
          element={
            <HistoryPage
              onOpenAddModal={handleOpenAddModal}
              onOpenEditModal={handleOpenEditModal}
              onRequestDelete={setDeletingReading}
            />
          }
        />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <ReadingModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        existingReadings={readings}
        initialDate={modalDate}
        initialSlot={modalSlot}
        editingReading={editingReading}
        onSave={handleSaveReading}
      />

      <DeleteConfirmModal
        reading={deletingReading}
        onClose={() => setDeletingReading(null)}
        onConfirm={removeReading}
      />
    </Layout>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f6faf8] flex items-center justify-center">
        <div className="text-sm font-medium text-slate-600">Loading Sweety...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <ReadingsProvider>
      <AuthenticatedShell />
    </ReadingsProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
