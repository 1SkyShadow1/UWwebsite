export async function readProgressJson(response,onProgress=()=>{},maxBytes=100_000_000){
  const reader=response.body.getReader(),decoder=new TextDecoder()
  let pending='',total=0,result
  const record=line=>{
    if(!line.trim())return
    let value
    try{value=JSON.parse(line)}catch{throw new Error('The AI connection returned an incomplete result. Your original is still available.')}
    if(value.progress){onProgress(value.progress);return}
    if(result)throw new Error('The AI connection returned an unexpected result.')
    result=value
  }
  try{
    for(;;){
      const {value,done}=await reader.read()
      if(done)break
      total+=value.byteLength
      if(total>maxBytes)throw new Error('The AI image exceeded the download limit. Choose a smaller detail setting.')
      pending+=decoder.decode(value,{stream:true})
      let newline
      while((newline=pending.indexOf('\n'))!==-1){record(pending.slice(0,newline));pending=pending.slice(newline+1)}
    }
    pending+=decoder.decode();record(pending)
    if(!result)throw new Error('The AI connection ended before the result was ready. Retry to recover the same edit.')
    return result
  }catch(error){await reader.cancel().catch(()=>{});throw error}
  finally{reader.releaseLock()}
}
