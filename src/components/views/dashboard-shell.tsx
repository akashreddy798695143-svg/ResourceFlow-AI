'use client'

import { useEffect, useState, ReactNode } from 'react'
import { useRouter } from '@/lib/use-router'
import { useAuth } from '@/lib/use-auth'
import { useRealtimeConnection } from '@/lib/use-realtime'
import { apiGet, apiPatch, apiPost } from '@/lib/api-client'
import { toast } from 'sonner'
import {
  ShieldAlert, LayoutDashboard, Map, Package, CheckSquare, FlaskConical,
    BarChart3, ScrollText, Settings, LogOut, Bell, Plus, Search, RadioTower,
  AlertTriangle, Menu, X, Activity, ChevronRight, Brain, LifeBuoy, Users, HandHeart,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Notification, Incident } from '@/lib/types'
import { NotificationTypeBadge } from '@/components/shared/badges'
import { Footer } from '@/components/shared/footer'

interface NavItem {
  label: string
  path: string
  icon: typeof LayoutDashboard
  roles: string[]
}

const NAV_ITEMS: NavItem[] = [
  // Officer/admin
  { label: 'Command Center', path: '/command-center', icon: RadioTower, roles: ['DISASTER_OFFICER', 'ADMIN'] },
  { label: 'Incidents', path: '/incidents', icon: ShieldAlert, roles: ['DISASTER_OFFICER', 'ADMIN', 'RESPONDER'] },
  { label: 'Resources', path: '/resources', icon: Package, roles: ['DISASTER_OFFICER', 'ADMIN', 'RESPONDER'] },
  { label: 'Citizen Intel', path: '/citizen-intel', icon: Users, roles: ['DISASTER_OFFICER', 'ADMIN'] },
  { label: 'Approvals', path: '/approvals', icon: CheckSquare, roles: ['DISASTER_OFFICER', 'ADMIN'] },
  { label: 'AI Intelligence', path: '/ai-center', icon: Brain, roles: ['DISASTER_OFFICER', 'ADMIN', 'RESPONDER', 'CITIZEN'] },
  { label: 'Analytics', path: '/analytics', icon: BarChart3, roles: ['DISASTER_OFFICER', 'ADMIN'] },
  { label: 'Simulation', path: '/simulation', icon: FlaskConical, roles: ['DISASTER_OFFICER', 'ADMIN'] },
  { label: 'Audit Logs', path: '/audit', icon: ScrollText, roles: ['ADMIN'] },
  { label: 'Volunteer Mgmt', path: '/volunteer-management', icon: HandHeart, roles: ['DISASTER_OFFICER', 'ADMIN'] },
  { label: 'Volunteer Map', path: '/volunteer-map', icon: Map, roles: ['DISASTER_OFFICER', 'ADMIN'] },
    { label: 'Settings', path: '/settings', icon: Settings, roles: ['ADMIN', 'DISASTER_OFFICER', 'RESPONDER'] },
  // Emergency communication chat — available to every role
  { label: 'Chat', path: '/chat', icon: MessageCircle, roles: ['CITIZEN', 'RESPONDER', 'DISASTER_OFFICER', 'ADMIN'] },
  // Citizen
  { label: 'Safety Center', path: '/safety-center', icon: LifeBuoy, roles: ['CITIZEN'] },
  { label: 'My Reports', path: '/citizen-dashboard', icon: LayoutDashboard, roles: ['CITIZEN'] },
  { label: 'Report Emergency', path: '/report-incident', icon: Plus, roles: ['CITIZEN', 'DISASTER_OFFICER'] },
  { label: 'Track Incident', path: '/track-incident', icon: Search, roles: ['CITIZEN', 'DISASTER_OFFICER'] },
  { label: 'Volunteer', path: '/volunteer-register', icon: HandHeart, roles: ['CITIZEN'] },
]

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const { path, navigate } = useRouter()
  const connected = useRealtimeConnection()
    const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [chatUnread, setChatUnread] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const allowed = NAV_ITEMS.filter((item) => user && item.roles.includes(user.role))
  const currentPath = path || '/'

  const loadNotifications = async () => {
    try {
      const res = await apiGet<{ notifications: Notification[] }>('/api/notifications?unread=1')
      setNotifications(res.notifications)
      setUnreadCount(res.notifications.length)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await apiGet<{ notifications: Notification[] }>('/api/notifications?unread=1')
        if (!cancelled) { setNotifications(res.notifications); setUnreadCount(res.notifications.length) }
      } catch { /* ignore */ }
    }
    run()
    const interval = setInterval(run, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

    const loadChatUnread = async () => {
    try {
      const res = await apiGet<{ unreadCount: number }>('/api/chat/unread')
      setChatUnread(res.unreadCount)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await apiGet<{ unreadCount: number }>('/api/chat/unread')
        if (!cancelled) setChatUnread(res.unreadCount)
      } catch { /* ignore */ }
    }
    run()
    const interval = setInterval(run, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const markRead = async (id: string) => {
    try {
      await apiPatch(`/api/notifications/${id}`)
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const initials = user ? user.name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase() : 'U'

  return (
    <div className="rf-app-shell min-h-screen flex flex-col bg-background text-foreground">
      {/* Demo mode banner */}
      <div className="rf-demo-banner px-3 py-1.5 text-center">
        <span className="text-[10px] font-mono text-primary font-medium">
          DEMO MODE — Sample data for presentation purposes
        </span>
      </div>

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
        <div className="flex h-12 items-center gap-2 px-3 md:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <button
            onClick={() => navigate(user?.role === 'CITIZEN' ? '/citizen-dashboard' : '/command-center')}
            className="flex items-center gap-2.5 rf-focus-ring rounded-md px-1 py-1"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <RadioTower className="h-4 w-4" />
            </div>
            <div className="hidden sm:flex flex-col items-start leading-none">
              <span className="text-sm font-bold tracking-tight">RESOURCEFLOW AI</span>
              <span className="text-[10px] text-muted-foreground font-medium">Emergency Operations</span>
            </div>
          </button>

          {/* Quick demo button */}
          {user && (user.role === 'DISASTER_OFFICER' || user.role === 'ADMIN') && (
            <Button
              size="sm"
              variant="default"
              className="ml-2 hidden md:inline-flex gap-1.5 h-8"
              onClick={async () => {
                toast.loading('Running full end-to-end demo…', { id: 'demo' })
                try {
                  const res = await apiPost<{ incidentCode: string; simRunId: string; steps: any[] }>(
                    '/api/demo/run'
                  )
                  toast.success(`Demo complete: ${res.incidentCode}`, { id: 'demo', description: `${res.steps.length} steps · sim ${res.simRunId.slice(-6)}` })
                  navigate('/command-center')
                  loadNotifications()
                } catch (e: any) {
                  toast.error(e.message, { id: 'demo' })
                }
              }}
            >
              <Activity className="h-3.5 w-3.5" />
              Run Demo
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            {/* Realtime status */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border/50">
              <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-red-500 animate-pulse')} />
              <span className="text-[10px] font-medium text-muted-foreground">
                {connected ? 'LIVE' : 'RECONNECTING'}
              </span>
            </div>

            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-sev-CRITICAL text-[10px] font-bold text-foreground flex items-center justify-center border border-background">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex items-center justify-between">
                  Notifications
                  <Badge variant="secondary" className="text-[10px]">{unreadCount} unread</Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ScrollArea className="max-h-80">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">No new notifications</div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="flex items-start gap-2 p-2 hover:bg-accent/40 border-b border-border last:border-0">
                        <NotificationTypeBadge type={n.type} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs leading-snug">{n.message}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                            {new Date(n.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[10px]"
                          onClick={() => markRead(n.id)}
                        >
                          Mark read
                        </Button>
                      </div>
                    ))
                  )}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md p-1 hover:bg-accent/40 transition">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:flex flex-col items-start leading-none">
                    <span className="text-xs font-medium">{user?.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{user?.role.replace(/_/g, ' ')}</span>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs">{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside
          className={cn(
            'w-60 shrink-0 border-r border-border bg-sidebar text-sidebar-foreground flex flex-col',
            'md:flex',
            sidebarOpen ? 'flex' : 'hidden md:flex'
          )}
        >
          {/* User info */}
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2.5">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono uppercase">
                  {user?.role.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto rf-scroll">
            {allowed.map((item) => {
              const Icon = item.icon
              const active = currentPath === item.path || currentPath.startsWith(item.path + '/')
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path)
                    if (item.path === '/chat') setChatUnread(0)
                    setSidebarOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all rf-focus-ring',
                    active
                      ? 'bg-primary text-primary-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.path === '/chat' && chatUnread > 0 && (
                    <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px] font-mono">
                      {chatUnread > 9 ? '9+' : chatUnread}
                    </Badge>
                  )}
                  {active && <ChevronRight className="h-3.5 w-3.5 ml-auto opacity-70" />}
                </button>
              )
            })}
          </nav>

          <div className="p-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </aside>

        {/* Main content */}
        <main className="rf-app-main flex-1 min-w-0 overflow-y-auto rf-scroll bg-background">
          <div className="min-h-full p-4 md:p-6">{children}</div>
          {/* Footer */}
          <Footer />
        </main>
      </div>
    </div>
  )
}
