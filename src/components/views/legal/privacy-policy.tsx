'use client'

import {
  FileText, Shield, Users, MapPin, Lock, Eye, Image as ImageIcon, Mic, MessageCircle,
  Bot, Package, Share2, Clock, Scale, ToggleLeft, Cookie, Globe, AlertTriangle,
  Baby, RefreshCw, Mail, Navigation, CheckCircle2,
} from 'lucide-react'
import { LegalShell, LegalSectionList } from './legal-shell'

export function PrivacyPolicyPage() {
  const sections = [
    {
      icon: FileText,
      title: '1. Introduction',
      body: (
        <>
          <p>This Privacy Policy explains how ResourceFlow AI — a disaster-response coordination platform — handles information when you use the platform. It covers incident reporting, AI-assisted analysis, resource coordination, location services, emergency chat and related features.</p>
          <p>By using ResourceFlow AI, you agree to the practices described in this policy.</p>
        </>
      ),
    },
    {
      icon: Eye,
      title: '2. Information We Collect',
      body: (
        <>
          <p>We collect information needed to operate emergency coordination features, including:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Account and registration information (name, email, phone, role)</li>
            <li>Incident reports you submit (descriptions, category, severity context)</li>
            <li>Location information where you grant permission</li>
            <li>Photos and media you attach to an incident where supported</li>
            <li>Voice input used for hands-free incident reporting</li>
            <li>Chat messages sent through Emergency Chat</li>
            <li>Operational data such as assignments, dispatch and status updates</li>
          </ul>
        </>
      ),
    },
    {
      icon: Users,
      title: '3. Account & Registration Information',
      body: (
        <p>When you register an account, we collect your name, email address, phone number and assigned role (CITIZEN, RESPONDER, DISASTER_OFFICER or ADMIN). Your role determines which information and features you can access. Passwords are stored only as secure hashes and are never visible to platform operators or other users.</p>
      ),
    },
    {
      icon: AlertTriangle,
      title: '4. Citizen Incident Information',
      body: (
        <p>Incident reports you submit — including descriptions, category, people affected, road blockage details and attached media — are stored with the incident record. This information is used for triage, risk assessment, clustering of related reports, resource recommendation and responder coordination. It is visible only to you and to authorized personnel involved in the response.</p>
      ),
    },
    {
      icon: Users,
      title: '5. Name, Email & Phone Information',
      body: (
        <p>During an incident, authorized emergency personnel may need access to relevant citizen contact information (such as name, email or phone number) for coordination. This access is role-based: it is limited to authorized officers and responders working on the incident, and it is not exposed publicly. We do not sell or rent your contact information to third parties.</p>
      ),
    },
    {
      icon: MapPin,
      title: '6. GPS & Location Information',
      body: (
        <>
          <p>ResourceFlow AI may use location information for emergency coordination, incident reporting, routing and responder tracking.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Location access requires appropriate permission from your device and browser.</li>
            <li>Real-time live location sharing is only active when you explicitly enable it.</li>
            <li>The platform is designed so you can understand when live location sharing is active.</li>
            <li>Location information is only exposed to authorized roles according to the platform&apos;s access-control system.</li>
            <li>Location information should not be considered perfectly accurate.</li>
            <li>Network availability, device capabilities and GPS limitations may affect location accuracy.</li>
            <li>You can revoke device location permission at any time, although some location-dependent emergency features may stop working.</li>
          </ul>
        </>
      ),
    },
    {
      icon: Navigation,
      title: '7. Real-Time Location Sharing',
      body: (
        <p>Where live location sharing is supported (for example, volunteer or responder tracking), the platform transmits location updates only while sharing is enabled by the user. Sharing is intended to help coordinators understand responder positions and allocate resources. When you stop sharing or revoke permission, live location updates end. We do not present live tracking as a guaranteed or perfectly accurate service.</p>
      ),
    },
    {
      icon: ImageIcon,
      title: '8. Photos & Uploaded Media',
      body: (
        <>
          <p>Citizens may submit photos or other media as part of an incident report where the platform supports it.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Uploaded media is associated with the relevant incident record.</li>
            <li>Authorized personnel may access it for incident assessment.</li>
            <li>You should avoid uploading unnecessary personal information in photos.</li>
            <li>File type validation and size restrictions may apply.</li>
            <li>Photos may contain metadata such as location, depending on your device settings.</li>
          </ul>
        </>
      ),
    },
    {
      icon: Mic,
      title: '9. Voice Input & Transcription',
      body: (
        <p>Where voice input is supported for hands-free incident reporting, your audio may be transcribed into text so that it can be used to create or enrich an incident report. Transcribed text is treated as part of the incident information described in this policy. Avoid including unnecessary personal details in voice reports.</p>
      ),
    },
    {
      icon: MessageCircle,
      title: '10. Emergency Chat Information',
      body: (
        <p>Emergency Chat supports communication between citizens and authorized emergency-response personnel. Messages may be stored for operational coordination. Access to conversations is controlled through user roles and permissions, and chat information is not publicly displayed. Please avoid sharing passwords, financial details or other unrelated sensitive information through chat. Emergency Chat does not replace official emergency services.</p>
      ),
    },
    {
      icon: Bot,
      title: '11. AI Analysis & Recommendations',
      body: (
        <p>Incident information you provide — including text, structured details and media where supported — may be processed by AI services to assist with classification, risk scoring, impact estimation and resource recommendations. AI-generated outputs are decision-support information and may require human verification. They are reviewed by authorized officers through the platform&apos;s approval workflow before high-impact actions are executed. See the &quot;AI &amp; Automated Analysis&quot; section below for details.</p>
      ),
    },
    {
      icon: Package,
      title: '12. Resource & Logistics Information',
      body: (
        <p>The platform processes operational information such as available resources, resource status, assignments, dispatch information, destinations, responder status, arrival confirmations and completion status. This information is used to coordinate disaster response and to keep an auditable record of what was assigned, dispatched and resolved.</p>
      ),
    },
    {
      icon: CheckCircle2,
      title: '13. How We Use Information',
      body: (
        <>
          <p>We use collected information to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Report, triage and classify incidents</li>
            <li>Assess risk, severity and impact to support prioritization</li>
            <li>Cluster related reports and reduce duplication</li>
            <li>Recommend and coordinate resources and responder assignments</li>
            <li>Provide live tracking, status updates and event timelines</li>
            <li>Enable communication between citizens and emergency personnel</li>
            <li>Maintain audit logs and system security</li>
            <li>Improve platform reliability and functionality</li>
          </ul>
        </>
      ),
    },
    {
      icon: Lock,
      title: '14. Role-Based Access',
      body: (
        <>
          <p>Access to information is controlled by role-based access control enforced on the server side:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-foreground">CITIZEN</strong> — can view their own incident information.</li>
            <li><strong className="text-foreground">OFFICER</strong> — can review and approve incidents and access information required for operational coordination.</li>
            <li><strong className="text-foreground">RESPONDER</strong> — can access assigned incident information needed to provide response.</li>
            <li><strong className="text-foreground">ADMIN</strong> — can manage and monitor the platform according to administrative permissions.</li>
          </ul>
          <p>Citizen information is not exposed publicly, and every protected request is re-verified against the backend.</p>
        </>
      ),
    },
    {
      icon: Share2,
      title: '15. Information Sharing',
      body: (
        <p>Information is shared within the platform only on a need-to-know basis with authorized roles involved in an incident response. We do not sell personal information. Information may be processed by third-party services used by the platform (such as AI analysis, mapping or messaging providers) strictly to deliver platform functionality. Information may also be disclosed if required by applicable law.</p>
      ),
    },
    {
      icon: Shield,
      title: '16. Data Security',
      body: (
        <>
          <p>We take reasonable measures to protect information, but no internet system can guarantee absolute security. The platform applies technical and access-control measures appropriate to its purpose, including:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Authentication for all protected features</li>
            <li>Role-based access control enforced server-side</li>
            <li>Protected API routes with request verification</li>
            <li>Database access controls</li>
            <li>Input validation on submitted data and uploads</li>
            <li>Secure communication where configured (e.g. HTTPS/TLS)</li>
            <li>Audit and event logging where implemented</li>
          </ul>
        </>
      ),
    },
    {
      icon: Clock,
      title: '17. Data Retention',
      body: (
        <p>Information may be retained for operational coordination, audit, security, incident history and system functionality for as long as reasonably necessary, or as required by applicable requirements. Incident records and audit logs are part of the platform&apos;s operational history. When information is no longer needed, it may be deleted or anonymized.</p>
      ),
    },
    {
      icon: Scale,
      title: '18. User Rights & Choices',
      body: (
        <>
          <p>Depending on the platform&apos;s capabilities and your role, you may:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Access the information associated with your account and incidents</li>
            <li>Correct inaccurate information where editing is supported</li>
            <li>Request account or data deletion where applicable</li>
            <li>Manage device location permissions for the platform</li>
            <li>Manage notification permissions on your device</li>
            <li>Ask questions about how your data is handled</li>
          </ul>
          <p>To exercise these rights or ask questions, contact us using the details in the &quot;Contact Us&quot; section.</p>
        </>
      ),
    },
    {
      icon: ToggleLeft,
      title: '19. Location Permission Controls',
      body: (
        <p>Your browser and operating system control location permissions. You can grant or revoke location access for the platform at any time through your device settings. Revoking permission stops new location data from being shared, although some location-dependent emergency features — such as nearby safe-place or emergency-service detection, location-based reporting and responder tracking — may stop working or become less useful.</p>
      ),
    },
    {
      icon: Cookie,
      title: '20. Cookies & Local Storage',
      body: (
        <p>The platform may use browser storage (such as local storage or session storage) to keep you signed in, remember preferences such as theme selection, and support real-time functionality. These are used for platform operation, not for advertising or third-party tracking.</p>
      ),
    },
    {
      icon: Globe,
      title: '21. Third-Party Services',
      body: (
        <p>ResourceFlow AI may rely on third-party services to deliver functionality — for example AI analysis providers, map and geocoding providers, weather data providers and messaging services for dispatch alerts. These services process information only as needed to provide their function. Their use of data is governed by their own policies, and the platform is not responsible for third-party service availability or behavior.</p>
      ),
    },
    {
      icon: AlertTriangle,
      title: '22. Emergency Situations',
      body: (
        <p>During emergency operations, availability of features and data may be affected by network conditions, system load or infrastructure failures. ResourceFlow AI is a coordination and decision-support tool: it does not replace official emergency services. In any real emergency, immediately call your local emergency number.</p>
      ),
    },
    {
      icon: Baby,
      title: "23. Children's Privacy",
      body: (
        <p>The platform is not directed at children, and we do not knowingly collect information from children through the platform. If you believe a child has provided personal information through the platform, please contact us so we can review and remove it where appropriate.</p>
      ),
    },
    {
      icon: RefreshCw,
      title: '24. Changes to Privacy Policy',
      body: (
        <p>We may update this Privacy Policy from time to time to reflect changes in the platform or its practices. The current version is always available on this page. Continued use of ResourceFlow AI after an update constitutes acceptance of the revised policy.</p>
      ),
    },
    {
      icon: Mail,
      title: '25. Contact Us',
      body: (
        <p>If you have questions, requests or concerns about this Privacy Policy or how your information is handled, contact us at <a href="mailto:akashreddy798695143@gmail.com" className="text-primary hover:underline">akashreddy798695143@gmail.com</a> or call <a href="tel:8790401013" className="text-primary hover:underline">8790401013</a>.</p>
      ),
    },
    {
      icon: Bot,
      title: 'AI & Automated Analysis',
      body: (
        <>
          <p>ResourceFlow AI can assist emergency personnel with:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Disaster and incident classification</li>
            <li>Risk and severity analysis</li>
            <li>Impact estimation</li>
            <li>Resource recommendations</li>
            <li>Priority recommendations</li>
            <li>Operational summaries</li>
            <li>Response decision support</li>
          </ul>
          <p>AI-generated outputs are decision-support information and may require human verification. AI outputs may be incomplete or incorrect, and they are not a guarantee of any particular outcome. Important emergency decisions follow the platform&apos;s authorized human review and approval workflow where applicable.</p>
        </>
      ),
    },
  ]

  return (
    <LegalShell
      title="Privacy Policy"
      subtitle="Last updated: 2026 · ResourceFlow AI — disaster-response coordination platform"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          ResourceFlow AI is committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and the measures we take to safeguard your data.
        </p>
        <LegalSectionList sections={sections} />
      </div>
    </LegalShell>
  )
}