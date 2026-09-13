'use client'

import { Mail, Phone, AlertTriangle, MessageCircle, RadioTower } from 'lucide-react'
import { LegalShell } from './legal-shell'

export function ContactPage() {
  return (
    <LegalShell
      title={
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <RadioTower className="h-5 w-5" />
          </span>
          Contact Information
        </span>
      }
      subtitle="Get in touch with the ResourceFlow AI team"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card/40 p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Reach Us</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Email</p>
                <a href="mailto:akashreddy798695143@gmail.com" className="text-sm text-muted-foreground hover:text-foreground transition break-all">
                  akashreddy798695143@gmail.com
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Phone</p>
                <a href="tel:8790401013" className="text-sm text-muted-foreground hover:text-foreground transition">
                  8790401013
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Emergency Notice
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            ResourceFlow AI is a decision-support platform and does not replace official emergency services. In any real emergency, immediately call your local emergency number: 911 (North America), 112 (Europe/Asia/Africa), 999 (UK), 111 (Australia), 110 (Japan), 108 (India).
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Platform Support
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            For technical support, feature requests, or questions about using the ResourceFlow AI platform, please email us at <a href="mailto:akashreddy798695143@gmail.com" className="text-primary hover:underline">akashreddy798695143@gmail.com</a>. We aim to respond to all inquiries promptly.
          </p>
        </div>
      </div>
    </LegalShell>
  )
}