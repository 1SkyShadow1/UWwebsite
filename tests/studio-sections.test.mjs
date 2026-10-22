import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { furnitureAnchor, sectionSeeds, chooseSections, maskOutline } from '../src/studio/section-detection.js'
import { buildPartRegions, validOutline, partContainsPoint, plannedFabricEdits, partsFingerprint } from '../src/studio/part-regions.js'

test('automatic anchoring accepts furniture, rejects room objects and chooses the primary piece',()=>{
  const detection=(name,score,x,y,width,height)=>({categories:[{categoryName:name,score}],boundingBox:{originX:x,originY:y,width,height}})
  const anchor=furnitureAnchor([detection('dining table',.99,0,0,1000,800),detection('chair',.9,20,20,120,200),detection('couch',.9,100,150,700,500)],1000,800)
  assert.equal(anchor.category,'couch');assert.equal(anchor.left,.1);assert.equal(anchor.top,150/800)
  assert.equal(furnitureAnchor([detection('wall',.99,0,0,1000,800),detection('chair',.1,0,0,500,500)],1000,800),undefined)
})

test('automatic masks become bounded outlines, discard duplicates and never include room pixels',()=>{
  const width=100,height=100,root=new Float32Array(width*height)
  for(let y=10;y<90;y++)for(let x=10;x<90;x++)root[y*width+x]=1
  const rectangle=(left,top,right,bottom)=>{const values=new Uint8Array(root.length);for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)values[y*width+x]=1;return values}
  const first=rectangle(15,15,40,40),second=rectangle(55,15,80,40),room=rectangle(0,0,30,30)
  const proposals=[{values:first,point:{x:20,y:20},score:.9},{values:first,point:{x:22,y:22},score:.8},{values:second,point:{x:60,y:20},score:.9},{values:room,point:{x:5,y:5},score:.99},{values:Uint8Array.from(root),point:{x:50,y:50},score:.99}]
  const sections=chooseSections(proposals,root,width,height)
  assert.equal(sections.length,2);assert.ok(sections.every(section=>validOutline(section.points)&&section.points.length<=64))
  assert.ok(sectionSeeds(root,width,height).every(p=>root[p.y*width+p.x]===1))
  for(const section of sections)for(let p=0;p<root.length;p++)if(!root[p])assert.equal(section.values[p],0)
})

test('detected bitmap regions preserve holes even when the display polygon encloses them',()=>{
  const width=100,height=100,values=new Uint8Array(width*height),root=new Float32Array(width*height).fill(1)
  for(let y=20;y<80;y++)for(let x=20;x<80;x++)if(!(x>=40&&x<60&&y>=40&&y<60))values[y*width+x]=1
  const part={id:'auto',type:'Section',materialId:'leather',points:maskOutline(values,width,height),region:{width,height,values,signature:'one'}}
  assert.ok(validOutline(part.points));assert.equal(partContainsPoint(part,.5,.5),false);assert.equal(partContainsPoint(part,.3,.3),true)
  const result=buildPartRegions(root,width,height,[part],{keepRest:true})
  assert.equal(result.labels[50*width+50],0);assert.equal(result.labels[30*width+30],2)
  assert.notEqual(partsFingerprint([part],true),partsFingerprint([{...part,region:{...part.region,signature:'two'}}],true))
  assert.equal(plannedFabricEdits('velvet',[part]),2);assert.equal(plannedFabricEdits('velvet',[part],true),1)
})

test('local section model weights and furniture detector retain recorded integrity',async()=>{
  for(const name of ['slimsam-77-uniform']){
    const manifest=JSON.parse(await readFile(`public/models/${name}/provenance.json`,'utf8'))
    assert.equal(manifest.license,'Apache-2.0')
    for(const [file,entry] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile(`public/models/${name}/${file}`)).digest('hex'),entry.sha256)
  }
  const detector=JSON.parse(await readFile('public/models/furniture-detector.provenance.json','utf8'))
  assert.equal(createHash('sha256').update(await readFile('public/models/furniture-detector.tflite')).digest('hex'),detector.sha256)
})
