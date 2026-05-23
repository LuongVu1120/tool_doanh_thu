import pg from 'pg'
const c = new pg.Client({ connectionString: 'postgresql://postgres.vwqzwlfbsluagyxfpime:LuongVD1120@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres' })
c.connect().then(() => c.query("SELECT column_name FROM information_schema.columns WHERE table_name='channel_tags' ORDER BY ordinal_position"))
  .then(r => { console.log(r.rows.map(x => x.column_name).join(', ')); c.end() })
