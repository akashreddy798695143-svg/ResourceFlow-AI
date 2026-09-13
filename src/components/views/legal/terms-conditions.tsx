'use client'

import {
  FileText, AlertTriangle, Shield, Users, Ban, Phone, RadioTower, Bot, MapPin, Navigation,
  Image as ImageIcon, MessageCircle, Package, Server, Globe, Lock, Scale, RefreshCw, Mail,
} from 'lucide-react'
import { LegalShell, LegalSectionList } from './legal-shell'

export function TermsConditionsPage() {
  const sections = [
    {
      icon: FileText,
      title: '1. Acceptance of Terms',
      body: (
        <p>These Terms &amp; Conditions govern your use of the ResourceFlow AI platform. By accessing or using the platform, you agree to be bound by these terms. Please read them carefully. If you do not agree, do not use the platform.</p>
      ),
    },
    {
      icon: RadioTower,
      title: '2. Platform Purpose',
      body: (
        <p>ResourceFlow AI is a disaster-management coordination platform intended to support incident reporting, AI-assisted analysis, resource coordination and emergency communication. It supplements — and does not replace — official emergency services, disaster-management authorities, law enforcement or medical services. The platform is a decision-support prototype and its outputs should be validated with authorized personnel.</p>
      ),
    },
    {
      icon: Shield,
      title: '3. Account Responsibilities',
      body: (
        <p>You are responsible for the accuracy of the information you provide when registering, for keeping your credentials confidential, and for activity carried out under your account. Do not share your password, and do not use another person&apos;s account. Register only with your real role; impersonating emergency personnel is strictly prohibited.</p>
      ),
    },
    {
      icon: Users,
      title: '4. Citizen Responsibilities',
      body: (
        <p>Citizens must report incidents truthfully and as accurately as possible, provide only necessary information, use location sharing only when appropriate for a genuine incident, and respect the privacy of other people when submitting photos or details. Do not submit false reports or use platform features to test the system outside the demo/simulation environment.</p>
      ),
    },
    {
      icon: Scale,
      title: '5. Officer Responsibilities',
      body: (
        <p>Officers review, verify and approve incidents and AI recommendations. Officers must exercise professional judgment, approve only assignments they consider appropriate, follow their organization&apos;s procedures, and use authorized access to incident information only for operational coordination.</p>
      ),
    },
    {
      icon: Navigation,
      title: '6. Responder Responsibilities',
      body: (
        <p>Responders must access only assigned incident information, keep resource and status updates accurate and timely, follow official safety procedures during response, and confirm arrival and completion statuses truthfully.</p>
      ),
    },
    {
      icon: Lock,
      title: '7. Admin Responsibilities',
      body: (
        <p>Admins manage users, resources and platform configuration. Admins must use administrative permissions responsibly, keep role assignments accurate, respect user privacy, and monitor the platform according to its administrative purpose.</p>
      ),
    },
    {
      icon: AlertTriangle,
      title: '8. Accurate Incident Reporting',
      body: (
        <p>Emergency information must be accurate. Users must ensure that any incident report, safety check or emergency information they provide is truthful and accurate to the best of their knowledge. Providing false or misleading emergency information may divert critical resources and have serious consequences.</p>
      ),
    },
    {
      icon: Shield,
      title: '9. Responsible Use',
      body: (
        <p>Users must use the platform responsibly and in good faith. ResourceFlow AI is designed to support emergency response and disaster coordination. All users are expected to use the platform only for its intended purposes and to comply with applicable laws.</p>
      ),
    },
    {
      icon: Ban,
      title: '10. Prohibited Misuse',
      body: (
        <p>Prohibited activities include: submitting false incident reports, impersonating emergency personnel, accessing data belonging to other users without authorization, sharing another person&apos;s private information without consent, using the platform to harass or threaten others, interfering with emergency response operations, or using the platform for any unlawful purpose.</p>
      ),
    },
    {
      icon: Bot,
      title: '11. AI Decision-Support Disclaimer',
      body: (
        <p>AI-generated outputs (classification, risk and severity scores, impact estimates, resource and priority recommendations, summaries) are decision-support information and may require human verification. AI outputs may be incomplete or incorrect and are not a guarantee of any particular outcome. Important emergency decisions follow the platform&apos;s authorized human review and approval workflow where applicable.</p>
      ),
    },
    {
      icon: MapPin,
      title: '12. Location Services',
      body: (
        <p>The platform may use location information for emergency coordination, incident reporting, routing and responder tracking, subject to appropriate user permission. Location information should not be considered perfectly accurate: network availability, device capabilities and GPS limitations may affect accuracy. You can revoke device location permission, although some location-dependent emergency features may stop working.</p>
      ),
    },
    {
      icon: Navigation,
      title: '13. Real-Time Tracking',
      body: (
        <p>Where live tracking is supported, live location sharing is active only when explicitly enabled by the user, and the platform is designed so users can understand when it is active. Live tracking is provided to support coordination and is not presented as a guaranteed or perfectly accurate service.</p>
      ),
    },
    {
      icon: ImageIcon,
      title: '14. Uploaded Content',
      body: (
        <p>Where supported, users may upload photos and media with an incident report. Uploaded content is associated with the incident, may be accessed by authorized personnel for incident assessment, and must not contain unnecessary personal information or content unrelated to the incident. File type validation and size restrictions may apply. Photos may contain metadata such as location depending on the device.</p>
      ),
    },
    {
      icon: Phone,
      title: '15. Emergency Communication',
      body: (
        <p>In any real emergency, immediately call your local emergency number: 911 (North America), 112 (Europe/Asia/Africa), 999 (UK), 111 (Australia), 110 (Japan), 108 (India). Emergency Chat and platform alerts supplement — but do not replace — official emergency services.</p>
      ),
    },
    {
      icon: Package,
      title: '16. Resource Coordination',
      body: (
        <p>The platform processes operational information such as resources, status, assignments, dispatch, destinations, responder status, arrival confirmation and completion status to coordinate disaster response. Resource coordination depends on accurate inputs and live system availability, and may be affected by network or infrastructure conditions.</p>
      ),
    },
    {
      icon: Server,
      title: '17. Service Availability',
      body: (
        <p>The platform is provided on an availability-as-is basis. Service may be interrupted or degraded by network conditions, system load, maintenance or infrastructure failures. Features may change, and some capabilities are provided where supported by the user&apos;s device.</p>
      ),
    },
    {
      icon: Globe,
      title: '18. Third-Party Services',
      body: (
        <p>The platform may rely on third-party services (AI analysis, mapping, weather data, messaging providers). Their availability and behavior are outside the platform&apos;s control, and their processing of data is governed by their own policies.</p>
      ),
    },
    {
      icon: FileText,
      title: '19. Intellectual Property',
      body: (
        <p>The ResourceFlow AI platform, its interface, workflow design and associated content are the work of its authors. Users retain responsibility for the content they submit, and grant the platform the limited ability to process that content to provide platform functionality.</p>
      ),
    },
    {
      icon: Scale,
      title: '20. Limitation of Liability',
      body: (
        <p>ResourceFlow AI is provided &quot;as is&quot; without warranties of any kind. The platform is a decision-support prototype and its outputs should be validated with authorized personnel. To the maximum extent permitted by law, the authors are not liable for damages arising from the use of, or reliance on, the platform during emergency situations.</p>
      ),
    },
    {
      icon: RefreshCw,
      title: '21. Changes to Terms',
      body: (
        <p>We may update these Terms from time to time. The current version is always available on this page. Continued use of ResourceFlow AI after changes constitutes acceptance of the updated terms.</p>
      ),
    },
    {
      icon: Mail,
      title: '22. Contact Information',
      body: (
        <p>Questions about these Terms can be directed to <a href="mailto:akashreddy798695143@gmail.com" className="text-primary hover:underline">akashreddy798695143@gmail.com</a> or <a href="tel:8790401013" className="text-primary hover:underline">8790401013</a>.</p>
      ),
    },
  ]

  return (
    <LegalShell
      title="Terms & Conditions"
      subtitle="Last updated: 2026 · ResourceFlow AI — disaster-response coordination prototype"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          These Terms &amp; Conditions govern your use of the ResourceFlow AI platform — a disaster-response coordination prototype. By accessing or using the platform, you agree to be bound by these terms.
        </p>
        <LegalSectionList sections={sections} />
      </div>
    </LegalShell>
  )
}