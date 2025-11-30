import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Approvals from './pages/Approvals';
import Approved from './pages/Approved';
import Published from './pages/Published';
import Linkedin from './pages/Linkedin';
import Instagram from './pages/Instagram';
import Repost from './pages/Repost'; // <--- VERIFIQUE ESTE IMPORT
import Layout from './components/Layout';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Loading...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        
        {/* Rotas Protegidas (Dentro do Layout) */}
        <Route path="/" element={user ? <Layout /> : <Navigate to="/login" />}>
          <Route index element={<Dashboard />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="approved" element={<Approved />} />
          <Route path="published" element={<Published />} />
          <Route path="linkedin" element={<Linkedin />} />
          <Route path="instagram" element={<Instagram />} />
          <Route path="settings" element={<Settings />} />
          
          {/* AQUI ESTÁ A ROTA QUE FALTAVA */}
          <Route path="repost" element={<Repost />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;