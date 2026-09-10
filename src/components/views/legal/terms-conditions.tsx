'use client'

import { useRouter } from '@/lib/use-router'
import { ArrowLeft, FileText, AlertTriangle, Shield, Users, Ban, Phone } from 'lucide-react'
import { Footer } from '@/components/shared/footer'

export function TermsConditionsPage() {
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
        <h1 className="text-2xl font-bold mb-2">Terms & Conditions</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: 2026</p>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <p>These Terms & Conditions govern your use of the ResourceFlow AI platform. By accessing or using our platform, you agree to be bound by these terms. Please read them carefully.</p>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Responsible Use</h2>
            <p>Users must use the platform responsibly. ResourceFlow AI is designed to support emergency response and disaster coordination. All users are expected to act in good faith and use the platform only for its intended purposes.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Accuracy of Emergency Information</h2>
            <p>Emergency information should be accurate. Users must ensure that any incident reports, safety checks, or emergency information they provide is truthful and accurate to the best of their knowledge. Providing false or misleading emergency information may have serious consequences.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Platform Purpose</h2>
            <p>The platform is intended to support disaster response and does not replace official emergency authorities. ResourceFlow AI provides AI-assisted risk assessment and decision support. It is not a substitute for professional emergency services, law enforcement, or disaster management authorities.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Ban className="h-4 w-4 text-primary" /> Prohibited Uses</h2>
            <p>Users must not misuse the communication, location or reporting features. Prohibited activities include: submitting false incident reports, impersonating emergency personnel, using the platform to harass or threaten others, interfering with emergency response operations, or using the platform for any unlawful purpose.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Privacy and Data Protection</h2>
            <p>Unauthorized access or sharing of private information is prohibited. Users must not attempt to access data belonging to other users without authorization. Sharing another person's private information, location data, or incident details without their explicit consent is strictly forbidden.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /> Emergency Services</h2>
            <p>In any real emergency, immediately call your local emergency number: 911 (North America), 112 (Europe/Asia/Africa), 999 (UK), 111 (Australia), 110 (Japan), 108 (India). ResourceFlow AI supplements but does not replace these services.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Limitation of Liability</h2>
            <p>ResourceFlow AI is provided "as is" without warranties of any kind. The platform is a decision-support tool and its outputs should be validated with authorized personnel. We are not liable for any damages arising from the use of or reliance on the platform during emergency situations.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Changes to Terms</h2>
            <p>We may update these Terms from time to time. Material changes will be posted on the platform. Continued use of ResourceFlow AI after changes constitutes acceptance of the updated terms.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}