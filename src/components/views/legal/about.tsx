'use client'

import { RadioTower, Brain, Activity, MapPin, Users, MessageCircle, Heart, Search, Workflow, ArrowDown } from 'lucide-react'
import { LegalShell } from './legal-shell'

const WORKFLOW_STEPS = [
  'Citizen Report',
  'AI Analysis',
  'Risk & Impact Assessment',
  'Officer Review',
  'Resource Recommendation',
  'Resource Assignment',
  'Dispatch',
  'Live Tracking',
  'Arrival Confirmation',
  'Resolution',
  'Incident Report',
]

const FEATURES = [
  {
    icon: Brain,
    name: 'AI Disaster Analysis',
    does: 'Analyzes incident reports to classify the disaster, assess risk and severity, and estimate impact.',
    helps: 'Turns raw citizen reports into structured, prioritized information officers can act on quickly.',
    who: 'Officers, admins and responders via the platform; citizens benefit from faster triage.',
  },
  {
    icon: Activity,
    name: 'Real-Time Incident Tracking',
    does: 'Tracks incidents as they unfold with live status updates, timelines and event fan-out.',
    helps: 'Everyone involved sees the same up-to-date picture without manual refresh or phone calls.',
    who: 'Citizens tracking their reports; officers and responders monitoring active incidents.',
  },
  {
    icon: MapPin,
    name: 'Resource & Logistics Tracking',
    does: 'Coordinates resources — assignments, dispatch, destination, responder status, arrival and completion.',
    helps: 'Keeps resource deployment organized and auditable from recommendation to resolution.',
    who: 'Officers approve and assign; responders update status; admins monitor the resource pool.',
  },
  {
    icon: Users,
    name: 'Citizen Location Sharing',
    does: 'Shares location during incident reporting and safety check-ins, with the user&apos;s permission.',
    helps: 'Helps coordinators understand where help is needed and route responders appropriately.',
    who: 'Citizens (with permission), reviewed by authorized officers for coordination.',
  },
  {
    icon: Users,
    name: 'Volunteer Coordination',
    does: 'Registers volunteers and manages their availability, roles and locations.',
    helps: 'Extends response capacity with organized community support during disasters.',
    who: 'Citizens register; officers manage and coordinate volunteers.',
  },
  {
    icon: MessageCircle,
    name: 'Emergency Chat',
    does: 'Enables real-time communication between citizens and authorized emergency-response personnel.',
    helps: 'Keeps coordination on-platform and connected to the relevant incident context.',
    who: 'Citizens, responders and officers involved in an incident.',
  },
  {
    icon: Heart,
    name: 'Safe Place Detection',
    does: 'Helps identify nearby shelters and designated safe locations during an emergency.',
    helps: 'Gives affected people actionable directions to safety when they need them.',
    who: 'Citizens in affected areas; officers assisting with evacuation coordination.',
  },
  {
    icon: Search,
    name: 'Emergency Service Detection',
    does: 'Helps identify nearby hospitals and emergency services when needed.',
    helps: 'Reduces the time it takes to find the right emergency facility during a crisis.',
    who: 'Citizens and responders locating care and support services.',
  },
]

export function AboutPage() {
  return (
    <LegalShell
      title={
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <RadioTower className="h-5 w-5" />
          </span>
          RESOURCEFLOW AI
        </span>
      }
      subtitle="Autonomous Disaster Coordination"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card/40 p-5 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            ResourceFlow AI is an AI-powered disaster-response coordination platform — a hackathon prototype built to demonstrate how citizens, responders and officers can coordinate disaster response through a single, auditable workflow.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            During disasters, emergency teams deal with unstructured reports, fragmented information and conflicting resource demands — while delays cost lives. ResourceFlow AI converts raw citizen reports into a structured, explainable and auditable response workflow: AI extracts structured facts, related reports are fused into clusters, a transparent risk score drives priority, a resource optimization agent recommends the right asset, a human officer approves, and the system tracks the response in real time — detecting failures and adapting automatically.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The result: faster triage, less duplicated effort, transparent decision-making and full traceability from the first citizen alert to the final incident report. Every action is persisted and every state is real-time.
          </p>
        </div>

        {/* End-to-end workflow */}
        <div className="rounded-lg border border-border bg-card/40 p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            How the Platform Works
          </h2>
          <div className="flex flex-col items-center">
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={step} className="flex flex-col items-center w-full">
                <div className="w-full max-w-xs rounded-md border border-border bg-background/60 px-4 py-2 text-center text-sm font-semibold text-foreground">
                  {step}
                </div>
                {i < WORKFLOW_STEPS.length - 1 && (
                  <ArrowDown className="h-4 w-4 text-primary my-1" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Feature explanations */}
        <div className="rounded-lg border border-border bg-card/40 p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Platform Features
          </h2>
          <div className="grid gap-4">
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.name} className="rounded-md border border-border bg-background/60 p-4">
                  <p className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    {f.name}
                  </p>
                  <dl className="text-sm text-muted-foreground leading-relaxed space-y-1">
                    <div><span className="font-semibold text-foreground">What it does:</span> {f.does}</div>
                    <div><span className="font-semibold text-foreground">How it helps:</span> {f.helps}</div>
                    <div><span className="font-semibold text-foreground">Who uses it:</span> {f.who}</div>
                  </dl>
                </div>
              )
            })}
          </div>
        </div>

        {/* Mission */}
        <div className="rounded-lg border border-border bg-card/40 p-5">
          <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <Heart className="h-4 w-4 text-primary" />
            Our Mission
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            To reduce the impact of disasters by providing intelligent, coordinated and accessible emergency-response decision support. ResourceFlow AI bridges the gap between citizens, volunteers and emergency personnel — enabling faster, smarter and more accountable disaster response. The platform supports emergency coordination and does not replace official emergency services or authorities.
          </p>
        </div>
      </div>
    </LegalShell>
  )
}