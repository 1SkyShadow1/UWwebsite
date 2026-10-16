import http from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { saveAiCredential } from './ai-credentials.mjs'

const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))}
const sameToken=(a,b)=>{if(typeof a!=='string')return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right)}

export function createAiSetupHandler({token,save=saveAiCredential,onConnected=()=>{}}){
  return async(req,res)=>{
    const host=req.headers.host || '',remote=req.socket.remoteAddress || ''
    if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return json(res,403,{error:'This connection page is available on this computer only.'})
    if(req.headers.origin&&req.headers.origin!==`http://${host}`)return json(res,403,{error:'Open the local connection page directly.'})
    const url=new URL(req.url,`http://${host}`)
    const supplied=req.method==='GET'?url.searchParams.get('token'):req.headers.authorization?.replace(/^Bearer /,'')
    if(!sameToken(supplied,token))return json(res,403,{error:'This connection link has expired. Run npm run configure:ai again.'})
    if(req.method==='GET'&&url.pathname==='/'){
      const nonce=randomBytes(16).toString('hex')
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':`default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`})
      return res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect AI — Upholstery Warehouse</title><style nonce="${nonce}">*{box-sizing:border-box}body{background:#000;color:#fff;font:16px/1.6 system-ui;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}main{max-width:580px;border:1px solid #333;padding:36px}small{color:#f1cd37}h1{font-size:32px;line-height:1.2}p{color:#bbb}input{width:100%;padding:16px;background:#141414;border:1px solid #666;color:#fff;margin:8px 0 18px;font:inherit}button{padding:15px 22px;background:#f1cd37;border:0;font-weight:700;font-size:16px;cursor:pointer}button:disabled{opacity:.5}#status{color:#f1cd37;overflow-wrap:anywhere}label{display:block}</style><main><small>UPHOLSTERY WAREHOUSE / LOCAL CONNECTION</small><h1>Connect generative upholstery.</h1><p>Paste your OpenAI API key here. Windows encrypts it for your signed-in account. It stays on this computer and is never included in storefront code.</p><form><label for="key">OpenAI API key</label><input id="key" name="key" type="password" autocomplete="off" spellcheck="false" required minlength="20" maxlength="512" placeholder="Paste your API key"><button>Save secure connection</button></form><p id="status" role="status" aria-live="polite"></p><p>AI generations use your API project’s billing and limits. Saving the connection does not generate an image. You can close this page after saving.</p></main><script nonce="${nonce}">const form=document.querySelector('form'),field=document.querySelector('#key'),button=document.querySelector('button'),status=document.querySelector('#status');form.addEventListener('submit',async e=>{e.preventDefault();button.disabled=true;status.textContent='Protecting the connection with Windows…';try{const response=await fetch('/connect',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer ${token}'},body:JSON.stringify({key:field.value.trim()})});field.value='';const result=await response.json();if(!response.ok)throw Error(result.error);status.textContent='Connection saved securely. Return to AI Studio and choose Generate AI reupholstery.';form.hidden=true}catch(error){status.textContent=error.message;button.disabled=false}});</script></html>`)
    }
    if(req.method!=='POST'||url.pathname!=='/connect')return json(res,404,{error:'Not found.'})
    try{
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(res,415,{error:'Use the local connection form.'})
      let text='',size=0
      for await(const chunk of req){size+=chunk.length;if(size>2048)return json(res,413,{error:'The connection value is too long.'});text+=chunk}
      let body
      try{body=JSON.parse(text)}catch{return json(res,400,{error:'The connection form could not be read.'})}
      await save(body.key)
      json(res,200,{configured:true});onConnected()
    }catch{json(res,400,{error:'The key could not be saved. Enter a complete API key, or run the connection page again under your Windows account.'})}
  }
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const token=randomBytes(32).toString('hex')
  const server=http.createServer(createAiSetupHandler({token,onConnected:()=>setTimeout(()=>server.close(),10000).unref()}))
  server.listen(0,'127.0.0.1',()=>console.log(`Open this local connection page: http://127.0.0.1:${server.address().port}/?token=${token}`))
  setTimeout(()=>server.close(),20*60*1000).unref()
}
