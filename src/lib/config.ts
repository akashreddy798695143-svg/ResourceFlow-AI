// Environment variable validation
// Run this early to fail fast with clear error messages

export function validateEnv() {
  const requiredVars: Record<string, { required: boolean; description: string }> = {
    DATABASE_URL: {
      required: true,
      description: 'PostgreSQL connection string (e.g., postgresql://user:pass@host/db)',
    },
    SMTP_HOST: {
      required: false,
      description: 'SMTP server host for email (e.g., smtp.gmail.com)',
    },
    SMTP_PORT: {
      required: false,
      description: 'SMTP server port (e.g., 587)',
    },
    SMTP_USERNAME: {
      required: false,
      description: 'SMTP username (e.g., your-email@gmail.com)',
    },
    SMTP_PASSWORD: {
      required: false,
      description: 'SMTP password or app-specific password',
    },
  }

  const missing: string[] = []
  const warnings: string[] = []

  for (const [key, meta] of Object.entries(requiredVars)) {
    const value = process.env[key]
    if (!value && meta.required) {
      missing.push(`${key}: ${meta.description}`)
    } else if (!value && !meta.required && ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD'].includes(key)) {
      // Check if some SMTP vars are set but not all
      const smtpVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD']
      const setSmtpVars = smtpVars.filter((v) => process.env[v])
      if (setSmtpVars.length > 0 && setSmtpVars.length < smtpVars.length) {
        warnings.push(`Partial SMTP configuration: set all SMTP_* vars or none`)
      }
    }
  }

  if (missing.length > 0) {
    const errorMsg = [
      '❌ Missing required environment variables:',
      ...missing.map((m) => `  - ${m}`),
      '',
      '💡 Setup instructions:',
      '  1. Copy .env.example to .env.local',
      '  2. Fill in the required values',
      '  3. Restart your development server',
      '',
      'For Vercel deployment:',
      '  1. Go to Project Settings > Environment Variables',
      '  2. Add the required variables for the Production environment',
      '  3. Redeploy the project',
    ].join('\n')

    console.error(errorMsg)
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing environment variables: ${missing.map((m) => m.split(':')[0]).join(', ')}`)
    }
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Environment warnings:\n  ' + warnings.join('\n  '))
  }
}

// Call this on app startup (before importing db, etc.)
if (typeof window === 'undefined') {
  // Server-side only
  validateEnv()
}
