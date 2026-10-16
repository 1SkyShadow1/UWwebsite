import { mkdir, copyFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { materials } from '../src/data/materials.js'

const references=new Set(materials.map(material=>material.textureImage || material.image))
for(const reference of references){
  if(!reference?.startsWith('/assets/')||reference.includes('..'))throw new Error('Invalid server fabric reference')
  const destination=resolve('server-assets',`.${reference}`)
  await mkdir(dirname(destination),{recursive:true})
  await copyFile(resolve('public',`.${reference}`),destination)
}
console.log(`Prepared ${references.size} server fabric references.`)
