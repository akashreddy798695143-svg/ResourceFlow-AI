'use client'

import { useRouter } from '@/lib/use-router'
import { ArrowLeft, RadioTower, Brain, MapPin, Users, Shield, Activity, MessageCircle, Heart, Search } from 'lucide-react'
import { Footer } from '@/components/shared/footer'

export function AboutPage() {
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
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <RadioTower className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold">About ResourceFlow AI</h1>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <p>ResourceFlow AI is an AI-powered disaster coordination and emergency response platform designed to help communities, emergency responders, and authorities respond to disasters more effectively.</p>

          <p>Our platform integrates advanced artificial intelligence with real-time data to provide incident reporting, AI risk analysis, resource coordination, live location tracking, emergency communication, and citizen safety features — all in a single unified platform.</p>

          <div className="rounded-lg border border-border bg-card/40 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Platform Capabilities</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-2">
                <Brain className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-foreground">AI Disaster Analysis</p>
                  <p className="text-xs">AI-powered risk assessment and incident analysis for informed decision-making.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Activity className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Real-Time Incident Tracking</p>
                  <p className="text-xs">Track incidents as they unfold with live status updates and timeline.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Resource & Logistics Tracking</p>
                  <p className="text-xs">Coordinate and track emergency resources and logistics in real time.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Citizen Location Sharing</p>
                  <p className="text-xs">Secure location sharing for citizen safety and emergency coordination.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Volunteer Coordination</p>
                  <p className="text-xs">Register, manage, and coordinate volunteer responders.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MessageCircle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Emergency Chat</p>
                  <p className="text-xs">Real-time communication between citizens, responders, and officers.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Safe Place Detection</p>
                  <p className="text-xs">Identify and locate safe shelters and evacuation points.</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Search className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Emergency Service Detection</p>
                  <p className="text-xs">Find nearby hospitals and emergency services when needed.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              Our Mission
            </h2>
            <p>To save lives and reduce the impact of disasters by providing intelligent, coordinated, and accessible emergency response tools. ResourceFlow AI bridges the gap between citizens, volunteers, and emergency authorities — enabling faster, smarter, and more effective disaster response.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}