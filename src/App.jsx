import NativeTabletHealth from "@/components/NativeTabletHealth";
import KioskAppBoundary from "@/components/KioskAppBoundary";
import { Toaster } from "@/components/ui/toaster"
import JourneyLoading from "@/components/JourneyLoading";
import ErrorBoundary from "@/components/ErrorBoundary";
import AccessRecovery from '@/components/system/AccessRecovery';
import ConfirmHost from "@/components/ConfirmHost";
import OfflineJobsBanner from "@/components/OfflineJobsBanner";
import PhoneSignInListener from "@/components/PhoneSignInListener";
import NativeNotificationTaps from "@/components/NativeNotificationTaps";
import OfflineNotice from "@/components/system/OfflineNotice";
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { homeFor } from '@/lib/roleHome';
import { isSiteHost } from '@/lib/bookingSite';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { useTheme } from "@/lib/useTheme";
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import MobileTabBar from '@/components/MobileTabBar';
import { Navigate } from 'react-router-dom';
// Auth components load eagerly so the login flow renders without a chunk round-trip
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// Route-level pages are lazily loaded for code-splitting / performance
const loadRoleWorkspace = () => import('@/pages/RoleWorkspace');
const RoleWorkspace = lazy(loadRoleWorkspace);
const PageNotFound = lazy(() => import('./lib/PageNotFound'));
const Welcome = lazy(() => import('@/pages/Welcome'));
const TabletStart = lazy(() => import('@/pages/TabletStart'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('@/pages/TermsOfService'));
const BookTaxi = lazy(() => import('@/pages/BookTaxi'));
// A guest following their ride from a link (no sign-in).
const TrackRide = lazy(() => import('@/pages/TrackRide'));
// The public website (mcsweenstransport.com, and /site inside the app).
const SiteApp = lazy(() => import('@/site/SiteApp'));
const SITE_HOST = typeof window !== 'undefined' && isSiteHost(window.location.hostname);
const JoinCompany = lazy(() => import('@/pages/JoinCompany'));
const loadCompanyDashboard = () => import('@/pages/CompanyDashboard');
const CompanyDashboard = lazy(loadCompanyDashboard);
const DriverApp = lazy(() => import('@/pages/DriverApp'));
const loadAdmin = () => import('@/pages/Admin');
const Admin = lazy(loadAdmin);
const Account = lazy(() => import('@/pages/Account'));
const loadStaffPortal = () => import('@/pages/StaffPortal');
const StaffPortal = lazy(loadStaffPortal);
const loadMechanicPortal = () => import('@/pages/MechanicPortal');
const MechanicPortal = lazy(loadMechanicPortal);
const RunInspection = lazy(() => import('@/pages/RunInspection'));
const ManagerDashboard = lazy(() => import('@/pages/ManagerDashboard'));
const OAuthConsent = lazy(() => import('@/pages/OAuthConsent'));
const DesktopSignIn = lazy(() => import('@/pages/DesktopSignIn'));
const PhoneSignIn = lazy(() => import('@/pages/PhoneSignIn'));
const PassengerBookings = lazy(() => import('@/pages/PassengerBookings'));
const Kiosk = lazy(() => import('@/pages/Kiosk'));
const RouteExplorer = lazy(() => import('@/pages/RouteExplorer'));
const StaffDirectory = lazy(() => import('@/pages/StaffDirectory'));
const ServiceHistory = lazy(() => import('@/pages/ServiceHistory'));
const SafetyStandards = lazy(() => import('@/pages/SafetyStandards'));
const Buses = lazy(() => import('@/pages/Buses'));
// Passenger More shares StaffPortal data with Home, Journey and My card.
const Notifications = lazy(() => import('@/pages/Notifications'));
const VehicleRegistry = lazy(() => import('@/pages/VehicleRegistry'));
const VehicleDetail = lazy(() => import('@/pages/VehicleDetail'));
const IncidentReport = lazy(() => import('@/pages/IncidentReport'));
const ReviewerSandbox = lazy(() => import('@/pages/ReviewerSandbox'));
const DriverSchedule = lazy(() => import('@/pages/DriverSchedule'));
const DriverProfile = lazy(() => import('@/pages/DriverProfile'));
const loadDriverPhone = () => import('@/pages/DriverPhone');
const DriverPhone = lazy(loadDriverPhone);
const DriverPassword = lazy(() => import('@/pages/DriverPassword'));

// Each home screen's code, fetched while the account is still being checked
// (or as soon as the saved sign-in says who this is), so opening the app is
// one wait instead of "checking your account" and then "opening this screen".
const HOME_CODE = {
  '/staff': loadStaffPortal, '/journey': loadStaffPortal, '/my-card': loadStaffPortal, '/more': loadStaffPortal,
  '/admin': loadAdmin, '/mechanic': loadMechanicPortal, '/company': loadCompanyDashboard,
  '/driver-phone': loadDriverPhone, '/workspace': loadRoleWorkspace,
};
const fetchHomeCode = (path) => { HOME_CODE['/' + String(path || '').split('/')[1]]?.().catch(() => { /* the page loads it again */ }); };
if (typeof window !== 'undefined') fetchHomeCode(window.location.pathname);
// Add page imports here

// Pages that moved inside the admin area. Their old addresses still work for
// bookmarks; nothing in the app links to them any more.
const MOVED_TO_ADMIN = ["route-analytics", "fleet-analytics", "vehicle-logs", "driving-reports", "route-planner", "ride-history", "incident-reports", "support", "location-timeline"];

// A screen's code that is already downloaded opens in a moment: show the
// loading screen only if it actually takes a while, instead of flashing it.
const RouteFallback = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 400);
    return () => clearTimeout(timer);
  }, []);
  return show
    ? <JourneyLoading onRetry={() => window.location.reload()} />
    : <div className="min-h-[100dvh] bg-background" aria-busy="true" />;
};

const AuthenticatedApp = () => {
  const { user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings, authError, checkAppState } = useAuth();
  const location = useLocation();
  const home = user ? homeFor(user) : null;
  useEffect(() => { if (home) fetchHomeCode(home); }, [home]);
  const authPage = ['/login', '/register', '/forgot-password', '/reset-password'].includes(location.pathname);
  const tabletPage = /^\/(driver|kiosk|tablet)(\/|$)/.test(location.pathname);
  // The legal pages are linked from the app stores, so they must open for
  // signed-out visitors instead of bouncing to the login screen.
  // /desktop-signin and /phone-signin handle their own sign-in (the desktop
  // and phone apps' browser hand-off).
  const publicPage = authPage || ['/privacy', '/terms', '/reviewer-sandbox', '/desktop-signin', '/phone-signin', '/track'].includes(location.pathname)
    || location.pathname === '/site' || location.pathname.startsWith('/site/');
  // Pages remount (and animate) when this key changes. The driver app's tabs
  // are all one page, so they share a key — switching tabs must not restart
  // it (that would stop GPS tracking and navigation).
  const pageKey = ["/staff","/journey","/my-card","/more"].includes(location.pathname) ? "/passenger-experience" : /^\/driver(\/|$)/.test(location.pathname) ? "/driver"
    : location.pathname.startsWith("/driver-phone") ? "/driver-phone" : /^\/admin(\/|$)/.test(location.pathname) ? "/admin" : location.pathname;
  // The first screen shown after opening the app, or false once the person
  // has moved on (from then on every new screen slides in).
  const firstScreen = useRef(null);

  // One loading screen for the whole start-up, whichever check is still running.
  if (!publicPage && !tabletPage && (isLoadingPublicSettings || isLoadingAuth)) {
    return <JourneyLoading onRetry={checkAppState} />;
  }

  // Login and paired tablets must still open when an account token expires.
  if (authError && !publicPage && !tabletPage) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') {
      return <Navigate to={'/login?returnTo=' + encodeURIComponent(location.pathname + location.search)} replace />;
    }
    return <AccessRecovery onRetry={checkAppState} />;
  }

  // Signed in at the front page: straight to their own screen, without opening
  // the welcome page (and its loading screen) on the way.
  if (location.pathname === '/' && isAuthenticated && home) return <Navigate to={home} replace />;

  // Render the main app
  if (firstScreen.current === null) firstScreen.current = pageKey;
  else if (firstScreen.current !== pageKey) firstScreen.current = false;
  return (
    <>
    {/* A new screen slides in with CSS (index.css .tt-route-in); the first
        screen after opening the app appears without it. */}
    <div key={pageKey} className={firstScreen.current === false ? 'tt-route-in' : undefined}>
      <ErrorBoundary key={pageKey}>
      <Suspense fallback={<RouteFallback />}>
      <Routes location={location}>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<Welcome />} />
      <Route path="/book-taxi" element={<BookTaxi />} />
      <Route path="/track" element={<TrackRide />} />
      <Route path="/site/*" element={<SiteApp base="/site" />} />
      <Route path="/join" element={<JoinCompany />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      <Route path="/desktop-signin" element={<DesktopSignIn />} />
      <Route path="/phone-signin" element={<PhoneSignIn />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfService />} />
      {/* Store reviewers open this without an account, so it sits outside the sign-in gate. */}
      <Route path="/reviewer-sandbox" element={<ReviewerSandbox />} />
      {/* One route for /driver and /driver/<tab> so tab changes don't remount the app */}
      <Route path="/driver/:stage?" element={<DriverApp />} />
      <Route path="/kiosk" element={<Kiosk />} />
      <Route path="/tablet" element={<TabletStart />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/passenger" element={<Navigate to="/staff" replace />} />
        <Route path="/company" element={<CompanyDashboard />} />
        <Route path="/company/:tab" element={<CompanyDashboard />} />
        <Route path="/admin/:section?" element={<Admin />} />
        <Route path="/workspace/:section?" element={<RoleWorkspace />} />
      <Route path="/account" element={<Account />} />
        <Route path="/staff" element={<StaffPortal />} />
        <Route path="/journey" element={<StaffPortal />} />
        <Route path="/my-card" element={<StaffPortal />} />
        <Route path="/mechanic" element={<MechanicPortal />} />
        <Route path="/run-inspection" element={<RunInspection />} />
        <Route path="/manager" element={<ManagerDashboard />} />
        <Route path="/manager/:tab" element={<ManagerDashboard />} />
        <Route path="/passenger-bookings" element={<PassengerBookings />} />
        <Route path="/route-explorer" element={<RouteExplorer />} />
        <Route path="/buses" element={<Buses />} />
        <Route path="/more" element={<StaffPortal />} />
        <Route path="/staff-directory" element={<StaffDirectory />} />
        <Route path="/service-history" element={<ServiceHistory />} />
        <Route path="/safety-standards" element={<SafetyStandards />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/vehicle-registry" element={<VehicleRegistry />} />
        <Route path="/vehicle/:id" element={<VehicleDetail />} />
        <Route path="/incident-report" element={<IncidentReport />} />
        {MOVED_TO_ADMIN.map((id) => <Route key={id} path={`/${id}`} element={<Navigate to={`/admin/${id}`} replace />} />)}
        <Route path="/driver-password" element={<DriverPassword />} />
        <Route path="/driver-schedule" element={<DriverSchedule />} />
        <Route path="/driver-profile" element={<DriverProfile />} />
        {/* The driver phone app (Google sign-in); /driver is the bus tablet. */}
        <Route path="/driver-phone/:tab?" element={<DriverPhone />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </div>
    <MobileTabBar />
    </>
  );
};


function App() {
  useTheme();

  // mcsweenstransport.com is the public website only: no sign-in, none of
  // the app's background work.
  if (SITE_HOST) {
    return (
      <ErrorBoundary>
        <Router>
          <ScrollToTop />
          <Suspense fallback={null}><SiteApp /></Suspense>
        </Router>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <KioskAppBoundary><AuthenticatedApp /></KioskAppBoundary>
          <OfflineNotice />
          <OfflineJobsBanner />
          <PhoneSignInListener />
          <NativeNotificationTaps />
          <NativeTabletHealth />
        </Router>
        <Toaster />
        <ConfirmHost />
      </QueryClientProvider>
    </AuthProvider>
    </ErrorBoundary>
  )
}

export default App