'use client'

import { useRouter } from '@/lib/use-router'
import { ArrowLeft, Shield, AlertTriangle, Eye, MapPin, Users, Phone } from 'lucide-react'
import { Footer } from '@/components/shared/footer'

export function SafetyPage() {
  const { navigate } = useRouter()

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/75 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-4">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-4 py-8 w-full">
        <h1 className="text-2xl font-bold mb-2">Safety & Responsible Use</h1>
        <p className="text-sm text-muted-foreground mb-8">Guidelines for safe and responsible use of ResourceFlow AI</p>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <p>ResourceFlow AI is designed to support emergency coordination and disaster response. To ensure the safety of all users and the effectiveness of emergency operations, please follow these guidelines.</p>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /> Verify Emergency Information</h2>
            <p>Verify emergency information whenever possible. Before submitting an incident report or sharing safety information, ensure that the details are accurate to the best of your knowledge. Misinformation can divert critical resources from those who need them most.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Protect Others&apos; Privacy</h2>
            <p>Do not share another person&apos;s private information without authorization. This includes their location, contact details, photos, or any personal data. Sharing private information without consent can endanger individuals and violate their rights.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Use Location Sharing Responsibly</h2>
            <p>Use location sharing only when necessary. Location sharing should be activated only during genuine emergencies or when reporting incidents. Be aware that when location sharing is active, your location is visible to authorized emergency personnel.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Follow Emergency Personnel Instructions</h2>
            <p>Follow instructions from authorized emergency personnel. During an active emergency response, always comply with directions from police, fire departments, medical teams, and other authorized responders. Their instructions take priority over any platform guidance.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /> In Immediate Danger</h2>
            <p>In immediate danger, contact the appropriate official emergency service. Do not rely solely on the platform for life-threatening emergencies. Call your local emergency number immediately: 911 (North America), 112 (Europe/Asia/Africa), 999 (UK), 111 (Australia), 110 (Japan), 108 (India).</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Report Misuse</h2>
            <p>If you observe misuse of the platform, false emergency reports, or unauthorized sharing of private information, please report it immediately. Contact us at <a href="mailto:akashreddy798695143@gmail.com" className="text-primary hover:underline">akashreddy798695143@gmail.com</a>.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}