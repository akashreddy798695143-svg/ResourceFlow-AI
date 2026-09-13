'use client'

import {
  Shield, AlertTriangle, Eye, MapPin, Navigation, Smartphone, MessageCircle, Heart,
  Search, Users, Server, Bot, Phone, Ban, RadioTower,
} from 'lucide-react'
import { LegalShell, LegalSectionList } from './legal-shell'

export function SafetyPage() {
  const sections = [
    {
      icon: Phone,
      title: 'In Any Real Emergency',
      body: (
        <p>ResourceFlow AI supports emergency coordination — it does not replace official emergency services or authorities. In any real emergency, immediately call your local emergency number: 911 (North America), 112 (Europe/Asia/Africa), 999 (UK), 111 (Australia), 110 (Japan), 108 (India). Always follow instructions from police, fire departments, medical teams and other authorized responders — their instructions take priority over any platform guidance.</p>
      ),
    },
    {
      icon: AlertTriangle,
      title: 'Emergency Reporting',
      body: (
        <p>Report incidents as accurately and promptly as you can. Include the essential details — what happened, who needs help, and any immediate hazards such as road blockages. Do not submit false reports: misinformation can divert critical resources from those who need them most. Use location sharing only when appropriate for a genuine incident.</p>
      ),
    },
    {
      icon: Eye,
      title: 'Verify AI Output',
      body: (
        <p>ResourceFlow AI assists with incident classification, risk scoring, impact estimation and resource recommendations. AI-generated outputs are decision-support information and may require human verification. AI outputs may be incomplete or incorrect — important emergency decisions follow the platform&apos;s authorized human review and approval workflow where applicable.</p>
      ),
    },
    {
      icon: Bot,
      title: 'AI Is Not Always Correct',
      body: (
        <p>AI analysis is based on the information available to it and may misclassify an incident, misestimate severity, or recommend a resource that is not the best fit. Treat AI outputs as advisory. When outputs are unclear or contradictory, escalate to human review rather than relying on the automated analysis.</p>
      ),
    },
    {
      icon: MapPin,
      title: 'GPS Limitations',
      body: (
        <p>Location information should not be considered perfectly accurate. Network availability, device capabilities and GPS limitations may affect location accuracy, especially indoors, in dense urban areas, or during severe weather. Do not rely on displayed positions as exact responder or incident locations.</p>
      ),
    },
    {
      icon: Server,
      title: 'Network & System Failure Limitations',
      body: (
        <p>During disasters, network connectivity, power and infrastructure may fail. Platform features — including live tracking, chat and alerts — may be delayed, degraded or unavailable. Have an offline/official backup plan: do not depend solely on the platform for life-safety communication.</p>
      ),
    },
    {
      icon: Smartphone,
      title: 'Emergency Communication Limitations',
      body: (
        <p>Emergency Chat and platform notifications supplement official communication — they do not replace it. Messages may be delayed, and delivery is not guaranteed. Never rely on the platform alone to summon help in a life-threatening situation: call your local emergency number.</p>
      ),
    },
    {
      icon: Heart,
      title: 'Safe-Place Information',
      body: (
        <p>Nearby safe-place detection is intended to help you identify shelters and designated safe locations. Safe-place information may be incomplete or out of date during an active disaster. Whenever possible, confirm safe locations through official authorities before traveling.</p>
      ),
    },
    {
      icon: Search,
      title: 'Emergency Service Information',
      body: (
        <p>Nearby emergency-service detection is intended to help identify hospitals and emergency services. Availability, capacity and access may change during a disaster. The displayed information is advisory — official emergency dispatch remains the authoritative channel.</p>
      ),
    },
    {
      icon: Users,
      title: 'Citizen Safety Responsibilities',
      body: (
        <p>Protect your own safety first. Do not travel to unsafe areas to report or photograph an incident. Avoid sharing another person&apos;s private information, and submit only the information necessary for response. Follow official evacuation and safety instructions.</p>
      ),
    },
    {
      icon: Shield,
      title: 'Responder Safety',
      body: (
        <p>Responders must follow their organization&apos;s official safety procedures at all times. Platform guidance, routes and recommendations are advisory and may be based on incomplete information. Responder safety decisions always rest with the responder and their official chain of command.</p>
      ),
    },
    {
      icon: Server,
      title: 'Platform Limitations',
      body: (
        <p>ResourceFlow AI is a disaster-response coordination prototype. It is provided &quot;as is&quot;, its outputs should be validated with authorized personnel, and it makes no guarantee of accuracy, availability or any particular response outcome. Report misuse at <a href="mailto:akashreddy798695143@gmail.com" className="text-primary hover:underline">akashreddy798695143@gmail.com</a>.</p>
      ),
    },
  ]

  return (
    <LegalShell
      title="Safety & Responsible Use"
      subtitle="Guidelines for safe and responsible use of ResourceFlow AI"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-muted-foreground leading-relaxed flex items-start gap-3">
          <RadioTower className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p>
            <strong className="text-foreground">ResourceFlow AI supports emergency coordination and does not replace official emergency services or authorities.</strong>{' '}
            Read the guidelines below before using the platform during an emergency.
          </p>
        </div>
        <LegalSectionList sections={sections} />
      </div>
    </LegalShell>
  )
}