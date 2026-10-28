import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AI_PROVIDERS, aiProviderKey } from './ai-providers.mjs'

const defaultPath=resolve('.data/studio-ai-provider.json')
let cached

function protectWindows(value,operation){
  if(process.platform!=='win32')throw new Error('Set the provider API key in the server environment on this operating system. The local encrypted connection page supports Windows.')
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
  if(!Object.hasOwn(AI_PROVIDERS,provider))throw new Error('Choose a supported AI provider.')
  if(typeof key!=='string'||key.length<20||key.length>512||!/^[\x21-\x7e]+$/.test(key))throw new Error('Enter the complete API key without spaces.')
  if(provider==='pollinations'&&!/^sk_[A-Za-z0-9_-]+$/.test(key))throw new Error('Use a Pollinations secret key beginning with sk_.')
  const ciphertext=await protectWindows(Buffer.from(key).toString('base64'),'Protect')
  let previous
  try{previous=JSON.parse(await readFile(path,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
  if(previous&&previous.protection!=='windows-dpapi-current-user')throw new Error('The existing AI connection could not be read.')
  const credentials=previous?.version===2?{...previous.credentials}:previous?.ciphertext?{[previous.provider || 'openai']:previous.ciphertext}:{}
  credentials[provider]=ciphertext
  await mkdir(dirname(path),{recursive:true})
  const temporary=`${path}.${randomUUID()}.tmp`
  await writeFile(temporary,JSON.stringify({version:2,provider,protection:'windows-dpapi-current-user',credentials}),{mode:0o600})
  await rename(temporary,path)
  cached=null
}

export async function getAiProvider({path=defaultPath,env=process.env,fallback='openai'}={}){
  if(Object.hasOwn(AI_PROVIDERS,env.AI_IMAGE_PROVIDER || ''))return env.AI_IMAGE_PROVIDER
  try{const record=JSON.parse(await readFile(path,'utf8'));if(Object.hasOwn(AI_PROVIDERS,record.provider))return record.provider}catch{}
  return ['pollinations','google','openai'].find(provider=>aiProviderKey(provider,env)) || fallback
}

export async function getAiCredential({path=defaultPath,env=process.env,provider}={}){
  provider ||= await getAiProvider({path,env})
  const environmentKey=aiProviderKey(provider,env)
  if(environmentKey?.trim())return environmentKey.trim()
  let info
  try{info=await stat(path)}catch{return null}
  if(cached?.path===path&&cached.provider===provider&&cached.modified===info.mtimeMs)return cached.key
  const record=JSON.parse(await readFile(path,'utf8'))
  const ciphertext=record.version===2?record.credentials?.[provider]:(record.provider || 'openai')===provider?record.ciphertext:null
  if(!ciphertext)return null
  if(record.protection!=='windows-dpapi-current-user'||typeof ciphertext!=='string')throw new Error('Reconnect the AI provider using the local connection page.')
  const decoded=await protectWindows(ciphertext,'Unprotect')
  const key=Buffer.from(decoded,'base64').toString('utf8')
  cached={path,provider,modified:info.mtimeMs,key}
  return key
}

export async function aiCredentialConfigured({path=defaultPath,env=process.env,provider}={}){
  provider ||= await getAiProvider({path,env})
  if(aiProviderKey(provider,env))return true
  try{const record=JSON.parse(await readFile(path,'utf8'));return record.version===2?typeof record.credentials?.[provider]==='string':(record.provider || 'openai')===provider}catch{return false}
}
