import { randomUUID } from 'node:crypto'
import { openDatabase } from './database.mjs'

const failure=(status,message)=>Object.assign(new Error(message),{status})
const ttl=15*60*1000

// Each owner's small record set is loaded into the existing validated repository.
// PostgreSQL's row lock serializes changes across serverless instances; only a
// successfully completed request is committed. No SQLite file is used on Vercel.
export function createPostgresStore(pool,{now=Date.now,dailyLimit=20,maxActive=2}={}){
  let schema
  async function ready(){
    if(!schema)schema=(async()=>{
      const client=await pool.connect()
      try{
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(81731420)')
        await client.query('CREATE TABLE IF NOT EXISTS uw_owner_records (owner TEXT PRIMARY KEY, records JSONB NOT NULL DEFAULT \'[]\'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())')
        await client.query('CREATE TABLE IF NOT EXISTS uw_image_jobs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_key TEXT NOT NULL, digest TEXT NOT NULL, created_ms BIGINT NOT NULL, expires_ms BIGINT NOT NULL, result JSONB NOT NULL, UNIQUE(owner,request_key))')
        await client.query('CREATE INDEX IF NOT EXISTS uw_image_jobs_expiry ON uw_image_jobs(expires_ms)')
        await client.query('COMMIT')
      }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
      finally{client.release()}
    })().catch(error=>{schema=null;throw error})
    await schema
  }
  async function transaction(work){
    await ready()
    const client=await pool.connect()
    try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result}
    catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
    finally{client.release()}
  }
  return {
    async withOwner(owner,work){
      return transaction(async client=>{
        await client.query('INSERT INTO uw_owner_records(owner) VALUES($1) ON CONFLICT(owner) DO NOTHING',[owner])
        const {rows}=await client.query('SELECT records FROM uw_owner_records WHERE owner=$1 FOR UPDATE',[owner])
        const database=openDatabase(':memory:')
        try{
          for(const row of rows[0].records){
            if(row.owner!==owner)throw new Error('Invalid record owner')
            database.put(row.kind,row.id,owner,row.payload)
          }
          const result=await work(database)
          if(result.commit){
            const records=database.exportRecords()
            if(records.length>10000||Buffer.byteLength(JSON.stringify(records))>8_000_000)throw failure(413,'This showroom has reached its saved-data limit. Remove an old setup and try again.')
            await client.query('UPDATE uw_owner_records SET records=$2::jsonb,updated_at=NOW() WHERE owner=$1',[owner,JSON.stringify(records)])
          }
          return result
        }finally{database.close()}
      })
    },
    async claim(owner,key,digest){
      return transaction(async client=>{
        // A transaction-scoped global lock makes the quota and claim one atomic
        // operation, even when different function instances receive the requests.
        await client.query('SELECT pg_advisory_xact_lock(81731421)')
        await client.query("UPDATE uw_image_jobs SET result=jsonb_build_object('id',id,'status','expired') WHERE expires_ms<$1 AND result->>'status'!='expired'",[now()])
        await client.query('DELETE FROM uw_image_jobs WHERE created_ms<$1',[now()-24*60*60*1000])
        const previous=await client.query('SELECT * FROM uw_image_jobs WHERE owner=$1 AND request_key=$2',[owner,key])
        if(previous.rows.length){
          const row=previous.rows[0]
          if(row.digest!==digest)throw failure(409,'This generation reference belongs to another edit. Start a new generation.')
          return {fresh:false,job:row.result}
        }
        const today=now()-24*60*60*1000
        const count=await client.query('SELECT COUNT(*)::integer AS total FROM uw_image_jobs WHERE created_ms>=$1',[today])
        if(count.rows[0].total>=dailyLimit)throw failure(429,'The Studio has reached its daily generation limit. Please try again tomorrow.')
        const running=await client.query("SELECT owner FROM uw_image_jobs WHERE result->>'status'='generating' AND created_ms>$1",[now()-260000])
        if(running.rows.length>=maxActive||running.rows.some(row=>row.owner===owner))throw failure(429,'An AI edit is already running. Wait for it to finish.')
        const job={id:randomUUID(),status:'generating',stage:'AI is reconstructing the upholstery…'}
        await client.query('INSERT INTO uw_image_jobs(id,owner,request_key,digest,created_ms,expires_ms,result) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[job.id,owner,key,digest,now(),now()+ttl,JSON.stringify(job)])
        return {fresh:true,job}
      })
    },
    async get(owner,id){
      await ready()
      await pool.query("UPDATE uw_image_jobs SET result=jsonb_build_object('id',id,'status','expired') WHERE expires_ms<$1 AND result ? 'imageData'",[now()])
      const {rows}=await pool.query('SELECT result,created_ms FROM uw_image_jobs WHERE owner=$1 AND id=$2 AND expires_ms>$3',[owner,id,now()])
      if(!rows.length)throw failure(404,'This AI edit is unavailable or has expired.')
      const job=rows[0].result
      if(job.status==='generating'&&now()-Number(rows[0].created_ms)>260000)return {...job,status:'failed',error:'The hosted edit was interrupted. Check the provider before starting a new paid request.'}
      return job
    },
    async finish(owner,id,result){
      await ready()
      const {rows}=await pool.query("UPDATE uw_image_jobs SET result=$3::jsonb WHERE owner=$1 AND id=$2 AND result->>'status'!='cancelled' RETURNING result",[owner,id,JSON.stringify(result)])
      return rows[0]?.result || this.get(owner,id)
    },
    async cancel(owner,id){
      await ready()
      const {rows}=await pool.query("UPDATE uw_image_jobs SET result=jsonb_build_object('id',id,'status','cancelled','stage','AI edit cancelled.') WHERE owner=$1 AND id=$2 AND result->>'status'='generating' RETURNING result",[owner,id])
      return rows[0]?.result || this.get(owner,id)
    },
  }
}
