import sharp from 'sharp'
import { REGION_COLORS, buildPartRegions } from '../../src/studio/part-regions.js'

export async function identifiedPartsFixture(){
  const width=256,height=192,mask=new Float32Array(width*height)
  for(let y=20;y<170;y++)for(let x=20;x<235;x++)mask[y*width+x]=1
  const rectangle=(x,y)=>[{x,y},{x:x+.15,y},{x:x+.15,y:y+.2},{x,y:y+.2}]
  const parts=['pillow','seat','arm'].map((id,i)=>({id,type:'Section',materialId:['leather','linen','velvet'][i],points:rectangle(.15+i*.23,.3)}))
  const {labels,selection}=buildPartRegions(mask,width,height,parts)
  const pixels=Buffer.alloc(width*height*4,255),regions=Buffer.alloc(width*height*4,255)
  for(let p=0;p<mask.length;p++){
    pixels[p*4+3]=Math.round((1-selection[p])*255)
    for(let c=0;c<3;c++)regions[p*4+c]=REGION_COLORS[labels[p]][c]
  }
  const png=async(data,channels)=>sharp(data,{raw:{width,height,channels}}).png().toBuffer()
  const image=await sharp({create:{width,height,channels:3,background:'#ddd'}}).png().toBuffer()
  const dataUrl=bytes=>`data:image/png;base64,${bytes.toString('base64')}`
  const body={materialId:'velvet',nativeSize:'1K',imageData:dataUrl(image),maskData:dataUrl(await png(pixels,4)),regionData:dataUrl(await png(regions,4)),components:parts.map(({id,type,materialId})=>({id,type,materialId}))}
  return {body,parts,mask,width,height}
}
