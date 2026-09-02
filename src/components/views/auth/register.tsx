'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/use-router'
import { toast } from 'sonner'
import { RadioTower, Loader2, Smartphone, ShieldCheck, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { apiPost, apiGet } from '@/lib/api-client'
import { cn } from '@/lib/utils'

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
  phone: string  // masked
  otpRequired: boolean
  dualOtp: boolean
  phoneOtpSent: boolean
  emailOtpSent: boolean
  phoneOtpError?: string
  emailOtpError?: string
  otpExpiresAt: string
  message: string
}

export function RegisterView() {
  const { navigate } = useRouter()
  // Stage 1: registration form
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('CITIZEN')
  const [loading, setLoading] = useState(false)
  // Stage 2: dual OTP verification
  const [stage, setStage] = useState<'register' | 'verify'>('register')
  const [regResult, setRegResult] = useState<RegisterResponse | null>(null)
  const [phoneOtp, setPhoneOtp] = useState('')
  const [emailOtp, setEmailOtp] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [verifying, setVerifying] = useState<'phone' | 'email' | null>(null)
  const [resending, setResending] = useState<'phone' | 'email' | null>(null)

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) return toast.error('Password must be at least 6 characters')
    if (!phone.trim()) return toast.error('Phone number is required for OTP verification')
    setLoading(true)
    try {
      const res = await apiPost<RegisterResponse>('/api/auth/register', {
        name, email, password, role, phone,
      })
      setRegResult(res)
      setStage('verify')
      if (res.phoneOtpSent && res.emailOtpSent) {
        toast.success('Verification codes sent to your phone (SMS) and email')
      } else if (res.phoneOtpSent) {
        toast.warning('Phone OTP sent. Email OTP failed — you can resend it below.')
      } else if (res.emailOtpSent) {
        toast.warning('Email OTP sent. Phone OTP failed — you can resend it below.')
      } else {
        toast.error('Both OTP deliveries failed. You can resend each below.')
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (channel: 'phone' | 'email') => {
    const code = channel === 'phone' ? phoneOtp : emailOtp
    if (code.length !== 6) return toast.error(`Enter the 6-digit ${channel} code`)
    setVerifying(channel)
    try {
      const identifier = channel === 'phone'
        ? phone.replace(/[\s()-]/g, '')
        : email.toLowerCase()
      const res = await apiPost<any>('/api/auth/verify-otp', {
        userId: regResult!.userId,
        identifier,
        code,
        channel: channel === 'phone' ? 'SMS' : 'EMAIL',
      })
      if (res.activated) {
        toast.success(res.message || 'Account activated successfully')
        const me = await apiGet<any>('/api/auth/me')
        if (me.role === 'CITIZEN') navigate('/citizen-dashboard')
        else if (me.role === 'RESPONDER') navigate('/incidents')
        else navigate('/command-center')
        return
      }
      // Partial — one channel verified
      if (channel === 'phone') { setPhoneVerified(true); setPhoneOtp('') }
      else { setEmailVerified(true); setEmailOtp('') }
      toast.success(res.message || `${channel} verified`)
    } catch (e: any) {
      toast.error(e.message || `${channel} OTP verification failed`)
    } finally {
      setVerifying(null)
    }
  }

  const resendOtp = async (channel: 'phone' | 'email') => {
    setResending(channel)
    try {
      const identifier = channel === 'phone'
        ? phone.replace(/[\s()-]/g, '')
        : email.toLowerCase()
      const res = await apiPost<{ sent: boolean; message: string; error?: string }>('/api/auth/resend-otp', {
        userId: regResult!.userId,
        identifier,
        channel: channel === 'phone' ? 'SMS' : 'EMAIL',
      })
      if (res.sent) toast.success(res.message)
      else toast.error(res.error || res.message)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setResending(null)
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
                <CardDescription>Register with phone + email dual OTP verification</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submitRegister} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone number <span className="text-muted-foreground text-[10px]">(E.164, for SMS OTP)</span></Label>
                    <Input id="phone" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+97798XXXXXXXX" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email <span className="text-muted-foreground text-[10px]">(for email OTP)</span></Label>
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
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                    {loading ? 'Sending OTPs…' : 'Register & Send OTPs'}
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
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Verify OTPs</CardTitle>
                <CardDescription>
                  Enter the 6-digit codes sent to your phone ({regResult?.phone}) and email.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Phone OTP */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="phoneOtp" className="flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> Phone OTP</Label>
                    {phoneVerified && <Badge variant="outline" className="text-[9px] text-sev-LOW border-sev-LOW">✓ Verified</Badge>}
                    {!phoneVerified && !regResult?.phoneOtpSent && <Badge variant="outline" className="text-[9px] text-sev-CRITICAL border-sev-CRITICAL">✗ Not sent</Badge>}
                  </div>
                  <Input
                    id="phoneOtp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                    value={phoneOtp} onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" disabled={phoneVerified}
                    className={cn('text-center text-xl tracking-[0.4em] font-mono', phoneVerified && 'opacity-50')}
                  />
                  {!phoneVerified && (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" className="flex-1 gap-1.5" onClick={() => verifyOtp('phone')} disabled={verifying === 'phone' || phoneOtp.length !== 6}>
                        {verifying === 'phone' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Verify Phone
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => resendOtp('phone')} disabled={resending === 'phone'}>
                        {resending === 'phone' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Resend'}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Email OTP */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="emailOtp" className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email OTP</Label>
                    {emailVerified && <Badge variant="outline" className="text-[9px] text-sev-LOW border-sev-LOW">✓ Verified</Badge>}
                    {!emailVerified && !regResult?.emailOtpSent && <Badge variant="outline" className="text-[9px] text-sev-CRITICAL border-sev-CRITICAL">✗ Not sent</Badge>}
                  </div>
                  <Input
                    id="emailOtp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                    value={emailOtp} onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" disabled={emailVerified}
                    className={cn('text-center text-xl tracking-[0.4em] font-mono', emailVerified && 'opacity-50')}
                  />
                  {!emailVerified && (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" className="flex-1 gap-1.5" onClick={() => verifyOtp('email')} disabled={verifying === 'email' || emailOtp.length !== 6}>
                        {verifying === 'email' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Verify Email
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => resendOtp('email')} disabled={resending === 'email'}>
                        {resending === 'email' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Resend'}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
                  Account activates only when BOTH phone + email are verified. OTP expires at {regResult ? new Date(regResult.otpExpiresAt).toLocaleTimeString() : '—'}.
                </div>

                <button
                  onClick={() => setStage('register')}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ← Back to registration
                </button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <footer className="border-t border-border bg-card/50 px-4 py-3 text-[11px] text-muted-foreground text-center">
        RESOURCEFLOW AI · Dual OTP (phone + email) · Passwords hashed with Argon2id · Role enforced server-side
      </footer>
    </div>
  )
}
