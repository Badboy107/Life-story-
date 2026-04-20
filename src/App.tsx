import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { HelmetProvider } from 'react-helmet-async';
import Layout from './components/Layout';
import Login from './pages/Login';
import Home from './pages/Home';
import AddStory from './pages/AddStory';
import EditStory from './pages/EditStory';
import EditDraft from './pages/EditDraft';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
import Payouts from './pages/Payouts';
import Search from './pages/Search';
import Notifications from './pages/Notifications';
import SingleStory from './pages/SingleStory';
import Messenger from './pages/Messenger';
import SavedStories from './pages/SavedStories';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUser, loading } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center dark:bg-black dark:text-white font-sans">Loading...</div>;
  }
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

export default function App() {
  return (
    <HelmetProvider>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<Home />} />
                <Route path="add" element={<AddStory />} />
                <Route path="edit/:id" element={<EditStory />} />
                <Route path="edit-draft/:id" element={<EditDraft />} />
                <Route path="story/:id" element={<SingleStory />} />
                <Route path="profile/:id" element={<Profile />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="payouts" element={<Payouts />} />
                <Route path="search" element={<Search />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="messenger" element={<Messenger />} />
                <Route path="messenger/:id" element={<Messenger />} />
                <Route path="saved" element={<SavedStories />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}
