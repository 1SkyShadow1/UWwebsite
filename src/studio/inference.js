export function createInferenceClient(makeWorker,{timeout=60000,onProgress=()=>{}}={}) {
  let worker,sequence=0,pending=new Map(),disposed=false
  const reset=message=>{
    worker?.terminate();worker=null
    for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error(message))}
    pending.clear()
  }
  return {
    request(payload,transfer=[]){
      if(disposed)return Promise.reject(new Error('The Studio has closed.'))
      return new Promise((resolve,reject)=>{
        if(!worker){
          try{worker=makeWorker()}catch(error){reject(error);return}
          worker.onmessage=({data})=>{
            if(data.progress!==undefined){onProgress(data.progress);return}
            const task=pending.get(data.id);if(!task)return
            clearTimeout(task.timer);pending.delete(data.id)
            data.error?task.reject(new Error(data.error)):task.resolve(data)
          }
          worker.onerror=()=>reset('The AI engine could not start. Retry or refine the selection by hand.')
        }
        const id=++sequence,timer=setTimeout(()=>reset('AI analysis took too long. Your image is safe; retry or refine the selection.'),timeout)
        pending.set(id,{resolve,reject,timer})
        try{worker.postMessage({id,...payload},transfer)}catch(error){clearTimeout(timer);pending.delete(id);reject(error)}
      })
    },
    cancel(){reset('The image was replaced.')},
    dispose(){disposed=true;reset('The Studio has closed.')},
  }
}
