'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

export interface DisasterSlide {
  id: number
  title: string
  url: string
  fallback: string
}

export const DISASTER_HERO_SLIDES: DisasterSlide[] = [
  {
    id: 1,
    title: 'Flood rescue operation',
    url: '/images/disaster_hero.jpg',
    fallback: '/images/disaster_hero.jpg',
  },
  {
    id: 2,
    title: 'Earthquake emergency response',
    url: '/images/earthquake_rescue.jpg',
    fallback: '/images/earthquake_rescue.jpg',
  },
  {
    id: 3,
    title: 'Cyclone rescue operation',
    url: 'https://images.unsplash.com/photo-1527482797697-8795b05a13fe?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/disaster_hero.jpg',
  },
  {
    id: 4,
    title: 'Landslide rescue',
    url: 'https://images.unsplash.com/photo-1516455590571-18256e5bb9ff?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/earthquake_rescue.jpg',
  },
  {
    id: 5,
    title: 'Road blockage caused by disaster',
    url: 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/earthquake_rescue.jpg',
  },
  {
    id: 6,
    title: 'Urban fire emergency response',
    url: 'https://images.unsplash.com/photo-1542385151-efd9000785a0?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/wildfire_response.jpg',
  },
  {
    id: 7,
    title: 'Forest fire response',
    url: '/images/wildfire_response.jpg',
    fallback: '/images/wildfire_response.jpg',
  },
  {
    id: 8,
    title: 'Building collapse rescue',
    url: 'https://images.unsplash.com/photo-1584824486509-112e4181ff6b?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/earthquake_rescue.jpg',
  },
  {
    id: 9,
    title: 'Heavy rainfall emergency',
    url: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/disaster_hero.jpg',
  },
  {
    id: 10,
    title: 'Industrial accident response',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/command_center_login.jpg',
  },
  {
    id: 11,
    title: 'Search and rescue team',
    url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186156f?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/earthquake_rescue.jpg',
  },
  {
    id: 12,
    title: 'Ambulance emergency response',
    url: 'https://images.unsplash.com/photo-1587745416684-47953f16f02f?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/medical_camp.jpg',
  },
  {
    id: 13,
    title: 'Emergency medical camp',
    url: '/images/medical_camp.jpg',
    fallback: '/images/medical_camp.jpg',
  },
  {
    id: 14,
    title: 'Disaster command center',
    url: '/images/command_center_login.jpg',
    fallback: '/images/command_center_login.jpg',
  },
  {
    id: 15,
    title: 'Emergency logistics and resource distribution',
    url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/medical_camp.jpg',
  },
  {
    id: 16,
    title: 'Rescue boat operation',
    url: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/disaster_hero.jpg',
  },
  {
    id: 17,
    title: 'Helicopter rescue operation',
    url: '/images/helicopter_rescue.jpg',
    fallback: '/images/helicopter_rescue.jpg',
  },
  {
    id: 18,
    title: 'Citizens evacuating to a safe location',
    url: 'https://images.unsplash.com/photo-1569163139599-0f4517e36f51?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/disaster_hero.jpg',
  },
  {
    id: 19,
    title: 'Emergency shelter and relief camp',
    url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/medical_camp.jpg',
  },
  {
    id: 20,
    title: 'Multi-agency disaster response coordination',
    url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=1920&q=80',
    fallback: '/images/command_center_login.jpg',
  },
]

export function HeroBackgroundSlideshow() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({})

  // Continuous auto-rotation every 4.5 seconds with seamless loop
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % DISASTER_HERO_SLIDES.length)
    }, 4500)

    return () => clearInterval(timer)
  }, [])

  // Preload next image in browser cache so transitions are instant
  useEffect(() => {
    const nextIndex = (currentIndex + 1) % DISASTER_HERO_SLIDES.length
    const nextSlide = DISASTER_HERO_SLIDES[nextIndex]
    if (nextSlide && typeof window !== 'undefined') {
      const img = new Image()
      img.src = imageErrors[nextSlide.id] ? nextSlide.fallback : nextSlide.url
      img.onerror = () => {
        setImageErrors((prev) => ({ ...prev, [nextSlide.id]: true }))
      }
    }
  }, [currentIndex, imageErrors])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* 20 Background Disaster Slides — Cross-fading smoothly */}
      {DISASTER_HERO_SLIDES.map((slide, index) => {
        const isActive = index === currentIndex
        // Keep active and adjacent slides mounted for smooth cross-fade without blank flashes
        const isAdjacent =
          index === (currentIndex - 1 + DISASTER_HERO_SLIDES.length) % DISASTER_HERO_SLIDES.length ||
          index === (currentIndex + 1) % DISASTER_HERO_SLIDES.length

        if (!isActive && !isAdjacent) return null

        const activeUrl = imageErrors[slide.id] ? slide.fallback : slide.url

        return (
          <div
            key={slide.id}
            className={cn(
              'absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out contrast-105',
              isActive ? 'opacity-100 z-10 rf-hero-kenburns' : 'opacity-0 z-0 pointer-events-none'
            )}
            style={{ backgroundImage: `url('${activeUrl}')` }}
            aria-hidden="true"
          />
        )
      })}

      {/* Localized readability scrim — confined to the left text column on large screens so the
          disaster photograph stays clearly visible on the right. Layer order:
          background image → localized gradient → hero content / workflow panel. */}
      <div
        className="absolute inset-0 z-20 pointer-events-none hidden lg:block"
        style={{
          background:
            'linear-gradient(90deg, rgba(2, 7, 16, 0.78) 0%, rgba(2, 7, 16, 0.66) 30%, rgba(2, 7, 16, 0.48) 52%, rgba(3, 8, 18, 0.22) 68%, rgba(3, 8, 18, 0.06) 82%, transparent 100%)',
        }}
      />
      {/* Mobile / tablet: text and workflow card stack vertically, so the localized gradient
          follows the full column height instead of darkening the whole image. */}
      <div
        className="absolute inset-0 z-20 pointer-events-none lg:hidden"
        style={{
          background:
            'linear-gradient(180deg, rgba(2, 7, 16, 0.68) 0%, rgba(2, 7, 16, 0.64) 26%, rgba(2, 7, 16, 0.66) 48%, rgba(2, 7, 16, 0.68) 68%, rgba(2, 7, 16, 0.76) 100%)',
        }}
      />
      {/* Very light vertical blend so the hero meets the navbar and page background cleanly */}
      <div
        className="absolute inset-0 z-20 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, rgba(2, 7, 16, 0.22) 0%, transparent 14%, transparent 88%, rgba(2, 7, 16, 0.24) 100%)',
        }}
      />
    </div>
  )
}

