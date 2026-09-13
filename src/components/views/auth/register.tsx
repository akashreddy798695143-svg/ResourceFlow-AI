'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/use-router'
import { toast } from 'sonner'
import {
  RadioTower, Loader2, ShieldCheck, Mail, ArrowLeft, Eye, EyeOff,
  User, Phone, KeyRound, CheckCircle2, Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { apiPost, apiGet } from '@/lib/api-client'

const ROLES = [
  { value: 'CITIZEN', label: 'Citizen — report incidents & request help' },
  { value: 'RESPONDER', label: 'Responder — handle assignments & navigation' },
  { value: 'DISASTER_OFFICER', label: 'Disaster Officer — command center & approvals' },
  { value: 'ADMIN', label: 'Admin — manage users & crisis resources' },
]

interface RegisterResponse {
  userId: string
  email: string
  name: string
  role: string
  otpRequired: boolean
  emailOtpSent: boolean
  emailOtpError?: string
  otpExpiresAt: string
  message: string
}

export function RegisterView() {
  const { navigate } = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState('CITIZEN')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState<'register' | 'verify'>('register')
  const [regResult, setRegResult] = useState<RegisterResponse | null>(null)
  const [otp, setOtp] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) return toast.error('Password must be at least 6 characters')
    setLoading(true)
    try {
      const res = await apiPost<RegisterResponse>('/api/auth/register', {
        name,
        email,
        password,
        role,
        phone: phone || undefined,
      })
      setRegResult(res)
      setStage('verify')
      if (res.emailOtpSent) {
        toast.success('Verification code sent to your email')
      } else {
        toast.error(res.emailOtpError || 'Unable to send OTP. You can resend below.')
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const submitVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length !== 6) return toast.error('Enter the 6-digit code')
    setVerifying(true)
    try {
      const res = await apiPost<{ activated: boolean; message: string }>('/api/auth/verify-otp', {
        userId: regResult!.userId,
        email,
        code: otp,
      })
      toast.success(res.message || 'Account activated')
      const me = await apiGet<any>('/api/auth/me')
      if (me.role === 'CITIZEN') navigate('/citizen-dashboard')
      else if (me.role === 'RESPONDER') navigate('/incidents')
      else navigate('/command-center')
    } catch (e: any) {
      toast.error(e.message || 'OTP verification failed')
    } finally {
      setVerifying(false)
    }
  }

  const resendOtp = async () => {
    setResending(true)
    try {
      const res = await apiPost<{ sent: boolean; message: string; error?: string }>('/api/auth/resend-otp', {
        userId: regResult!.userId,
        email,
      })
      if (res.sent) toast.success(res.message)
      else toast.error(res.error || res.message)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setResending(false)
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
            OPERATIONAL ENROLLMENT
          </Badge>
          <ThemeToggle size="sm" />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 py-8">
        <div className="w-full max-w-[450px]">
          {/* Mobile brand header */}
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/25">
              <RadioTower className="h-5 w-5" />
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="text-base font-bold tracking-wide">RESOURCEFLOW AI</span>
              <span className="text-[10px] text-muted-foreground font-mono">Crisis Operations Enrollment</span>
            </div>
          </div>

          {stage === 'register' ? (
            <Card className="border border-border shadow-lg shadow-black/5 dark:shadow-black/25 bg-card rounded-xl">
              <CardHeader className="space-y-1 pb-4">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] font-mono gap-1 text-primary border-primary/30">
                    <Lock className="h-2.5 w-2.5" /> SECURE REGISTRATION
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono">STEP 01/02</span>
                </div>
                <CardTitle className="text-xl font-bold tracking-tight">Create Account</CardTitle>
                <CardDescription className="text-xs">
                  Register with verified email and phone credentials for authenticated crisis response.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <form onSubmit={submitRegister} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs font-medium">Full Name</Label>
                    <div className="relative">
                      <Input
                        id="name"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Officer / Citizen Name"
                        className="h-10 text-sm pl-9"
                      />
                      <User className="h-4 w-4 text-muted-foreground absolute left-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium">Email Address</Label>
                    <div className="relative">
                      <Input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="h-10 text-sm pl-9"
                      />
                      <Mail className="h-4 w-4 text-muted-foreground absolute left-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-xs font-medium">
                      Phone Number <span className="text-[10px] text-muted-foreground">(SMS & WhatsApp alerts)</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="phone"
                        required
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+919876543210"
                        className="h-10 text-sm pl-9 font-mono"
                      />
                      <Phone className="h-4 w-4 text-muted-foreground absolute left-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 6 characters"
                        className="h-10 text-sm pl-9 pr-10"
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

                  <div className="space-y-1.5">
                    <Label htmlFor="role" className="text-xs font-medium">Operational Role</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger id="role" className="h-10 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value} className="text-xs py-2">
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button type="submit" className="w-full h-10 gap-2 font-semibold shadow-sm mt-2" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {loading ? 'Processing…' : 'Register & Send OTP'}
                  </Button>
                </form>

                <p className="text-center text-xs text-muted-foreground pt-2">
                  Already have an authorized account?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="text-primary font-semibold hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-border shadow-lg shadow-black/5 dark:shadow-black/25 bg-card rounded-xl">
              <CardHeader className="space-y-1 pb-4">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] font-mono gap-1 text-emerald-500 border-emerald-500/30">
                    <ShieldCheck className="h-2.5 w-2.5" /> OTP VERIFICATION
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono">STEP 02/02</span>
                </div>
                <CardTitle className="text-xl font-bold tracking-tight">Verify Identity</CardTitle>
                <CardDescription className="text-xs">
                  Enter the 6-digit verification code transmitted to{' '}
                  <span className="font-mono text-foreground font-semibold">{email}</span>.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <form onSubmit={submitVerify} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="otp" className="text-xs font-medium">6-digit Verification Code</Label>
                    <Input
                      id="otp"
                      required
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="text-center text-xl tracking-[0.4em] font-mono h-11"
                    />
                    <p className="text-[11px] text-muted-foreground font-mono">
                      Code expires at: {regResult ? new Date(regResult.otpExpiresAt).toLocaleTimeString() : '—'}
                    </p>
                  </div>

                  <Button type="submit" className="w-full h-10 gap-2 font-semibold shadow-sm" disabled={verifying}>
                    {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
                    {verifying ? 'Verifying Credentials…' : 'Verify & Activate Account'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-10 text-xs"
                    onClick={resendOtp}
                    disabled={resending}
                  >
                    {resending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {resending ? 'Resending Code…' : 'Resend One-Time Code'}
                  </Button>
                </form>

                <button
                  type="button"
                  onClick={() => setStage('register')}
                  className="flex items-center justify-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground pt-1 transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to registration
                </button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <footer className="border-t border-border bg-card/50 px-4 py-3 text-[11px] text-muted-foreground text-center">
        RESOURCEFLOW AI · Email OTP verification · Passwords hashed with Argon2id · Role-Based Security
      </footer>
    </div>
  )
}
