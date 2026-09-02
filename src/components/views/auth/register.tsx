'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/use-router'
import { toast } from 'sonner'
import { RadioTower, Loader2, ShieldCheck, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { apiPost, apiGet } from '@/lib/api-client'

const ROLES = [
  { value: 'CITIZEN', label: 'Citizen — report & track incidents' },
  { value: 'RESPONDER', label: 'Responder — handle assignments' },
  { value: 'DISASTER_OFFICER', label: 'Disaster Officer — command center & approvals' },
  { value: 'ADMIN', label: 'Admin — manage users & resources' },
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
  const [password, setPassword] = useState('')
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
      const res = await apiPost<RegisterResponse>('/api/auth/register', { name, email, password, role })
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
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 mb-6 mx-auto">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <RadioTower className="h-4 w-4" />
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="text-sm font-bold tracking-wide">RESOURCEFLOW AI</span>
              <span className="text-[10px] text-muted-foreground font-mono">Disaster Coordination</span>
            </div>
          </button>

          {stage === 'register' ? (
            <Card>
              <CardHeader>
                <CardTitle>Create account</CardTitle>
                <CardDescription>Register with email OTP verification</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitRegister} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 6 characters" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="role">Role</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full gap-1.5" disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {loading ? 'Sending OTP…' : 'Register & Send OTP'}
                  </Button>
                </form>
                <p className="mt-6 text-center text-xs text-muted-foreground">
                  Already have an account?{' '}
                  <button onClick={() => navigate('/login')} className="text-primary hover:underline">Sign in</button>
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Verify OTP</CardTitle>
                <CardDescription>
                  Enter the 6-digit code sent to <span className="font-mono text-foreground">{email}</span>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitVerify} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="otp">6-digit verification code</Label>
                    <Input
                      id="otp" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                      value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="text-center text-2xl tracking-[0.5em] font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Expires at {regResult ? new Date(regResult.otpExpiresAt).toLocaleTimeString() : '—'}
                    </p>
                  </div>
                  <Button type="submit" className="w-full gap-1.5" disabled={verifying}>
                    {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
                    {verifying ? 'Verifying…' : 'Verify & Activate'}
                  </Button>
                  <Button type="button" variant="outline" className="w-full" onClick={resendOtp} disabled={resending}>
                    {resending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {resending ? 'Resending…' : 'Resend OTP'}
                  </Button>
                </form>
                <button
                  onClick={() => setStage('register')}
                  className="mt-4 text-xs text-muted-foreground hover:text-foreground"
                >
                  ← Back to registration
                </button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <footer className="border-t border-border bg-card/50 px-4 py-3 text-[11px] text-muted-foreground text-center">
        RESOURCEFLOW AI · Email OTP verification · Passwords hashed with Argon2id · Role enforced server-side
      </footer>
    </div>
  )
}
