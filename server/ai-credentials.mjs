import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const defaultPath=resolve('.data/studio-ai-provider.json')
let cached

function protectWindows(value,operation){
  if(process.platform!=='win32')throw new Error('Use GEMINI_API_KEY or OPENAI_API_KEY on this operating system. The local encrypted connection page supports Windows.')
  const script=`Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`
  return new Promise((accept,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','ignore']})
    const chunks=[];let size=0
    const timer=setTimeout(()=>{child.kill();reject(new Error('Windows could not open the encrypted AI connection. Try the connection page again.'))},15000)
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>16384)child.kill();else chunks.push(chunk)})
    child.on('error',()=>{clearTimeout(timer);reject(new Error('Windows credential protection could not start.'))})
    child.on('close',code=>{clearTimeout(timer);code===0&&size<=16384?accept(Buffer.concat(chunks).toString().trim()):reject(new Error('Windows could not protect this connection for the current account.'))})
    child.stdin.on('error',()=>{})
    child.stdin.end(value)
  })
}

export async function saveAiCredential(key,{path=defaultPath,provider='openai'}={}){
  if(!['openai','google'].includes(provider))throw new Error('Choose a supported AI provider.')
  if(typeof key!=='string'||key.length<20||key.length>512||!/^[\x21-\x7e]+$/.test(key))throw new Error('Enter the complete API key without spaces.')
  const ciphertext=await protectWindows(Buffer.from(key).toString('base64'),'Protect')
  await mkdir(dirname(path),{recursive:true})
  const temporary=`${path}.${randomUUID()}.tmp`
  await writeFile(temporary,JSON.stringify({version:1,provider,protection:'windows-dpapi-current-user',ciphertext}),{mode:0o600})
  await rename(temporary,path)
  cached=null
}

export async function getAiProvider({path=defaultPath,env=process.env}={}){
  if(['google','openai'].includes(env.AI_IMAGE_PROVIDER))return env.AI_IMAGE_PROVIDER
  try{const record=JSON.parse(await readFile(path,'utf8'));if(['google','openai'].includes(record.provider))return record.provider}catch{}
  return env.GEMINI_API_KEY?.trim()||env.GOOGLE_API_KEY?.trim()?'google':'openai'
}

export async function getAiCredential({path=defaultPath,env=process.env,provider}={}){
  provider ||= await getAiProvider({path,env})
  const environmentKey=provider==='google'?(env.GEMINI_API_KEY || env.GOOGLE_API_KEY):env.OPENAI_API_KEY
  if(environmentKey?.trim())return environmentKey.trim()
  let info
  try{info=await stat(path)}catch{return null}
  if(cached?.path===path&&cached.provider===provider&&cached.modified===info.mtimeMs)return cached.key
  const record=JSON.parse(await readFile(path,'utf8'))
  if((record.provider || 'openai')!==provider)return null
  if(record.protection!=='windows-dpapi-current-user'||typeof record.ciphertext!=='string')throw new Error('Reconnect the AI provider using the local connection page.')
  const decoded=await protectWindows(record.ciphertext,'Unprotect')
  const key=Buffer.from(decoded,'base64').toString('utf8')
  cached={path,provider,modified:info.mtimeMs,key}
  return key
}

export async function aiCredentialConfigured({path=defaultPath,env=process.env}={}){
  const provider=await getAiProvider({path,env})
  if((provider==='google'?(env.GEMINI_API_KEY || env.GOOGLE_API_KEY):env.OPENAI_API_KEY)?.trim())return true
  try{const record=JSON.parse(await readFile(path,'utf8'));return (record.provider || 'openai')===provider}catch{return false}
}
