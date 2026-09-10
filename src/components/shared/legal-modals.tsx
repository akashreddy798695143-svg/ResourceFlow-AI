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
        <p className={P}>ResourceFlow AI is committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and the measures we take to safeguard your data.</p>
        <h3 className={H}>Information Collection</h3>
        <p className={P}>User information is collected only for emergency response and platform functionality. We collect information you provide directly, such as name, email, phone, incident descriptions, photos, and safety-check messages.</p>
        <h3 className={H}>Location Information</h3>
        <p className={P}>Location information is used for emergency coordination and safety features. Location is collected only when you actively report an incident, send SOS, or check in. Never used for commercial tracking.</p>
        <h3 className={H}>Shared Photos and Incident Information</h3>
        <p className={P}>Shared photos and incident information are accessible only to authorized users. Photos are processed by AI for incident analysis and only visible to authorized officers and responders.</p>
        <h3 className={H}>Personal Information Protection</h3>
        <p className={P}>Personal information should not be exposed to unauthorized users. Access is role-based and strictly controlled. Data scoped by ownership and need-to-know basis.</p>
        <h3 className={H}>Emergency Location Sharing</h3>
        <p className={P}>Emergency location sharing should be handled securely. Users should be informed when location sharing is active. Location data shared during emergencies is accessible only to authorized emergency personnel.</p>
        <h3 className={H}>Data Security</h3>
        <p className={P}>Data should be protected using appropriate security controls. We employ encryption in transit (HTTPS/TLS), secure password hashing (Argon2id), server-side RBAC, and secure credential storage.</p>
        <h3 className={H}>User Rights</h3>
        <p className={P}>You may access, correct, or delete your data. Contact akashreddy798695143@gmail.com.</p>
        <h3 className={H}>Emergency Limitations</h3>
        <p className={P}>ResourceFlow AI is a decision-support tool and does NOT replace official emergency services. In any real emergency, immediately call your local emergency number: 911 (North America), 112 (Europe/Asia/Africa), 999 (UK), 111 (Australia), 110 (Japan), 108 (India).</p>
      </div>
    </ModalShell>
  )
}
export function TermsModal({ open, onClose }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Terms & Conditions">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <p className={P}>These Terms & Conditions govern your use of the ResourceFlow AI platform. By accessing or using our platform, you agree to be bound by these terms.</p>
        <h3 className={H}>Responsible Use</h3>
        <p className={P}>Users must use the platform responsibly. ResourceFlow AI is designed to support emergency response and disaster coordination. All users are expected to act in good faith and use the platform only for its intended purposes.</p>
        <h3 className={H}>Accuracy of Emergency Information</h3>
        <p className={P}>Emergency information should be accurate. Users must ensure that any incident reports, safety checks, or emergency information they provide is truthful and accurate to the best of their knowledge. Providing false or misleading emergency information may have serious consequences.</p>
        <h3 className={H}>Platform Purpose</h3>
        <p className={P}>The platform is intended to support disaster response and does not replace official emergency authorities. ResourceFlow AI provides AI-assisted risk assessment and decision support. It is not a substitute for professional emergency services, law enforcement, or disaster management authorities.</p>
        <h3 className={H}>Prohibited Uses</h3>
        <p className={P}>Users must not misuse the communication, location or reporting features. Prohibited activities include: submitting false incident reports, impersonating emergency personnel, using the platform to harass or threaten others, interfering with emergency response operations, or using the platform for any unlawful purpose.</p>
        <h3 className={H}>Privacy and Data Protection</h3>
        <p className={P}>Unauthorized access or sharing of private information is prohibited. Users must not attempt to access data belonging to other users without authorization. Sharing another person&apos;s private information, location data, or incident details without their explicit consent is strictly forbidden.</p>
        <h3 className={H}>Emergency Services</h3>
        <p className={P}>In any real emergency, immediately call your local emergency number: 911 (North America), 112 (Europe/Asia/Africa), 999 (UK), 111 (Australia), 110 (Japan), 108 (India). ResourceFlow AI supplements but does not replace these services.</p>
        <h3 className={H}>Limitation of Liability</h3>
        <p className={P}>ResourceFlow AI is provided &quot;as is&quot; without warranties of any kind. The platform is a decision-support tool and its outputs should be validated with authorized personnel.</p>
        <h3 className={H}>Changes to Terms</h3>
        <p className={P}>We may update these Terms from time to time. Material changes posted on our platform. Continued use constitutes acceptance.</p>
        <h3 className={H}>Contact</h3>
        <p className={P}>Questions about these Terms? Contact akashreddy798695143@gmail.com.</p>
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
        <p className={P}>ResourceFlow AI is designed to support emergency coordination, information sharing and disaster-response decision making. It does not replace official emergency services or authorities.</p>
        <p className={P}>ResourceFlow AI provides AI-assisted risk assessment and decision support. Risk forecasts are not guaranteed predictions.</p>
        <p className={P}>AI recommendations do not replace authorized emergency personnel or official emergency services.</p>
        <p className={P}>In any real emergency, immediately call your local emergency number: 911 (North America), 112 (Europe/Asia/Africa), 999 (UK), 111 (Australia), 110 (Japan), 108 (India).</p>
        <p className={P}>Risk forecasts are heuristic-based with uncertainty indicators. Validate with authorized personnel.</p>
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
