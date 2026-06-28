import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Students from './pages/Students';
import Attendance from './pages/Attendance';
import Grades from './pages/Grades';
import Tuition from './pages/Tuition';
import Users from './pages/Users';
import ParentView from './pages/ParentView';

function Require({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/classes" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/parent/:studentId" element={<ParentView />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Require roles={['ADMIN']}><Dashboard /></Require>} />
        <Route path="/classes" element={<Require><Classes /></Require>} />
        <Route path="/students" element={<Require roles={['ADMIN']}><Students /></Require>} />
        <Route path="/attendance" element={<Require><Attendance /></Require>} />
        <Route path="/grades" element={<Require roles={['ADMIN','TEACHER']}><Grades /></Require>} />
        <Route path="/tuition" element={<Require><Tuition /></Require>} />
        <Route path="/users" element={<Require roles={['ADMIN']}><Users /></Require>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
