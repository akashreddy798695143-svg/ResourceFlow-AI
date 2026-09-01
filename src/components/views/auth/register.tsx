'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/use-router'
import { useAuth } from '@/lib/use-auth'
import { toast } from 'sonner'
import { RadioTower, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const ROLES = [
  { value: 'CITIZEN', label: 'Citizen — report & track incidents' },
  { value: 'RESPONDER', label: 'Responder — handle assignments' },
  { value: 'DISASTER_OFFICER', label: 'Disaster Officer — command center & approvals' },
  { value: 'ADMIN', label: 'Admin — manage users & resources' },
]

export function RegisterView() {
  const { register } = useAuth()
  const { navigate } = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('CITIZEN')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) return toast.error('Password must be at least 6 characters')
    setLoading(true)
    try {
      const user = await register(name, email, password, role)
      toast.success(`Account created — welcome, ${user.name}`)
      if (user.role === 'CITIZEN') navigate('/citizen-dashboard')
      else if (user.role === 'RESPONDER') navigate('/incidents')
      else navigate('/command-center')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
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

          <Card>
            <CardHeader>
              <CardTitle>Create account</CardTitle>
              <CardDescription>Register for a disaster-response role</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
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
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {loading ? 'Creating…' : 'Create account'}
                </Button>
              </form>
              <p className="mt-6 text-center text-xs text-muted-foreground">
                Already have an account?{' '}
                <button onClick={() => navigate('/login')} className="text-primary hover:underline">Sign in</button>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      <footer className="border-t border-border bg-card/50 px-4 py-3 text-[11px] text-muted-foreground text-center">
        RESOURCEFLOW AI · Passwords hashed with Argon2id · Role enforced server-side
      </footer>
    </div>
  )
}
