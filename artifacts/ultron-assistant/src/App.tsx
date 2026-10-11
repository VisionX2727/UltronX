import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { Activity, ChevronRight, Command, Settings2 } from 'lucide-react';

const Home = lazy(() => import('@/pages/home'));
const Settings = lazy(() => import('@/pages/settings'));
const Auth = lazy(() => import('@/pages/auth'));
const queryClient = new QueryClient();

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <div className="shell grain min-h-[100dvh]">
    <header className="topbar">
      <Link href="/" className="brand" aria-label="ULTRON home"><span className="brand-mark"><Command size={17} /></span><span>ULTRON</span><span className="brand-index">/ PERSONAL ASSISTANT</span></Link>
      <nav className="topnav" aria-label="Main navigation">
        <Link href="/" className={location === '/' ? 'nav-link active' : 'nav-link'}><Activity size={15} /> Console</Link>
        <Link href="/settings" className={location === '/settings' ? 'nav-link active' : 'nav-link'}><Settings2 size={15} /> Settings</Link>
        <Link href="/auth" className="auth-link">Account <ChevronRight size={14} /></Link>
      </nav>
    </header>
    <main>{children}</main>
    <footer className="app-footer"><span>ULTRON / BROWSER CONSOLE</span><span>Native Android controls are not available here.</span></footer>
  </div>;
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Suspense fallback={<div role="status" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>ULTRON / INITIALISING</div>}>
        <Switch>
          <Route path="/"><Shell><Home /></Shell></Route>
          <Route path="/settings"><Shell><Settings /></Shell></Route>
          <Route path="/auth"><Shell><Auth /></Shell></Route>
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
