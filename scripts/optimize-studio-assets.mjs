import sharp from 'sharp'
import fs from 'node:fs/promises'
for(const file of await fs.readdir('public/assets/textures')){
 if(!/\.(png|jpg)$/.test(file))continue
 const path=`public/assets/textures/${file}`,input=await fs.readFile(path),meta=await sharp(input).metadata()
 if(meta.width>1024||meta.height>1024){const data=await sharp(input).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true}).toBuffer();await fs.writeFile(path,data)}
}
for(const file of await fs.readdir('public/assets/products')){
 if(!file.endsWith('.png'))continue
 await sharp(`public/assets/products/${file}`).resize({width:1200,withoutEnlargement:true}).webp({quality:87}).toFile(`public/assets/products/${file.replace('.png','.webp')}`)
}
console.log('Texture maps capped at 1K; furniture WebP derivatives created.')
