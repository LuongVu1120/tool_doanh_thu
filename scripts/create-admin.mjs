/**
 * Create an admin user for testing
 * Uses Supabase service_role key to create user via Admin API
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// Load .env.local manually
const envPath = path.join(ROOT, '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const [key, ...vals] = line.split('=')
  if (key && vals.length) env[key.trim()] = vals.join('=').trim()
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing Supabase env vars in .env.local')
  process.exit(1)
}

async function createAdmin(email, password, fullName) {
  // 1. Create user via Supabase Admin API
  console.log(`🔐 Creating user: ${email}...`)
  
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  })

  if (!createRes.ok) {
    const err = await createRes.json()
    if (err.error_code === 'email_exists' || err.message?.includes('already')) {
      console.log('⚠️ User already exists, fetching existing...')
      // Fetch existing user
      const listRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
        {
          headers: {
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'apikey': SERVICE_KEY,
          },
        }
      )
      const users = await listRes.json()
      if (users.users?.[0]) {
        console.log(`✅ Found existing user: ${users.users[0].id}`)
        return users.users[0].id
      }
      console.error('❌ Could not find existing user')
      process.exit(1)
    }
    console.error('❌ Failed to create user:', err)
    process.exit(1)
  }

  const user = await createRes.json()
  console.log(`✅ User created: ${user.id}`)
  return user.id
}

async function ensureUserProfile(userId, email, fullName) {
  // Check if profile exists
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=*`,
    {
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
      },
    }
  )
  const profiles = await checkRes.json()

  if (profiles.length === 0) {
    // Create profile manually (trigger might not have fired)
    console.log('📝 Creating user profile...')
    await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        id: userId,
        email,
        full_name: fullName,
        role: 'viewer',
      }),
    })
  }

  // Set role to admin
  console.log('👑 Setting admin role...')
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ role: 'admin' }),
    }
  )

  if (updateRes.ok) {
    console.log('✅ Role set to admin')
  } else {
    const err = await updateRes.text()
    console.error('❌ Failed to set role:', err)
  }
}

async function main() {
  const email = 'admin@huyk-tools.local'
  const password = 'Admin@123456'
  const fullName = 'Admin HuyK'

  console.log('=' .repeat(50))
  console.log('🚀 Creating Admin Account')
  console.log('='.repeat(50))
  console.log(`   Email:    ${email}`)
  console.log(`   Password: ${password}`)
  console.log(`   Name:     ${fullName}`)
  console.log('='.repeat(50))

  const userId = await createAdmin(email, password, fullName)
  await ensureUserProfile(userId, email, fullName)

  console.log('\n🎉 DONE! Admin account ready.')
  console.log(`\n📋 Login info:`)
  console.log(`   URL:      http://localhost:3000/login`)
  console.log(`   Email:    ${email}`)
  console.log(`   Password: ${password}`)
  console.log(`   Role:     admin`)
}

main().catch(err => {
  console.error('💥', err)
  process.exit(1)
})
