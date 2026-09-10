'use client'

import { useRouter } from '@/lib/use-router'
import { ArrowLeft, Shield, Lock, Eye, MapPin, FileText, Users, AlertTriangle } from 'lucide-react'
import { Footer } from '@/components/shared/footer'

export function PrivacyPolicyPage() {
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
        <h1 className="text-2xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: 2026</p>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <p>ResourceFlow AI is committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and the measures we take to safeguard your data. By using ResourceFlow AI, you agree to the practices described in this policy.</p>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Information Collection</h2>
            <p>User information is collected only for emergency response and platform functionality. We collect information you provide directly, such as your name, email, phone number, incident descriptions, photos, and safety-check messages. We also automatically collect device information necessary for platform operation.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Location Information</h2>
            <p>Location information is used for emergency coordination and safety features. Your location is collected only when you actively report an incident, send an SOS, or check in. It is essential for routing resources and ensuring your safety. Location data is never used for commercial tracking purposes.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /> Shared Photos and Incident Information</h2>
            <p>Shared photos and incident information are accessible only to authorized users. Photos and evidence you upload are processed by AI for incident analysis and are visible only to authorized officers and emergency responders involved in the response effort.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Personal Information Protection</h2>
            <p>Personal information should not be exposed to unauthorized users. Access to personal data is role-based and strictly controlled. Data is scoped by ownership and need-to-know basis. Personal information is never sold or rented to third parties.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Emergency Location Sharing</h2>
            <p>Emergency location sharing should be handled securely. Users should be informed when location sharing is active. Location data shared during emergencies is transmitted securely and accessible only to authorized emergency personnel for the duration of the response.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Lock className="h-4 w-4 text-primary" /> Data Security</h2>
            <p>Data should be protected using appropriate security controls. We employ industry-standard security measures including encryption in transit (HTTPS/TLS), secure password hashing (Argon2id), server-side role-based access control, and secure credential storage. API keys and sensitive credentials are stored as environment variables and never exposed to the client.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Your Rights</h2>
            <p>You have the right to access, correct, or delete your personal data. You may also request information about how your data is being used. To exercise these rights, contact us at <a href="mailto:akashreddy798695143@gmail.com" className="text-primary hover:underline">akashreddy798695143@gmail.com</a>.</p>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Emergency Limitations</h2>
            <p>ResourceFlow AI is a decision-support platform. In any real emergency, immediately call your local emergency number. Data collection and processing may be limited during emergency operations to prioritize life safety.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}