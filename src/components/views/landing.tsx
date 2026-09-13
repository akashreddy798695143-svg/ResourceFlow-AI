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
import { Footer } from '@/components/shared/footer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import { ThemeToggle } from '@/components/shared/theme-toggle'
import { HeroBackgroundSlideshow } from './hero-slideshow'

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
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-md supports-[backdrop-filter]:bg-card/75">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-15 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <RadioTower className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold tracking-wider">RESOURCEFLOW AI</span>
              <span className="text-[10px] text-muted-foreground font-mono">Autonomous Disaster Coordination</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle size="sm" />
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')} className="text-xs font-medium">
              Sign in
            </Button>
            <Button size="sm" onClick={() => navigate('/register')} className="text-xs font-medium shadow-sm">
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Banner with 20-Image Automatic Disaster Background Slideshow */}
      <section className="relative overflow-hidden border-b border-border min-h-[580px] lg:min-h-[640px] flex items-center">
        {/* Background Disaster Response Slideshow with Ken-Burns Motion & Scrim Overlay */}
        <HeroBackgroundSlideshow />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 md:py-20 w-full z-10">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column: Hero Typography and Action Triggers */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/25 border border-amber-400/50 text-amber-200 text-xs font-bold tracking-wide backdrop-blur-xs">
                <Activity className="h-3.5 w-3.5 animate-pulse text-amber-400" />
                <span className="rf-hero-text">AI-POWERED DISASTER RESPONSE · REAL-TIME COORDINATION</span>
              </div>

              <div>
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.08] text-white rf-hero-text drop-shadow-md">
                  RESOURCEFLOW <span className="text-amber-400">AI</span>
                </h1>
                <p className="mt-3 text-xl sm:text-2xl font-bold text-white tracking-tight rf-hero-text drop-shadow-sm">
                  From Emergency Signals to Coordinated Action.
                </p>
              </div>

              <p className="text-sm sm:text-base text-slate-100 leading-relaxed max-w-2xl font-semibold rf-hero-text">
                A mission-critical disaster management platform that converts unstructured crisis reports into an explainable,
                audited response workflow — from citizen alerts through AI triage, hazard risk scoring, multi-agency resource optimization,
                human officer approval, and live responder dispatch.
              </p>

              {/* Action Buttons: Emergency Reporting, Command Center, Live Demo */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  size="lg"
                  className="gap-2 bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30 font-bold text-sm h-11 px-5 tracking-wide"
                  onClick={() => navigate('/report-incident')}
                >
                  <AlertTriangle className="h-4 w-4" />
                  Report Emergency
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 font-bold text-sm h-11 px-5 bg-slate-900/60 hover:bg-slate-800/80 text-white border-white/30 backdrop-blur-xs shadow-sm tracking-wide rf-hero-text"
                  onClick={() => navigate('/command-center')}
                >
                  <RadioTower className="h-4 w-4 text-amber-400" />
                  Command Center
                </Button>

                <Button
                  size="lg"
                  className="gap-2 font-bold text-sm h-11 px-5 bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md shadow-amber-500/20 tracking-wide"
                  onClick={seedAndLogin}
                  disabled={seeding}
                >
                  <Zap className="h-4 w-4 text-slate-950" />
                  {seeding ? 'Preparing Demo…' : 'Run Live Demo'}
                </Button>
              </div>

              {/* Operational capability badges */}
              <div className="pt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white font-mono font-bold">
                <span className="flex items-center gap-1.5 rf-hero-text">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Sub-second Hazard Triage
                </span>
                <span className="flex items-center gap-1.5 rf-hero-text">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Conflict-Free Resource Allocation
                </span>
                <span className="flex items-center gap-1.5 rf-hero-text">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Zero-Data-Loss Offline Sync
                </span>
              </div>

            </div>

            {/* Right Column: Workflow Telemetry Visual */}
            <div className="lg:col-span-5 relative">
              <div
                className="rounded-xl overflow-hidden shadow-2xl shadow-black/50 transition-all border"
                style={{
                  background: 'rgba(5, 12, 24, 0.78)',
                  borderColor: 'rgba(255, 255, 255, 0.14)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                <div
                  className="p-3.5 border-b flex items-center justify-between"
                  style={{
                    borderColor: 'rgba(255, 255, 255, 0.10)',
                    background: 'rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <div className="text-xs font-mono tracking-wider uppercase flex items-center gap-2 text-white font-bold">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    CORE DISASTER WORKFLOW
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono font-bold text-amber-300 border-amber-400/50 bg-amber-500/20">
                    LIVE PIPELINE
                  </Badge>
                </div>
                <div className="p-3.5 space-y-1.5 font-mono text-xs">
                  {[
                    { step: 'REPORT', desc: 'Multi-lingual citizen SOS & voice signal' },
                    { step: 'AI UNDERSTANDS', desc: 'Gemini extraction of needs & road blockages' },
                    { step: 'INCIDENTS FUSED', desc: 'Geospatial & temporal clustering' },
                    { step: 'RISK CHANGES', desc: 'Transparent 0–100 heuristic scoring' },
                    { step: 'RESOURCES OPTIMIZED', desc: 'Multi-criteria asset recommendation' },
                    { step: 'HUMAN APPROVES', desc: 'Authorized officer review & verification' },
                    { step: 'AUTOMATION EXECUTES', desc: 'Dispatch alerts via WhatsApp, SMS, Email' },
                    { step: 'LIVE SYSTEM MONITORS', desc: 'Real-time telemetry, GPS & WebSocket fan-out' },
                    { step: 'FAILURE DETECTED', desc: 'Automatic delay & blockage detection' },
                    { step: 'RESPONSE ADAPTS', desc: 'Autonomous re-routing & dynamic alternatives' },
                    { step: 'INCIDENT RESOLVED', desc: 'Post-incident report & learning loop' },
                  ].map((item, i, arr) => (
                    <div key={item.step} className="flex items-center gap-2.5 p-1 rounded hover:bg-white/10 transition-colors">
                      <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/25 text-amber-300 text-[10px] font-bold shrink-0 border border-amber-400/30">
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <span className="font-bold text-white text-[11px] shrink-0 tracking-wide">
                        {item.step}
                      </span>
                      <span className="text-[10px] text-slate-100 font-medium truncate hidden sm:inline">
                        — {item.desc}
                      </span>
                      {i < arr.length - 1 && (
                        <div className="ml-auto text-slate-400/50 text-[10px]">↓</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
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
      <Footer />
    </div>
  )
}
