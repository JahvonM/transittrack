import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import MobileTabBar from '@/components/MobileTabBar';
import { AnimatePresence, motion } from 'framer-motion';
import { Navigate } from 'react-router-dom';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Welcome from '@/pages/Welcome';
import BookTaxi from '@/pages/BookTaxi';
import CompanyDashboard from '@/pages/CompanyDashboard';
import DriverApp from '@/pages/DriverApp';
import Admin from '@/pages/Admin';
import Account from '@/pages/Account';
import StaffPortal from '@/pages/StaffPortal';
import ManagerDashboard from '@/pages/ManagerDashboard';
import OAuthConsent from '@/pages/OAuthConsent';
import MaintenanceQueue from '@/pages/MaintenanceQueue';
import RouteAnalytics from '@/pages/RouteAnalytics';
import DriverProfile from '@/pages/DriverProfile';
import FleetSyncSettings from '@/pages/FleetSyncSettings';
import IncidentReports from '@/pages/IncidentReports';
import PassengerBookings from '@/pages/PassengerBookings';
import RouteExplorer from '@/pages/RouteExplorer';
import StaffDirectory from '@/pages/StaffDirectory';
import VehicleLogs from '@/pages/VehicleLogs';
import ServiceHistory from '@/pages/ServiceHistory';
import SafetyStandards from '@/pages/SafetyStandards';
import RideHistory from '@/pages/RideHistory';
import FleetAnalytics from '@/pages/FleetAnalytics';
import Notifications from '@/pages/Notifications';
import VehicleRegistry from '@/pages/VehicleRegistry';
import DriverSchedule from '@/pages/DriverSchedule';
import IncidentReport from '@/pages/IncidentReport';
import PassengerSupport from '@/pages/PassengerSupport';
import RoutePlanner from '@/pages/RoutePlanner';
import BusEntryKiosk from '@/pages/BusEntryKiosk';
import FrontDeskKiosk from '@/pages/FrontDeskKiosk';
import ReviewerSandbox from '@/pages/ReviewerSandbox';
import BadgeRegistry from '@/pages/BadgeRegistry';
// Add page imports here

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
      <Routes location={location}>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<Welcome />} />
      <Route path="/book-taxi" element={<BookTaxi />} />
      <Route path="/kiosk/bus" element={<BusEntryKiosk />} />
      <Route path="/kiosk/driver" element={<Navigate to="/driver" replace />} />
      <Route path="/kiosk/front-desk" element={<FrontDeskKiosk />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/passenger" element={<Navigate to="/staff" replace />} />
        <Route path="/company" element={<CompanyDashboard />} />
        <Route path="/driver" element={<DriverApp />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/account" element={<Account />} />
        <Route path="/staff" element={<StaffPortal />} />
        <Route path="/manager" element={<ManagerDashboard />} />
        <Route path="/maintenance-queue" element={<MaintenanceQueue />} />
        <Route path="/route-analytics" element={<RouteAnalytics />} />
        <Route path="/driver-profile" element={<DriverProfile />} />
        <Route path="/fleet-sync" element={<FleetSyncSettings />} />
        <Route path="/incident-reports" element={<IncidentReports />} />
        <Route path="/passenger-bookings" element={<PassengerBookings />} />
        <Route path="/route-explorer" element={<RouteExplorer />} />
        <Route path="/staff-directory" element={<StaffDirectory />} />
        <Route path="/vehicle-logs" element={<VehicleLogs />} />
        <Route path="/service-history" element={<ServiceHistory />} />
        <Route path="/safety-standards" element={<SafetyStandards />} />
        <Route path="/ride-history" element={<RideHistory />} />
        <Route path="/fleet-analytics" element={<FleetAnalytics />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/vehicle-registry" element={<VehicleRegistry />} />
        <Route path="/driver-schedule" element={<DriverSchedule />} />
        <Route path="/incident-report" element={<IncidentReport />} />
        <Route path="/support" element={<PassengerSupport />} />
        <Route path="/route-planner" element={<RoutePlanner />} />
        <Route path="/reviewer-sandbox" element={<ReviewerSandbox />} />
        <Route path="/badge-registry" element={<BadgeRegistry />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
      </Routes>
      </motion.div>
    </AnimatePresence>
    <MobileTabBar />
    </>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App