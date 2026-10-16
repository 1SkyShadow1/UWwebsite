import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const defaultPath=resolve('.data/studio-ai-provider.json')
let cached

function protectWindows(value,operation){
  if(process.platform!=='win32')throw new Error('Use OPENAI_API_KEY on this operating system. The local encrypted connection page supports Windows.')
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

export async function saveAiCredential(key,{path=defaultPath}={}){
  if(typeof key!=='string'||key.length<20||key.length>512||!/^[\x21-\x7e]+$/.test(key))throw new Error('Enter the complete API key without spaces.')
  const ciphertext=await protectWindows(Buffer.from(key).toString('base64'),'Protect')
  await mkdir(dirname(path),{recursive:true})
  const temporary=`${path}.${randomUUID()}.tmp`
  await writeFile(temporary,JSON.stringify({version:1,protection:'windows-dpapi-current-user',ciphertext}),{mode:0o600})
  await rename(temporary,path)
  cached=null
}

export async function getAiCredential({path=defaultPath,env=process.env}={}){
  if(env.OPENAI_API_KEY?.trim())return env.OPENAI_API_KEY.trim()
  let info
  try{info=await stat(path)}catch{return null}
  if(cached?.path===path&&cached.modified===info.mtimeMs)return cached.key
  const record=JSON.parse(await readFile(path,'utf8'))
  if(record.protection!=='windows-dpapi-current-user'||typeof record.ciphertext!=='string')throw new Error('Reconnect the AI provider using the local connection page.')
  const decoded=await protectWindows(record.ciphertext,'Unprotect')
  const key=Buffer.from(decoded,'base64').toString('utf8')
  cached={path,modified:info.mtimeMs,key}
  return key
}

export async function aiCredentialConfigured({path=defaultPath,env=process.env}={}){
  if(env.OPENAI_API_KEY?.trim())return true
  try{await stat(path);return true}catch{return false}
}
