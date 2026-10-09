import { Toaster } from "@/components/ui/toaster"
import JourneyLoading from "@/components/JourneyLoading";
import ErrorBoundary from "@/components/ErrorBoundary";
import AccessRecovery from '@/components/system/AccessRecovery';
import ConfirmHost from "@/components/ConfirmHost";
import OfflineJobsBanner from "@/components/OfflineJobsBanner";
import OfflineNotice from "@/components/system/OfflineNotice";
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { useTheme } from "@/lib/useTheme";
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
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('@/pages/TermsOfService'));
const BookTaxi = lazy(() => import('@/pages/BookTaxi'));
const JoinCompany = lazy(() => import('@/pages/JoinCompany'));
const CompanyDashboard = lazy(() => import('@/pages/CompanyDashboard'));
const DriverApp = lazy(() => import('@/pages/DriverApp'));
const Admin = lazy(() => import('@/pages/Admin'));
const Account = lazy(() => import('@/pages/Account'));
const StaffPortal = lazy(() => import('@/pages/StaffPortal'));
const MechanicPortal = lazy(() => import('@/pages/MechanicPortal'));
const RunInspection = lazy(() => import('@/pages/RunInspection'));
const ManagerDashboard = lazy(() => import('@/pages/ManagerDashboard'));
const OAuthConsent = lazy(() => import('@/pages/OAuthConsent'));
const DesktopSignIn = lazy(() => import('@/pages/DesktopSignIn'));
const RouteAnalytics = lazy(() => import('@/pages/RouteAnalytics'));
const IncidentReports = lazy(() => import('@/pages/IncidentReports'));
const PassengerBookings = lazy(() => import('@/pages/PassengerBookings'));
const Kiosk = lazy(() => import('@/pages/Kiosk'));
const RouteExplorer = lazy(() => import('@/pages/RouteExplorer'));
const StaffDirectory = lazy(() => import('@/pages/StaffDirectory'));
const VehicleLogs = lazy(() => import('@/pages/VehicleLogs'));
const ServiceHistory = lazy(() => import('@/pages/ServiceHistory'));
const SafetyStandards = lazy(() => import('@/pages/SafetyStandards'));
const Buses = lazy(() => import('@/pages/Buses'));
const More = lazy(() => import('@/pages/More'));
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
const DriverSchedule = lazy(() => import('@/pages/DriverSchedule'));
const DriverProfile = lazy(() => import('@/pages/DriverProfile'));
const DriverPhone = lazy(() => import('@/pages/DriverPhone'));
// Add page imports here

const RouteFallback = () => (
  <JourneyLoading label="Opening this screen…" onRetry={() => window.location.reload()} />
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, checkAppState } = useAuth();
  const location = useLocation();
  const authPage = ['/login', '/register', '/forgot-password', '/reset-password'].includes(location.pathname);
  const tabletPage = /^\/(driver|kiosk)(\/|$)/.test(location.pathname);
  // The legal pages are linked from the app stores, so they must open for
  // signed-out visitors instead of bouncing to the login screen.
  // /desktop-signin handles its own sign-in (TransitTrack Desktop's browser hand-off).
  const publicPage = authPage || ['/privacy', '/terms', '/reviewer-sandbox', '/desktop-signin'].includes(location.pathname);
  // Pages remount (and animate) when this key changes. The driver app's tabs
  // are all one page, so they share a key — switching tabs must not restart
  // it (that would stop GPS tracking and navigation).
  const pageKey = /^\/driver(\/|$)/.test(location.pathname) ? "/driver"
    : location.pathname.startsWith("/driver-phone") ? "/driver-phone" : location.pathname;

  // Show loading spinner while checking app public settings or auth
  if (!publicPage && !tabletPage && (isLoadingPublicSettings || isLoadingAuth)) {
    return (
      <JourneyLoading label={isLoadingPublicSettings ? "Connecting to TransitTrack…" : "Checking your account…"} onRetry={checkAppState} />
    );
  }

  // Login and paired tablets must still open when an account token expires.
  if (authError && !publicPage && !tabletPage) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') {
      return <Navigate to={'/login?returnTo=' + encodeURIComponent(location.pathname + location.search)} replace />;
    }
    return <AccessRecovery onRetry={checkAppState} />;
  }

  // Render the main app
  return (
    <>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey}
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -16 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
      <ErrorBoundary key={pageKey}>
      <Suspense fallback={<RouteFallback />}>
      <Routes location={location}>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<Welcome />} />
      <Route path="/book-taxi" element={<BookTaxi />} />
      <Route path="/join" element={<JoinCompany />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      <Route path="/desktop-signin" element={<DesktopSignIn />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      {/* Store reviewers open this without an account, so it sits outside the sign-in gate. */}
      <Route path="/reviewer-sandbox" element={<ReviewerSandbox />} />
      {/* One route for /driver and /driver/<tab> so tab changes don't remount the app */}
      <Route path="/driver/:stage?" element={<DriverApp />} />
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
        <Route path="/route-analytics" element={<RouteAnalytics />} />
        <Route path="/incident-reports" element={<IncidentReports />} />
        <Route path="/passenger-bookings" element={<PassengerBookings />} />
        <Route path="/route-explorer" element={<RouteExplorer />} />
        <Route path="/buses" element={<Buses />} />
        <Route path="/more" element={<More />} />
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
        <Route path="/driving-reports" element={<DrivingReports />} />
        <Route path="/location-timeline" element={<Navigate to="/admin/location-timeline" replace />} />
        <Route path="/driver-schedule" element={<DriverSchedule />} />
        <Route path="/driver-profile" element={<DriverProfile />} />
        {/* The driver phone app (Google sign-in); /driver is the bus tablet. */}
        <Route path="/driver-phone/:tab?" element={<DriverPhone />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
    <MobileTabBar />
    </>
  );
};


function App() {
  useTheme();

  return (
    <ErrorBoundary>
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
          <OfflineNotice />
        </Router>
        <Toaster />
        <ConfirmHost />
        <OfflineJobsBanner />
      </QueryClientProvider>
    </AuthProvider>
    </ErrorBoundary>
  )
}

export default App