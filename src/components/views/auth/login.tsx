'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/use-router'
import { useAuth } from '@/lib/use-auth'
import { apiPost } from '@/lib/api-client'
import { toast } from 'sonner'
import {
  ArrowLeft, KeyRound, Mail, RadioTower, Loader2, Eye, EyeOff,
  ShieldCheck, Activity, Users, Zap, CheckCircle2, Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { ApiError } from '@/lib/api-client'

export function LoginView() {
  const { login } = useAuth()
  const { navigate } = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [authStage, setAuthStage] = useState<'login' | 'forgot' | 'reset'>('login')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const fillDemo = (role: string) => {
    setEmail(`${role}@resourceflow.ai`)
    setPassword('demo1234')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const user = await login(email, password)
      toast.success(`Welcome, ${user.name}`)
      // Route by role
      if (user.role === 'CITIZEN') navigate('/citizen-dashboard')
      else if (user.role === 'RESPONDER') navigate('/incidents')
      else navigate('/command-center')
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 401) toast.error('Invalid credentials')
      else toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await apiPost<{ message: string }>('/api/auth/forgot-password', { email })
      toast.success(res.message)
      setAuthStage('reset')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) return toast.error('Password must be at least 6 characters')
    setLoading(true)
    try {
      const res = await apiPost<{ message: string }>('/api/auth/reset-password', {
        email,
        code: resetCode,
        password: newPassword,
      })
      toast.success(res.message)
      setPassword('')
      setNewPassword('')
      setResetCode('')
      setAuthStage('login')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top utility bar */}
      <div className="w-full flex items-center justify-between px-4 py-3 border-b border-border/60 bg-card/40 backdrop-blur z-20">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Home</span>
        </button>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden sm:inline-flex gap-1.5 text-[10px] text-muted-foreground font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            EOC SECURE ACCESS
          </Badge>
          <ThemeToggle size="sm" />
        </div>
      </div>

      {/* Main split viewport */}
      <div className="flex-1 grid lg:grid-cols-12 min-h-[calc(100vh-49px)]">
        {/* Left column: Disaster management operational visual banner */}
        <div className="lg:col-span-6 xl:col-span-7 hidden lg:relative lg:flex flex-col justify-between p-10 xl:p-14 overflow-hidden border-r border-border/80">
          {/* Background image with high-grade tactical gradient overlay */}
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 scale-100"
            style={{ backgroundImage: "url('/images/command_center_login.jpg')" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-900/60" />
          <div className="absolute inset-0 bg-radial at-top-left from-primary/10 via-transparent to-transparent" />

          {/* Top banner content */}
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <RadioTower className="h-5 w-5" />
              </div>
              <div>
                <span className="text-base font-bold tracking-wider text-white flex items-center gap-2">
                  RESOURCEFLOW <span className="text-amber-400">AI</span>
                </span>
                <span className="text-[11px] text-slate-300 font-mono tracking-wide block">
                  Autonomous Emergency Operations Center
                </span>
              </div>
            </div>

            <div className="mt-8 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Operational Readiness: Level 1 (Real-Time)
            </div>
          </div>

          {/* Middle statement */}
          <div className="relative z-10 my-auto py-8 max-w-lg">
            <h2 className="text-3xl xl:text-4xl font-bold tracking-tight text-white leading-tight">
              Rapid Response. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-300">
                Coordinated Life-Saving Action.
              </span>
            </h2>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">
              Bridging citizen emergency calls, AI-driven hazard triage, multi-agency resource allocation,
              and live responder routing in one Unified Command Platform.
            </p>

            <div className="mt-6 space-y-2.5">
              {[
                'Multi-channel AI Triage (Flood, Earthquake, Fire & Rescue)',
                'Sub-second Conflict Detection across ambulances & rescue units',
                'Zero-data-loss offline sync for crisis zones',
              ].map((text) => (
                <div key={text} className="flex items-center gap-2.5 text-xs text-slate-200">
                  <CheckCircle2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom credentials note */}
          <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Government & Inter-Agency Disaster Protocol
            </span>
            <span className="font-mono text-slate-400">v1.0 EOC Ready</span>
          </div>
        </div>

        {/* Right column: Clean, focused, professional login card */}
        <div className="lg:col-span-6 xl:col-span-5 flex flex-col justify-center items-center p-4 sm:p-8 relative bg-card/30">
          <div className="w-full max-w-[420px] mx-auto">
            {/* Header logo for mobile */}
            <div className="lg:hidden flex items-center justify-center gap-2.5 mb-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-md shadow-primary/25">
                <RadioTower className="h-5 w-5" />
              </div>
              <div className="flex flex-col items-start leading-none">
                <span className="text-base font-bold tracking-wide">RESOURCEFLOW AI</span>
                <span className="text-[10px] text-muted-foreground font-mono">Disaster Coordination</span>
              </div>
            </div>

            {/* Login Card */}
            <Card className="border border-border shadow-lg shadow-black/5 dark:shadow-black/25 bg-card rounded-xl">
              <CardHeader className="space-y-1.5 pb-4">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] font-mono gap-1 text-primary border-primary/30">
                    <Lock className="h-2.5 w-2.5" /> AUTHORIZED PORTAL
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {authStage === 'login' ? 'PORTAL 01' : 'SECURITY RESET'}
                  </span>
                </div>
                <CardTitle className="text-xl font-bold tracking-tight">
                  {authStage === 'login' && 'Sign in to Operations'}
                  {authStage === 'forgot' && 'Reset Password'}
                  {authStage === 'reset' && 'Confirm Code & Password'}
                </CardTitle>
                <CardDescription className="text-xs">
                  {authStage === 'login' && 'Access disaster coordination, responder tracking & live intel.'}
                  {authStage === 'forgot' && 'Enter your registered email to receive a recovery code.'}
                  {authStage === 'reset' && <>Enter the 6-digit code sent to <span className="font-mono text-foreground font-semibold">{email}</span>.</>}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 pt-0">
                {authStage === 'login' && (
                  <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-xs font-medium">
                        Email or Registered Phone
                      </Label>
                      <div className="relative">
                        <Input
                          id="email"
                          type="text"
                          required
                          autoComplete="username"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="officer@resourceflow.ai"
                          className="h-10 text-sm pl-9"
                        />
                        <Mail className="h-4 w-4 text-muted-foreground absolute left-3 top-3 pointer-events-none" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-xs font-medium">
                          Password
                        </Label>
                        <button
                          type="button"
                          onClick={() => setAuthStage('forgot')}
                          className="text-xs text-primary hover:underline font-medium"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="h-10 text-sm pr-10 pl-9"
                        />
                        <KeyRound className="h-4 w-4 text-muted-foreground absolute left-3 top-3 pointer-events-none" />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 pt-0.5">
                      <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onCheckedChange={(c) => setRememberMe(Boolean(c))}
                      />
                      <label
                        htmlFor="remember-me"
                        className="text-xs text-muted-foreground cursor-pointer select-none"
                      >
                        Keep session active on this console
                      </label>
                    </div>

                    <Button type="submit" className="w-full h-10 font-semibold gap-2 shadow-sm" disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {loading ? 'Authenticating…' : 'Sign in to Console'}
                    </Button>
                  </form>
                )}

                {authStage === 'forgot' && (
                  <form onSubmit={requestReset} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-email" className="text-xs font-medium">Account Email</Label>
                      <Input
                        id="reset-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="h-10 text-sm"
                      />
                    </div>
                    <Button type="submit" className="w-full h-10 gap-2" disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      {loading ? 'Sending code…' : 'Send Recovery Code'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setAuthStage('login')}
                      className="flex items-center justify-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground pt-1 transition-colors"
                    >
                      <ArrowLeft className="h-3 w-3" /> Back to sign in
                    </button>
                  </form>
                )}

                {authStage === 'reset' && (
                  <form onSubmit={resetPassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-code" className="text-xs font-medium">6-digit Security Code</Label>
                      <Input
                        id="reset-code"
                        required
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        className="text-center text-xl tracking-[0.4em] font-mono h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="new-password" className="text-xs font-medium">New Password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="min 6 characters"
                        className="h-10 text-sm"
                      />
                    </div>
                    <Button type="submit" className="w-full h-10 gap-2" disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {loading ? 'Updating password…' : 'Save & Sign In'}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setAuthStage('forgot')}
                      className="flex items-center justify-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground pt-1 transition-colors"
                    >
                      <ArrowLeft className="h-3 w-3" /> Request a new code
                    </button>
                  </form>
                )}

                {/* Quick demo credential filler */}
                {authStage === 'login' && (
                  <div className="pt-3 border-t border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                        One-Click Demo Roles
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">pw: demo1234</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { role: 'admin', label: 'Admin', icon: ShieldCheck, desc: 'Full system control' },
                        { role: 'officer', label: 'Officer', icon: RadioTower, desc: 'Command Center & approvals' },
                        { role: 'responder', label: 'Responder', icon: Zap, desc: 'Field dispatch & navigation' },
                        { role: 'citizen', label: 'Citizen', icon: Users, desc: 'Incident reporting & SOS' },
                      ].map((item) => {
                        const Icon = item.icon
                        return (
                          <button
                            key={item.role}
                            type="button"
                            onClick={() => fillDemo(item.role)}
                            className="flex items-center gap-2 p-2 rounded-lg border border-border/70 hover:border-primary/50 hover:bg-primary/5 bg-card/60 transition-all text-left group"
                          >
                            <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold leading-none group-hover:text-primary transition-colors">
                                {item.label}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                {item.desc}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Register link */}
                {authStage === 'login' && (
                  <p className="text-center text-xs text-muted-foreground pt-1">
                    Need emergency responder or citizen access?{' '}
                    <button
                      type="button"
                      onClick={() => navigate('/register')}
                      className="text-primary font-semibold hover:underline"
                    >
                      Create an account
                    </button>
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Footer note */}
            <p className="text-center text-[11px] text-muted-foreground mt-4">
              RESOURCEFLOW AI · High-Assurance Crisis Operations
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
