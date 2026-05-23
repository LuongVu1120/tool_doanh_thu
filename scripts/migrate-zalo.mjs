/**
 * Migration: Add Zalo platform support + seed Zalo channel tags
 * Chạy sau 001_initial_schema_v2.sql
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONNECTION_STRING = 'postgresql://postgres.vwqzwlfbsluagyxfpime:LuongVD1120@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

async function main() {
  const client = new pg.Client({ connectionString: CONNECTION_STRING })
  
  try {
    await client.connect()
    console.log('✅ Connected')

    // 1. Alter table: add 'zalo' to platform CHECK constraint
    console.log('📝 Adding zalo to platform constraint...')
    await client.query(`
      ALTER TABLE public.channel_tags 
      DROP CONSTRAINT IF EXISTS channel_tags_platform_check;
      
      ALTER TABLE public.channel_tags 
      ADD CONSTRAINT channel_tags_platform_check 
      CHECK (platform IN ('facebook', 'tiktok', 'zalo'));
    `)
    console.log('✅ Platform constraint updated: facebook, tiktok, zalo')

    // 2. Seed Zalo channel tags from analysis
    console.log('📝 Seeding Zalo channel tags...')
    await client.query(`
      INSERT INTO public.channel_tags (tag_original, tag_normalized, employee_id, platform, effective_from, is_active)
      VALUES
        ('Zalo - Huyk Kim Hoàn Viễn Chí Bảo - 0368081715', 'zalo-huyk kim hoàn viễn chí bảo', NULL, 'zalo', '2026-01-01', true),
        ('Nguồn: Zalo HuyK Viễn Chí Bảo 0945366662', 'zalo-huyk viễn chí bảo', NULL, 'zalo', '2026-01-01', true),
        ('Zalo - HuyK Kim Hoàn', 'zalo-huyk kim hoàn', NULL, 'zalo', '2026-01-01', true),
        ('Zalo - HuyK Nhẫn Cưới', 'zalo-huyk nhẫn cưới', NULL, 'zalo', '2026-01-01', true),
        ('Zalo - HuyK Trang Sức', 'zalo-huyk trang sức', NULL, 'zalo', '2026-01-01', true),
        ('Zalo - HuyK Xưởng Vàng Bạc', 'zalo-huyk xưởng vàng bạc', NULL, 'zalo', '2026-01-01', true)
      ON CONFLICT (tag_normalized) WHERE effective_to IS NULL AND is_active = TRUE
      DO NOTHING;
    `)
    console.log('✅ Zalo channel tags seeded (6 tags)')

    // 3. Verify
    const { rows } = await client.query(`
      SELECT platform, COUNT(*) as count
      FROM public.channel_tags 
      WHERE is_active = TRUE AND effective_to IS NULL
      GROUP BY platform
      ORDER BY platform
    `)
    console.log('\n📋 Channel tags by platform:')
    rows.forEach(r => console.log(`  ${r.platform}: ${r.count} tags`))

  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
