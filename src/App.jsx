import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import MobileTabBar from '@/components/MobileTabBar';
import { AnimatePresence, motion } from 'framer-motion';
import { Navigate } from 'react-router-dom';
// Auth components load eagerly so the login flow renders without a chunk round-trip
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// Route-level pages are lazily loaded for code-splitting / performance
const PageNotFound = lazy(() => import('./lib/PageNotFound'));
const Welcome = lazy(() => import('@/pages/Welcome'));
const BookTaxi = lazy(() => import('@/pages/BookTaxi'));
const CompanyDashboard = lazy(() => import('@/pages/CompanyDashboard'));
const DriverApp = lazy(() => import('@/pages/DriverApp'));
const Admin = lazy(() => import('@/pages/Admin'));
const Account = lazy(() => import('@/pages/Account'));
const StaffPortal = lazy(() => import('@/pages/StaffPortal'));
const MechanicPortal = lazy(() => import('@/pages/MechanicPortal'));
const RunInspection = lazy(() => import('@/pages/RunInspection'));
const ManagerDashboard = lazy(() => import('@/pages/ManagerDashboard'));
const OAuthConsent = lazy(() => import('@/pages/OAuthConsent'));
const MaintenanceQueue = lazy(() => import('@/pages/MaintenanceQueue'));
const RouteAnalytics = lazy(() => import('@/pages/RouteAnalytics'));
const FleetSyncSettings = lazy(() => import('@/pages/FleetSyncSettings'));
const IncidentReports = lazy(() => import('@/pages/IncidentReports'));
const PassengerBookings = lazy(() => import('@/pages/PassengerBookings'));
const Kiosk = lazy(() => import('@/pages/Kiosk'));
const RouteExplorer = lazy(() => import('@/pages/RouteExplorer'));
const StaffDirectory = lazy(() => import('@/pages/StaffDirectory'));
const VehicleLogs = lazy(() => import('@/pages/VehicleLogs'));
const ServiceHistory = lazy(() => import('@/pages/ServiceHistory'));
const SafetyStandards = lazy(() => import('@/pages/SafetyStandards'));
const RideHistory = lazy(() => import('@/pages/RideHistory'));
const FleetAnalytics = lazy(() => import('@/pages/FleetAnalytics'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const VehicleRegistry = lazy(() => import('@/pages/VehicleRegistry'));
const VehicleDetail = lazy(() => import('@/pages/VehicleDetail'));
const IncidentReport = lazy(() => import('@/pages/IncidentReport'));
const PassengerSupport = lazy(() => import('@/pages/PassengerSupport'));
const RoutePlanner = lazy(() => import('@/pages/RoutePlanner'));
const ReviewerSandbox = lazy(() => import('@/pages/ReviewerSandbox'));
const DrivingReports = lazy(() => import('@/pages/DrivingReports'));
const LocationTimeline = lazy(() => import('@/pages/LocationTimeline'));
// Add page imports here

const RouteFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <BusLoader />
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <BusLoader />
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
      <Suspense fallback={<RouteFallback />}>
      <Routes location={location}>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<Welcome />} />
      <Route path="/book-taxi" element={<BookTaxi />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      <Route path="/driver" element={<DriverApp />} />
      <Route path="/driver/:stage" element={<DriverApp />} />
      <Route path="/kiosk" element={<Kiosk />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/passenger" element={<Navigate to="/staff" replace />} />
        <Route path="/company" element={<CompanyDashboard />} />
        <Route path="/company/:tab" element={<CompanyDashboard />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/:section" element={<Admin />} />
        <Route path="/account" element={<Account />} />
        <Route path="/staff" element={<StaffPortal />} />
        <Route path="/mechanic" element={<MechanicPortal />} />
        <Route path="/run-inspection" element={<RunInspection />} />
        <Route path="/manager" element={<ManagerDashboard />} />
        <Route path="/manager/:tab" element={<ManagerDashboard />} />
        <Route path="/maintenance-queue" element={<MaintenanceQueue />} />
        <Route path="/route-analytics" element={<RouteAnalytics />} />
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
        <Route path="/vehicle/:id" element={<VehicleDetail />} />
        <Route path="/incident-report" element={<IncidentReport />} />
        <Route path="/support" element={<PassengerSupport />} />
        <Route path="/route-planner" element={<RoutePlanner />} />
        <Route path="/reviewer-sandbox" element={<ReviewerSandbox />} />
        <Route path="/driving-reports" element={<DrivingReports />} />
        <Route path="/location-timeline" element={<LocationTimeline />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
      </Routes>
      </Suspense>
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