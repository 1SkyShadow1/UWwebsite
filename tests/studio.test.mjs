import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import sharp from 'sharp'
import {applySurface,brushMask} from '../src/studio/compositor.js'
import {unpackCameraPixels} from '../src/studio/eightwall.js'
import {materials} from '../src/data/materials.js'
import {shopProducts} from '../src/data/shop-products.js'
const source={width:2,height:1,data:new Uint8ClampedArray([100,100,100,255,100,100,100,255])}
const texture={...source,data:new Uint8ClampedArray([200,30,10,255,200,30,10,255])}
test('unselected room pixels remain identical',()=>{
 const out=applySurface(source,texture,new Float32Array([0,1]),{strength:1})
 assert.deepEqual([...out.slice(0,4)],[100,100,100,255]);assert.deepEqual([...out.slice(4)],[200,30,10,255])
})
test('comparison slider returns exact original at 100% and splits at midpoint',()=>{
 const mask=new Float32Array([1,1]);assert.deepEqual(applySurface(source,texture,mask,{compare:1}),source.data)
 const out=applySurface(source,texture,mask,{compare:.5,strength:1});assert.equal(out[0],100);assert.equal(out[4],200)
})
test('brush and eraser operate only inside the selected radius',()=>{
 const mask=new Float32Array(100);brushMask(mask,10,10,5,5,2);assert.equal(mask[55],1);assert.equal(mask[0],0)
 brushMask(mask,10,10,5,5,1,true);assert.equal(mask[55],0)
})
test('8th Wall row padding never enters RGBA image',()=>{
 const result=unpackCameraPixels({pixels:new Uint8Array([1,2,3,4,99,99,5,6,7,8,99,99]),rows:2,cols:1,rowBytes:6})
 assert.deepEqual([...result.data],[1,2,3,4,5,6,7,8])
 assert.equal(unpackCameraPixels({pixels:[],rows:1,cols:1,rowBytes:2}),null)
})
test('every furniture listing has a unique local reconstruction',()=>{
 assert.equal(new Set(shopProducts.map(p=>p.image)).size,shopProducts.length)
 for(const p of shopProducts)assert.ok(fs.existsSync(`public${p.image}`),p.id)
})
test('every material has a local audited image and maps never exceed 1K',async()=>{
 assert.equal(new Set(materials.map(m=>m.id)).size,materials.length)
 const paths=new Set()
 for(const m of materials){assert.ok(m.textureCredit,m.id);paths.add(m.image);for(const key of ['normal','roughness'])if(m.pbr?.[key])paths.add(m.pbr[key])}
 for(const path of paths){assert.ok(fs.existsSync(`public${path}`),path);const meta=await sharp(`public${path}`).metadata();assert.ok(meta.width<=1024&&meta.height<=1024,path)}
})
test('matched PBR sets use the same source asset for all channels',()=>{
 for(const m of materials.filter(m=>m.id.startsWith('cc0-')&&m.pbr)){
  assert.equal(m.pbr.albedo,m.image);assert.equal(m.pbr.metalness,0)
  const stem=m.image.replace(/\.jpg$/,'');assert.equal(m.pbr.normal,`${stem}-normal.jpg`);assert.equal(m.pbr.roughness,`${stem}-roughness.jpg`)
 }
})
