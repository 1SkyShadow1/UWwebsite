export async function acquireCamera(mediaDevices,{isCurrent=()=>true,timeout=20000}={}){
  if(!mediaDevices?.getUserMedia)throw new Error('Camera preview needs HTTPS or localhost and a supported browser.')
  let expired=false,timer
  const capture=mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:30,max:30}},audio:false}).then(stream=>{
    if(expired||!isCurrent()){stream.getTracks().forEach(track=>track.stop());throw new Error('Camera request cancelled.')}
    return stream
  })
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Camera permission was not completed. Allow camera access for this site and retry, or upload a photograph.'))},timeout)})
  try{return await Promise.race([capture,deadline])}finally{clearTimeout(timer)}
}
