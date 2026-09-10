'use client'

import { useRouter } from '@/lib/use-router'
import { RadioTower, AlertTriangle, Mail, Phone, Shield, Activity, Brain, MapPin, Users, MessageCircle, Heart, Search } from 'lucide-react'

export function Footer() {
  const { navigate } = useRouter()

  return (
    <footer className="border-t border-border bg-card/30 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-8">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <RadioTower className="h-4 w-4" />
              </div>
              <span className="font-bold tracking-tight">RESOURCEFLOW AI</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              AI-powered disaster coordination and emergency response platform. Incident reporting, AI risk analysis, resource coordination, live location tracking, emergency communication and citizen safety.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><button onClick={() => navigate('/about')} className="text-muted-foreground hover:text-foreground transition">Home</button></li>
              <li><button onClick={() => navigate('/about')} className="text-muted-foreground hover:text-foreground transition">About</button></li>
              <li><button onClick={() => navigate('/command-center')} className="text-muted-foreground hover:text-foreground transition">Emergency Response</button></li>
              <li><button onClick={() => navigate('/report-incident')} className="text-muted-foreground hover:text-foreground transition">Report Incident</button></li>
              <li><button onClick={() => navigate('/safety-center')} className="text-muted-foreground hover:text-foreground transition">Safety Center</button></li>
              <li><button onClick={() => navigate('/resources')} className="text-muted-foreground hover:text-foreground transition">Resources</button></li>
              <li><button onClick={() => navigate('/contact')} className="text-muted-foreground hover:text-foreground transition">Contact</button></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm">Emergency Services</h3>
            <ul className="space-y-2 text-sm">
              <li><button onClick={() => navigate('/report-incident')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-primary" />Report Emergency</button></li>
              <li><button onClick={() => navigate('/contact')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-primary" />Emergency Contacts</button></li>
              <li><button onClick={() => navigate('/safety-center')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><Heart className="h-3.5 w-3.5 text-primary" />Nearest Hospitals</button></li>
              <li><button onClick={() => navigate('/safety-center')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-primary" />Nearest Safe Places</button></li>
              <li><button onClick={() => navigate('/command-center')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-primary" />Disaster Alerts</button></li>
              <li><button onClick={() => navigate('/safety-center')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><Search className="h-3.5 w-3.5 text-primary" />Safety Information</button></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm">Platform Features</h3>
            <ul className="space-y-2 text-sm">
              <li><button onClick={() => navigate('/ai-center')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><Brain className="h-3.5 w-3.5 text-primary" />AI Disaster Analysis</button></li>
              <li><button onClick={() => navigate('/incidents')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-primary" />Real-Time Incident Tracking</button></li>
              <li><button onClick={() => navigate('/resources')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary" />Resource & Logistics Tracking</button></li>
              <li><button onClick={() => navigate('/citizen-intel')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><Users className="h-3.5 w-3.5 text-primary" />Citizen Location Sharing</button></li>
              <li><button onClick={() => navigate('/volunteer-management')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><Users className="h-3.5 w-3.5 text-primary" />Volunteer Coordination</button></li>
              <li><button onClick={() => navigate('/chat')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><MessageCircle className="h-3.5 w-3.5 text-primary" />Emergency Chat</button></li>
              <li><button onClick={() => navigate('/safety-center')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-primary" />Safe Place Detection</button></li>
              <li><button onClick={() => navigate('/safety-center')} className="text-muted-foreground hover:text-foreground transition flex items-center gap-2"><Search className="h-3.5 w-3.5 text-primary" />Emergency Service Detection</button></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-sm">Contact Information</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <a href="mailto:akashreddy798695143@gmail.com" className="hover:text-foreground transition break-all">akashreddy798695143@gmail.com</a>
              </li>
              <li className="flex items-start gap-2">
                <Phone className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <a href="tel:8790401013" className="hover:text-foreground transition">8790401013</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border">
          <p className="text-xs text-muted-foreground text-center max-w-4xl mx-auto leading-relaxed">
            <AlertTriangle className="h-3 w-3 inline mr-1 -mt-0.5 text-primary" />
            ResourceFlow AI is designed to support emergency coordination, information sharing and disaster-response decision making. It does not replace official emergency services or authorities.
          </p>
        </div>

        <div className="mt-6 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">&copy; 2026 ResourceFlow AI. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <button onClick={() => navigate('/privacy')} className="hover:text-foreground transition">Privacy Policy</button>
            <span className="text-border">|</span>
            <button onClick={() => navigate('/terms')} className="hover:text-foreground transition">Terms & Conditions</button>
            <span className="text-border">|</span>
            <button onClick={() => navigate('/safety')} className="hover:text-foreground transition">Safety</button>
            <span className="text-border">|</span>
            <button onClick={() => navigate('/contact')} className="hover:text-foreground transition">Contact</button>
          </div>
        </div>
      </div>
    </footer>
  )
}
