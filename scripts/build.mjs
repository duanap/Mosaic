import { cp, mkdir, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),destination=resolve(root,'dist');
await rm(destination,{recursive:true,force:true});await mkdir(destination,{recursive:true});
for(const path of ['public','shared','server','scripts','tests','docs','deploy','package.json','package-lock.json','README.md','LICENSE','.env.example'])
  await cp(resolve(root,path),resolve(destination,path),{recursive:true,filter:source=>!source.includes('__pycache__')&&!source.endsWith('.pyc')});
const manifest=JSON.parse(await readFile(resolve(destination,'package.json'),'utf8'));
console.log(`DJQ ${manifest.version} distribution ready in dist/. Run: cd dist && npm start`);
