import { db } from './src/lib/db'
import argon2 from 'argon2'
async function main() {
  const phoneRec = await db.otpVerification.findFirst({ where: { identifier: '+9779800000177', purpose: 'REGISTRATION', consumed: false }, orderBy: { createdAt: 'desc' } })
  const emailRec = await db.otpVerification.findFirst({ where: { identifier: 'dualotp@example.com', purpose: 'REGISTRATION', consumed: false }, orderBy: { createdAt: 'desc' } })
  let phoneOtp = '', emailOtp = ''
  if (phoneRec) for (let i = 0; i < 1000000; i++) { const c = String(i).padStart(6, '0'); if (await argon2.verify(phoneRec.codeHash, c)) { phoneOtp = c; break } }
  if (emailRec) for (let i = 0; i < 1000000; i++) { const c = String(i).padStart(6, '0'); if (await argon2.verify(emailRec.codeHash, c)) { emailOtp = c; break } }
  process.stdout.write(JSON.stringify({ phoneOtp, emailOtp }))
}
main().catch(console.error).finally(() => process.exit(0))
