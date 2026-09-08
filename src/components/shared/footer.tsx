'use client'

import { useState } from 'react'
import { useRouter } from '@/lib/use-router'
import { RadioTower, Shield, Lock, FileText, AlertTriangle, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PrivacyModal, TermsModal, SecurityModal, DisclaimerModal, DemoAccessModal } from '@/components/shared/legal-modals'

export function Footer() {
  const { navigate } = useRouter()
  const [activeModal, setActiveModal] = useState<string | null>(null)

  return (
    <>
      <footer className="border-t border-border bg-card/30 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <RadioTower className="h-4 w-4" />
                </div>
                <span className="font-bold tracking-tight">RESOURCEFLOW AI</span>
              </div>
              <p className="text-sm text-muted-foreground">
                AI-Powered National Disaster Response & Resource Coordination Platform.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="font-semibold mb-3 text-sm">Platform</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <button onClick={() => navigate('/command-center')} className="text-muted-foreground hover:text-foreground transition">
                    Command Center
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate('/incidents')} className="text-muted-foreground hover:text-foreground transition">
                    Incidents
                  </button>
                </li>
                <li>
                  <button onClick={() => setActiveModal('demo')} className="text-muted-foreground hover:text-foreground transition">
                    Demo Access
                  </button>
                </li>
              </ul>
            </div>

            {/* Legal & Security */}
            <div>
              <h3 className="font-semibold mb-3 text-sm">Legal & Security</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <button onClick={() => setActiveModal('privacy')} className="text-muted-foreground hover:text-foreground transition">
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button onClick={() => setActiveModal('terms')} className="text-muted-foreground hover:text-foreground transition">
                    Terms & Conditions
                  </button>
                </li>
                <li>
                  <button onClick={() => setActiveModal('security')} className="text-muted-foreground hover:text-foreground transition">
                    Data & Security
                  </button>
                </li>
                <li>
                  <button onClick={() => setActiveModal('disclaimer')} className="text-muted-foreground hover:text-foreground transition">
                    Emergency Disclaimer
                  </button>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h3 className="font-semibold mb-3 text-sm">Contact</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span>support@resourceflow.ai</span>
                </li>
                <li className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>For emergencies, call 112</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} RESOURCEFLOW AI. All rights reserved.
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <button onClick={() => setActiveModal('privacy')} className="hover:text-foreground transition">
                Privacy
              </button>
              <button onClick={() => setActiveModal('terms')} className="hover:text-foreground transition">
                Terms
              </button>
              <button onClick={() => setActiveModal('disclaimer')} className="hover:text-foreground transition">
                Disclaimer
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <PrivacyModal open={activeModal === 'privacy'} onClose={() => setActiveModal(null)} />
      <TermsModal open={activeModal === 'terms'} onClose={() => setActiveModal(null)} />
      <SecurityModal open={activeModal === 'security'} onClose={() => setActiveModal(null)} />
      <DisclaimerModal open={activeModal === 'disclaimer'} onClose={() => setActiveModal(null)} />
      <DemoAccessModal open={activeModal === 'demo'} onClose={() => setActiveModal(null)} />
    </>
  )
}
