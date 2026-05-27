import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Sites from './pages/Sites.jsx';
import SubnetDetail from './pages/SubnetDetail.jsx';
import Catalogs from './pages/Catalogs.jsx';
import Devices from './pages/Devices.jsx';
import PendingDiscoveries from './pages/PendingDiscoveries.jsx';
import CidrCalculator from './pages/CidrCalculator.jsx';
import IntegrationDocs from './pages/IntegrationDocs.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Reset from './pages/Reset.jsx';
import Profile from './pages/Profile.jsx';
import Users from './pages/Users.jsx';
import Audit from './pages/Audit.jsx';
import SsoSettings from './pages/SsoSettings.jsx';
import SsoCallback from './pages/SsoCallback.jsx';
import ZabbixSettings from './pages/ZabbixSettings.jsx';
import NetworkHealth from './pages/NetworkHealth.jsx';
import IntegrationsStatus from './pages/IntegrationsStatus.jsx';

function Protected({ children, role }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Carregando…
      </div>
    );
  }
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }
  if (role && user.role !== role) {
    return <Navigate to="/" replace />;
  }
  if (user.mustChangePwd && loc.pathname !== '/profile') {
    return <Navigate to="/profile?force=1" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/reset" element={<Reset />} />
      <Route path="/sso-callback" element={<SsoCallback />} />
      <Route
        path="/*"
        element={
          <Protected>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/sites" element={<Sites />} />
                <Route path="/subnets/:id" element={<SubnetDetail />} />
                <Route path="/catalogs" element={<Catalogs />} />
                <Route path="/devices" element={<Devices />} />
                <Route path="/cidr" element={<CidrCalculator />} />
                <Route path="/integrations" element={<IntegrationDocs />} />
                <Route path="/profile" element={<Profile />} />
                <Route
                  path="/admin/users"
                  element={
                    <Protected role="ADMIN">
                      <Users />
                    </Protected>
                  }
                />
                <Route
                  path="/admin/audit"
                  element={
                    <Protected role="ADMIN">
                      <Audit />
                    </Protected>
                  }
                />
                <Route
                  path="/admin/sso"
                  element={
                    <Protected role="ADMIN">
                      <SsoSettings />
                    </Protected>
                  }
                />
                <Route
                  path="/admin/integrations"
                  element={
                    <Protected role="ADMIN">
                      <IntegrationsStatus />
                    </Protected>
                  }
                />
                <Route
                  path="/admin/pending-discoveries"
                  element={
                    <Protected role="ADMIN">
                      <PendingDiscoveries />
                    </Protected>
                  }
                />
                <Route
                  path="/admin/integrations/zabbix"
                  element={
                    <Protected role="ADMIN">
                      <ZabbixSettings />
                    </Protected>
                  }
                />
                <Route
                  path="/admin/network-health"
                  element={
                    <Protected role="ADMIN">
                      <NetworkHealth />
                    </Protected>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </Protected>
        }
      />
    </Routes>
  );
}
