'use client'

import { useEffect, useState } from 'react'
import { useRouter } from '@/lib/use-router'
import { apiPost } from '@/lib/api-client'
import { toast } from 'sonner'
import {
  RadioTower, AlertTriangle, Workflow, Bot, Activity, FlaskConical,
  Shield, ArrowRight, Map, Eye, CheckCircle2, Zap, GitBranch, FileText, Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function LandingView() {
  const { navigate } = useRouter()
  const [seeding, setSeeding] = useState(false)

  const seedAndLogin = async () => {
    setSeeding(true)
    try {
      await apiPost('/api/admin/seed')
      toast.success('Demo data ready. Login with officer@resourceflow.ai / demo1234')
      navigate('/login')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/70 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <RadioTower className="h-4 w-4" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold tracking-wide">RESOURCEFLOW AI</span>
              <span className="text-[10px] text-muted-foreground font-mono">Autonomous Disaster Coordination</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Sign in</Button>
            <Button size="sm" onClick={() => navigate('/register')}>Get Started</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'radial-gradient(circle at 20% 20%, var(--color-primary) 0%, transparent 40%), radial-gradient(circle at 80% 60%, var(--color-chart-5) 0%, transparent 40%)'
        }} />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="outline" className="mb-4 gap-1.5 text-primary border-primary/40">
                <Activity className="h-3 w-3" />
                AI-Assisted · Real-time · Explainable
              </Badge>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
                RESOURCEFLOW <span className="text-primary">AI</span>
              </h1>
              <p className="mt-6 text-lg md:text-xl text-muted-foreground">
                From Emergency Signals to Coordinated Action.
              </p>
              <p className="mt-3 text-sm text-muted-foreground/80 max-w-xl">
                A disaster-response coordination platform that converts emergency reports into an explainable, automated response workflow —
                from citizen report through AI analysis, risk scoring, resource optimization, human approval, adaptive reassignment, escalation and resolution.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" className="gap-2" onClick={seedAndLogin} disabled={seeding}>
                  <Zap className="h-4 w-4" />
                  {seeding ? 'Preparing demo…' : 'Run Live Demo'}
                </Button>
                <Button size="lg" variant="outline" className="gap-2" onClick={() => navigate('/register')}>
                  Create Account
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Demo accounts: <span className="font-mono text-foreground">admin@ / officer@ / responder@ / citizen@resourceflow.ai</span> · password <span className="font-mono text-foreground">demo1234</span>
              </p>
            </div>

            {/* Workflow visual */}
            <div className="relative">
              <Card className="bg-card/60 backdrop-blur border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono text-muted-foreground">CORE WORKFLOW</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {[
                    'REPORT', 'AI UNDERSTANDS', 'INCIDENTS FUSED',
                    'RISK CHANGES', 'RESOURCES OPTIMIZED', 'HUMAN APPROVES',
                    'AUTOMATION EXECUTES', 'LIVE SYSTEM MONITORS',
                    'FAILURE DETECTED', 'RESPONSE ADAPTS',
                    'ESCALATION OCCURS', 'INCIDENT RESOLVED',
                    'SYSTEM GENERATES REPORT',
                  ].map((step, i, arr) => (
                    <div key={step} className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-mono shrink-0">
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <span className="text-xs font-medium">{step}</span>
                      {i < arr.length - 1 && (
                        <div className="ml-auto text-muted-foreground/40">↓</div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-b border-border py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-sev-HIGH" />
                The Problem
              </h2>
              <p className="mt-3 text-muted-foreground">
                During disasters, emergency teams drown in unstructured reports, fragmented information, and conflicting resource demands.
                Decisions are made with incomplete data. Resources are dispatched inefficiently. Response delays cost lives.
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Workflow className="h-6 w-6 text-primary" />
                The Solution
              </h2>
              <p className="mt-3 text-muted-foreground">
                RESOURCEFLOW AI converts raw citizen reports into a structured, auditable response workflow:
                AI extracts structured facts, related reports are fused into clusters, a transparent risk score drives priority,
                a resource optimization agent recommends the right asset, a human officer approves, and the system tracks the response in real time —
                detecting failures and adapting automatically.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-border py-16 bg-card/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-center">How It Works</h2>
          <p className="mt-2 text-center text-muted-foreground text-sm">Every action is persisted. Every change is audited. Every state is real-time.</p>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Bot, title: 'AI Incident Agent', text: 'Gemini-powered analysis extracts severity, people affected, urgent needs, road blockage and risk factors from free-text reports — with structured, validated output.' },
              { icon: GitBranch, title: 'Duplicate Clustering', text: 'Reports are matched by geography, time, type and text similarity. Corroborating reports form clusters that raise the risk profile.' },
              { icon: Activity, title: 'Risk Engine', text: 'A transparent 0–100 prototype decision-support score blending severity, people affected, road blockage, cluster size, resource availability, weather and time sensitivity.' },
              { icon: Zap, title: 'Resource Optimization', text: 'Not just nearest — the agent scores distance, ETA, capacity, severity and workload to recommend the best-fit resource, with alternatives.' },
              { icon: CheckCircle2, title: 'Human Approval', text: 'AI never executes high-impact assignments alone. Every recommendation goes through an officer review — approve or reject — for accountability.' },
              { icon: Eye, title: 'Real-Time Tracking', text: 'WebSocket fan-out updates dashboards without refresh: assignments, status changes, delays, escalations, resolutions — all live.' },
              { icon: AlertTriangle, title: 'Failure Detection', text: 'Configurable thresholds detect acknowledgement, arrival and resolution delays. Resources that become unavailable trigger adaptive reassignment automatically.' },
              { icon: Map, title: 'Command Center', text: 'Interactive map, priority queue, AI recommendations, live event timeline — all driven by real backend data, never hardcoded.' },
              { icon: FlaskConical, title: 'What-If Simulator', text: 'Run deterministic scenarios — flood, cyclone, earthquake, landslide — with injectable failures. BASELINE vs RESOURCEFLOW metrics from calculated results only.' },
            ].map((f) => {
              const Icon = f.icon
              return (
                <Card key={f.title} className="bg-card/60">
                  <CardContent className="p-5">
                    <Icon className="h-6 w-6 text-primary mb-3" />
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Roles + Security */}
      <section className="border-b border-border py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Role-Based Access Control
            </h2>
            <p className="mt-3 text-muted-foreground text-sm">
              Four roles with real backend RBAC. Never trust frontend role information — every API request is re-verified against the database.
            </p>
            <div className="mt-4 space-y-2">
              {[
                ['CITIZEN', 'Report incidents, provide location, optionally upload image, track own incident by ID.'],
                ['RESPONDER', 'See assigned incidents, update resource status, advance the response lifecycle.'],
                ['DISASTER_OFFICER', 'See command center, review AI recommendations, approve/reject assignments, reassign resources, escalate, resolve.'],
                ['ADMIN', 'Manage users and resources, view audit logs, configure thresholds.'],
              ].map(([role, desc]) => (
                <div key={role} className="flex items-start gap-3 p-3 rounded-md border border-border bg-card/40">
                  <Badge variant="secondary" className="font-mono text-[10px]">{role}</Badge>
                  <p className="text-xs text-muted-foreground flex-1">{desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Lock className="h-6 w-6 text-primary" />
              Security & Reliability
            </h2>
            <ul className="mt-4 space-y-2.5">
              {[
                'JWT authentication + Argon2id password hashing',
                'RBAC enforced server-side on every protected route',
                'CORS, input validation, file type & size validation',
                'Audit log for every meaningful action',
                'AI key never exposed to frontend — backend-only calls',
                'Graceful fallbacks: AI fails → manual review; weather fails → continue; WS fails → reconnect',
              ].map((s) => (
                <li key={s} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-sev-LOW mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 text-center">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-3xl md:text-4xl font-bold">Run the Full Hackathon Demo</h2>
          <p className="mt-3 text-muted-foreground">
            One click triggers a complete synthetic disaster scenario through the real backend:
            citizen report → AI analysis → clustering → risk score → resource recommendation → officer approval →
            assignment → live map update → road blockage → adaptive response → resource failure → alternative recommendation →
            officer approval → escalation → resolution → automatic report.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={seedAndLogin} disabled={seeding}>
              <Zap className="h-4 w-4" />
              {seeding ? 'Preparing…' : 'Run Live Demo'}
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/register')}>
              <FileText className="h-4 w-4" />
              Create Account
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-card/50 px-4 py-4 text-[11px] text-muted-foreground">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-2">
          <span>RESOURCEFLOW AI · Prototype decision-support score — not a medically or scientifically validated model.</span>
          <span className="font-mono">Hackathon build · v1.0</span>
        </div>
      </footer>
    </div>
  )
}
