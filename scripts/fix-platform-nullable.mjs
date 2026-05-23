/**
 * Fix: Make channel_tags.platform nullable for mapping uploads
 */
import pg from 'pg'

const CONN = 'postgresql://postgres.vwqzwlfbsluagyxfpime:LuongVD1120@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

async function main() {
  const client = new pg.Client({ connectionString: CONN })
  await client.connect()
  console.log('✅ Connected')

  await client.query(`
    ALTER TABLE public.channel_tags DROP CONSTRAINT IF EXISTS channel_tags_platform_check;
    ALTER TABLE public.channel_tags ADD CONSTRAINT channel_tags_platform_check 
      CHECK (platform IN ('facebook','tiktok','zalo') OR platform IS NULL);
    ALTER TABLE public.channel_tags ALTER COLUMN platform DROP NOT NULL;
  `)
  console.log('✅ Platform now nullable')

  await client.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
