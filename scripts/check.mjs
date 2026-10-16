import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const html=await readFile(resolve(root,'public/index.html'),'utf8');
if(!html.includes(`<meta name="application-version" content="${manifest.version}">`)||!html.includes(`<title>角斗士棋 v${manifest.version}</title>`)) throw Error('Application title/version must match package.json');
let count=0;
for(const dir of ['shared','server','public','scripts','tests']) {
  for(const entry of await readdir(resolve(root,dir),{withFileTypes:true})) {
    if(!entry.isFile()||!entry.name.endsWith('.mjs')) continue;
    const path=resolve(root,dir,entry.name),result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    if(result.status!==0) {console.error(result.stderr||result.error);process.exit(1);}count++;
    const source=await readFile(path,'utf8');
    if(dir==='public') for(const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const dependency=match[1];
      if(dependency.startsWith('/')) await readFile(resolve(root,dependency.startsWith('/shared/')?dependency.slice(1):`public/${dependency.slice(1)}`));
    }
  }
}
console.log(`Syntax and browser import checks passed: ${count} modules.`);
