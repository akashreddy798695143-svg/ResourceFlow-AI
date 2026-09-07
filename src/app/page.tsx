'use client'

import { useEffect } from 'react'
import { AuthProvider, useAuth } from '@/lib/use-auth'
import { RouterProvider, useRouter } from '@/lib/use-router'
import { RealtimeProvider } from '@/lib/use-realtime'
import { LandingView } from '@/components/views/landing'
import { LoginView } from '@/components/views/auth/login'
import { RegisterView } from '@/components/views/auth/register'
import { DashboardShell } from '@/components/views/dashboard-shell'
import { CitizenDashboardView } from '@/components/views/citizen/dashboard'
import { CitizenSafetyCenterView } from '@/components/views/citizen/safety-center'
import { ReportIncidentView } from '@/components/views/citizen/report-incident'
import { TrackIncidentView } from '@/components/views/citizen/track-incident'
import { CommandCenterView } from '@/components/views/officer/command-center'
import { CitizenIntelView } from '@/components/views/officer/citizen-intel'
import { IncidentsListView } from '@/components/views/officer/incidents-list'
import { IncidentDetailView } from '@/components/views/officer/incident-detail'
import { ResourcesView } from '@/components/views/officer/resources'
import { ApprovalsView } from '@/components/views/officer/approvals'
import { SimulationCenterView } from '@/components/views/simulation/simulation-center'
import { AdvancedCenterView } from '@/components/views/advanced/advanced-center'
import { AnalyticsView } from '@/components/views/analytics'
import { AuditLogsView } from '@/components/views/audit-logs'
import { SettingsView } from '@/components/views/settings'


function Routed() {
  const { user, loading, error } = useAuth()
  const { path, navigate } = useRouter()

  // Default route for authenticated officer/admin: go to command center
  useEffect(() => {
    if (user && (user.role === 'DISASTER_OFFICER' || user.role === 'ADMIN')) {
      const current = (path || '/').replace(/^\//, '')
      if (current === '' || current === '/') {
        navigate('/command-center')
      }
    }
  }, [user, path, navigate])

  // If there's an auth error, show error message
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
          <div className="text-red-600 text-5xl">⚠️</div>
          <h1 className="text-2xl font-bold text-foreground">Connection Error</h1>
          <p className="text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground mt-2">
            Please check that:
          </p>
          <ul className="text-sm text-muted-foreground text-left space-y-1">
            <li>✓ DATABASE_URL is set in .env.local or Vercel environment variables</li>
            <li>✓ The database server is running and reachable</li>
            <li>✓ Your internet connection is stable</li>
          </ul>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // While loading auth, show a splash
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm font-mono">Initializing RESOURCEFLOW AI…</p>
        </div>
      </div>
    )
  }

  // Not authenticated: show landing or auth views
  if (!user) {
    if (path === '/login') return <LoginView />
    if (path === '/register') return <RegisterView />
    return <LandingView />
  }

  // Authenticated: route by path
  const route = (path || '/').replace(/^\//, '')

  // Citizen views
  if (user.role === 'CITIZEN') {
    if (route.startsWith('safety-center')) return <DashboardShell><CitizenSafetyCenterView /></DashboardShell>
    if (route.startsWith('report-incident')) return <DashboardShell><ReportIncidentView /></DashboardShell>
    if (route.startsWith('track-incident')) return <DashboardShell><TrackIncidentView /></DashboardShell>
    return <DashboardShell><CitizenDashboardView /></DashboardShell>
  }

  // Responder views (limited)
  if (user.role === 'RESPONDER') {
    if (route.startsWith('incidents/')) return <DashboardShell><IncidentDetailView /></DashboardShell>
    if (route.startsWith('resources')) return <DashboardShell><ResourcesView /></DashboardShell>
    return <DashboardShell><IncidentsListView responderMode /></DashboardShell>
  }

  // Officer + Admin views
  if (route.startsWith('command-center')) return <DashboardShell><CommandCenterView /></DashboardShell>
  if (route.startsWith('citizen-intel') && (user.role === 'DISASTER_OFFICER' || user.role === 'ADMIN')) return <DashboardShell><CitizenIntelView /></DashboardShell>
  if (route.startsWith('incidents/')) return <DashboardShell><IncidentDetailView /></DashboardShell>
  if (route.startsWith('incidents')) return <DashboardShell><IncidentsListView /></DashboardShell>
  if (route.startsWith('resources')) return <DashboardShell><ResourcesView /></DashboardShell>
  if (route.startsWith('approvals')) return <DashboardShell><ApprovalsView /></DashboardShell>
  if (route.startsWith('simulation')) return <DashboardShell><SimulationCenterView /></DashboardShell>
  if (route.startsWith('ai-center')) return <DashboardShell><AdvancedCenterView /></DashboardShell>
  if (route.startsWith('analytics')) return <DashboardShell><AnalyticsView /></DashboardShell>
  if (route.startsWith('audit')) return <DashboardShell><AuditLogsView /></DashboardShell>
  if (route.startsWith('settings')) return <DashboardShell><SettingsView /></DashboardShell>
  if (route.startsWith('report-incident')) return <DashboardShell><ReportIncidentView /></DashboardShell>
  if (route.startsWith('track-incident')) return <DashboardShell><TrackIncidentView /></DashboardShell>
  if (route.startsWith('citizen-dashboard')) return <DashboardShell><CitizenDashboardView /></DashboardShell>

  // Fallback for officer/admin: command center (effect will redirect empty path)
  return <DashboardShell><CommandCenterView /></DashboardShell>
}

export default function Home() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <RouterProvider>
          <Routed />
        </RouterProvider>
      </RealtimeProvider>
    </AuthProvider>
  )
}

