'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

function ModalShell({ open, onClose, title, children }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Legal info</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(80vh-100px)] pr-4">{children}</ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

const H = "text-sm font-semibold text-foreground mt-4 mb-2"
const P = "text-sm text-muted-foreground leading-relaxed mb-2"
export function PrivacyModal({ open, onClose }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Privacy Policy">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <p className={P}>ResourceFlow AI is committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and your rights.</p>
        <h3 className={H}>Information We Collect</h3>
        <p className={P}>We collect info you provide: name, email, phone, location, incident descriptions, photos, safety-check messages. We also auto-collect device info (IP, browser, OS).</p>
        <h3 className={H}>Location Data</h3>
        <p className={P}>Location is collected only when you actively report an incident, send SOS, or check in. Essential for routing resources. Never used for commercial tracking.</p>
        <h3 className={H}>SOS & Incident Information</h3>
        <p className={P}>SOS/incident data is shared with authorized emergency personnel. Retained for post-incident analysis and audit.</p>
        <h3 className={H}>Photos & Evidence</h3>
        <p className={P}>Photos are processed by AI for incident analysis and only visible to authorized officers/responders.</p>
        <h3 className={H}>Safety Contacts</h3>
        <p className={P}>Safety contacts stored securely, never shared with other citizens. Notifications go only to verified contacts.</p>
        <h3 className={H}>Incident Data</h3>
        <p className={P}>Incidents stored to coordinate response. After resolution, data used in aggregate anonymized form for analytics.</p>
        <h3 className={H}>AI Processing</h3>
        <p className={P}>Input processed by AI (Gemini) server-side. API keys never exposed. Outputs are decision-support, always reviewed by officers.</p>
        <h3 className={H}>Notification & Email Processing</h3>
        <p className={P}>Notifications via in-app, email, SMS, WhatsApp. Configure preferences in Settings.</p>
        <h3 className={H}>Authorized Access</h3>
        <p className={P}>Access is role-based. Data scoped by ownership. Never sold or rented.</p>
        <h3 className={H}>Data Security</h3>
        <p className={P}>Argon2id hashing, JWT sessions, HTTPS, server-side RBAC. Credentials in env vars, never exposed.</p>
        <h3 className={H}>Data Retention</h3>
        <p className={P}>Data retained as needed. Deletion requests accepted subject to emergency retention.</p>
        <h3 className={H}>User Rights</h3>
        <p className={P}>You may access, correct, or delete your data. Contact support@resourceflow.ai.</p>
        <h3 className={H}>Third-Party Services</h3>
        <p className={P}>We use SMTP, Twilio, OpenStreetMap/Esri, Google Gemini. Each under its own privacy policy.</p>
        <h3 className={H}>Emergency Limitations</h3>
        <p className={P}>ResourceFlow AI is a decision-support tool and does NOT replace official emergency services. Call your local emergency number.</p>
        <h3 className={H}>Policy Updates</h3>
        <p className={P}>We may update this policy. Changes posted on this page.</p>
        <h3 className={H}>Contact</h3>
        <p className={P}>Questions? Contact support@resourceflow.ai.</p>
      </div>
    </ModalShell>
  )
}
export function TermsModal({ open, onClose }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Terms & Conditions">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <p className={P}>These Terms govern your use of the ResourceFlow AI platform.</p>
        <h3 className={H}>Purpose</h3>
        <p className={P}>ResourceFlow AI is an AI-powered disaster risk forecasting, early-warning, and emergency coordination platform. It converts citizen reports into structured data, calculates risk scores, forecasts resource demand, recommends allocation, and coordinates response with human officer oversight.</p>
        <h3 className={H}>Responsible Reporting</h3>
        <p className={P}>Provide accurate and truthful information. Knowingly false reports or prank SOS calls may result in account suspension. Inaccurate reports can endanger lives.</p>
        <h3 className={H}>AI Limitations</h3>
        <p className={P}>AI outputs are estimates and decision-support tools, NOT guaranteed predictions. All AI recommendations are subject to human review by authorized officers.</p>
        <p className={P}>Risk forecasts are not guaranteed predictions. AI risk models are heuristic-based with uncertainty indicators. They support preparedness planning, not professional meteorological, geological, or emergency management services.</p>
        <h3 className={H}>Risk Assessment Limitations</h3>
        <p className={P}>Risk scores are computed from available data sources, which may include simulated/demo data when external feeds are unavailable. All simulated data is clearly labelled.</p>
        <h3 className={H}>Emergency Limitations</h3>
        <p className={P}>AI recommendations do not replace authorized emergency personnel or official emergency services. In any real emergency, always contact your local emergency services directly. We are not responsible for any failure to provide timely emergency response.</p>
        <h3 className={H}>Prohibited Misuse</h3>
        <p className={P}>Do not: (a) impair emergency response; (b) manipulate AI systems or risk scores; (c) access data without authorization; (d) use for unrelated commercial purposes; (e) reverse-engineer or scrape the platform.</p>
        <h3 className={H}>Intellectual Property</h3>
        <p className={P}>The platform, including logos, designs, text, graphics, and software, is protected by copyright, trademark, and other IP laws.</p>
        <h3 className={H}>Emergency Limitations</h3>
        <p className={P}>AI recommendations do not replace authorized emergency personnel or official emergency services. In any real emergency, always contact your local emergency services directly. We are not responsible for any failure to provide timely emergency response.</p>
        <h3 className={H}>Prohibited Misuse</h3>
        <p className={P}>Do not: (a) impair emergency response; (b) manipulate AI systems or risk scores; (c) access data without authorization; (d) use for unrelated commercial purposes; (e) reverse-engineer or scrape the platform.</p>
        <h3 className={H}>Intellectual Property</h3>
        <p className={P}>The platform, including logos, designs, text, graphics, and software, is protected by copyright, trademark, and other IP laws.</p>
        <h3 className={H}>Limitation of Liability</h3>
        <p className={P}>To the fullest extent permitted by law, ResourceFlow AI shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, profits, or business.</p>
        <h3 className={H}>Governing Law</h3>
        <p className={P}>Governed by the laws of the jurisdiction in which ResourceFlow AI operates.</p>
        <h3 className={H}>Changes to Terms</h3>
        <p className={P}>We may update these Terms from time to time. Material changes posted on our platform. Continued use constitutes acceptance.</p>
        <h3 className={H}>Contact</h3>
        <p className={P}>Questions about these Terms? Contact support@resourceflow.ai.</p>
      </div>
    </ModalShell>
  )
}
export function SecurityModal({ open, onClose }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Data & Security">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <h3 className={H}>Authentication & Authorization</h3>
        <p className={P}>JWT-based session management with Argon2id password hashing. Sessions in HTTP-only, same-site cookies to prevent XSS/CSRF. Every API request verified against the database for current role permissions.</p>
        <h3 className={H}>Data Encryption</h3>
        <p className={P}>All data in transit encrypted via HTTPS/TLS. Passwords hashed with Argon2id. Credentials and API keys stored as environment variables, never exposed to client.</p>
        <h3 className={H}>Access Control</h3>
        <p className={P}>Role-Based Access Control enforced server-side on every endpoint. Data scoped by ownership.</p>
        <h3 className={H}>Audit Trail</h3>
        <p className={P}>Every meaningful action is recorded in an immutable audit log with timestamp, user ID, role, action type, and before/after state.</p>
        <h3 className={H}>Input Validation</h3>
        <p className={P}>All inputs validated with Zod schemas. File uploads restricted to image types with size limits.</p>
      </div>
    </ModalShell>
  )
}
export function DisclaimerModal({ open, onClose }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Emergency Disclaimer">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <h3 className={H}>Important - Not a Substitute for Emergency Services</h3>
        <p className={P}>ResourceFlow AI provides AI-assisted risk assessment and decision support. Risk forecasts are not guaranteed predictions.</p>
        <p className={P}>AI recommendations do not replace authorized emergency personnel or official emergency services.</p>
        <p className={P}>In any real emergency, immediately call your local emergency number: 911 (North America), 112 (Europe/Asia/Africa), 999 (UK), 111 (Australia), 110 (Japan), 108 (India).</p>
        <p className={P}>Risk forecasts are heuristic-based with uncertainty indicators. Validate with authorized personnel. Simulated/demo data is clearly labelled.</p>
        <p className={P}>By using ResourceFlow AI, you acknowledge these limitations. The platform is provided "as is" without warranties.</p>
      </div>
    </ModalShell>
  )
}
export function DemoAccessModal({ open, onClose }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Demo Access">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <h3 className={H}>Demo Mode</h3>
        <p className={P}>ResourceFlow AI includes a comprehensive demo mode with realistic but simulated scenarios. All demo data is clearly labelled as Demo / Simulated Data.</p>
        <p className={P}>Available demo scenarios: Nepal Flood, Renigunta Earthquake, Cyclone, Landslide.</p>
        <p className={P}>Demo credentials: officer@resourceflow.ai / demo1234, citizen@resourceflow.ai / demo1234, responder@resourceflow.ai / demo1234, admin@resourceflow.ai / demo1234.</p>
        <p className={P}>Warning: Simulated data is not real emergency data. Do not rely on demo data for actual emergency decision-making.</p>
      </div>
    </ModalShell>
  )
}
