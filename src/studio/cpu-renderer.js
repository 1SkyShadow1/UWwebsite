import { photoMaterialResponse } from './material-response.js'
const linear=Float32Array.from({length:256},(_,v)=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4})
const srgb=value=>Math.max(0,Math.min(255,Math.round((value<=.0031308?value*12.92:1.055*Math.max(0,value)**(1/2.4)-.055)*255)))

export function renderSurfaceCPU(source,analysis,texture,material,{compare=.5,showMask=false}={}){
  const output=new Uint8ClampedArray(source.data),{width,height}=source,response=photoMaterialResponse(material)
  const tile=Math.max(8,analysis.bounds[2]*width*response.tileMetres/2.1),x0=analysis.bounds[0]*width,y0=analysis.bounds[1]*height
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=y*width+x,i=p*4,alpha=analysis.data[i+3]/255
    if(alpha<=0||x<width*compare)continue
    const nx=analysis.geometry[i]/255*2-1,ny=analysis.geometry[i+1]/255*2-1,nz=Math.sqrt(Math.max(.08,1-nx*nx-ny*ny))
    const length=Math.hypot(nx,ny,nz),ndv=nz/length,ndl=Math.max(0,(-nx*.45-ny*.55+nz)/length/1.226)
    const tx=((Math.floor((x-x0)/tile*texture.width)%texture.width)+texture.width)%texture.width
    const ty=((Math.floor((y-y0)/tile*texture.height)%texture.height)+texture.height)%texture.height,ti=(ty*texture.width+tx)*4
    const contact=analysis.geometry[i+2]/255,confidence=analysis.geometry[i+3]/255,illumination=Math.max(.015,analysis.data[i+1]/128)
    const shade=illumination*contact*(1+response.anisotropy*(ndl-.6)*.24)
    const half=Math.max(0,(-nx*.2-ny*.25+nz*.97)/length)
    const spec=Math.min(.12,half**(2/Math.max(.04,response.roughness**2))*.04/Math.max(.15,response.roughness))*response.specularStrength
    const highlight=contact*contact*confidence, sheen=(1-ndv)**2*response.sheen*.13*ndl*illumination*highlight
    for(let c=0;c<3;c++){
      const albedo=linear[texture.data[ti+c]],value=showMask?linear[[245,206,57][c]]:albedo*shade*(1-spec)+spec*illumination*highlight+Math.sqrt(albedo)*sheen
      output[i+c]=srgb(linear[source.data[i+c]]*(1-alpha)+value*alpha)
    }
  }
  return output
}
