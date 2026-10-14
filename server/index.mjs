import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { RoomStore, RoomError } from './rooms.mjs';
import { exportReplay } from '../shared/rules.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const staticFiles=new Map([
  ['/', ['public/index.html','text/html; charset=utf-8']],
  ['/app.mjs',['public/app.mjs','text/javascript; charset=utf-8']],
  ['/network.mjs',['public/network.mjs','text/javascript; charset=utf-8']],
  ['/i18n.mjs',['public/i18n.mjs','text/javascript; charset=utf-8']],
  ['/style.css',['public/style.css','text/css; charset=utf-8']],
  ['/favicon.svg',['public/favicon.svg','image/svg+xml']],
  ['/shared/rules.mjs',['shared/rules.mjs','text/javascript; charset=utf-8']]
]);
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}
function json(res,status,data) {
  if(res.destroyed||res.writableEnded) return;
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
function body(req) {
  if((req.headers['content-type']??'').split(';')[0].trim()!=='application/json') throw new RoomError('JSON_REQUIRED',415);
  return new Promise((resolve,reject)=>{
    let size=0,chunks=[],done=false;
    req.on('data',chunk=>{
      if(done) return;size+=chunk.length;
      if(size>8192) {done=true;chunks=[];reject(new RoomError('BODY_TOO_LARGE',413));return;}
      chunks.push(chunk);
    });
    req.on('end',()=>{
      if(done) return;done=true;
      try {const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(!value||typeof value!=='object'||Array.isArray(value)) throw Error();resolve(value);
      } catch {reject(new RoomError('INVALID_JSON'));}
    });
    req.on('error',()=>{if(!done){done=true;reject(new RoomError('REQUEST_ABORTED'));}});
  });
}

export function createApp({store=new RoomStore(),requestLimit=240,creationLimit=12,
  publicOrigin=process.env.PUBLIC_ORIGIN??'',trustProxy=process.env.TRUST_PROXY==='1'}={}) {
  if(publicOrigin && new URL(publicOrigin).origin!==publicOrigin) throw Error('PUBLIC_ORIGIN must be an origin without a trailing slash');
  const requests=new Map(),creations=new Map(),sockets=new Set();
  const rate=(map,key,limit,windowMs)=>{
    const now=Date.now();let bucket=map.get(key);
    if(!bucket||now>=bucket.until) {
      if(map.size>=10000&&!map.has(key)) throw new RoomError('SERVER_BUSY',503);
      bucket={count:0,until:now+windowMs};map.set(key,bucket);
    }
    if(++bucket.count>limit) throw new RoomError('RATE_LIMIT',429);
  };
  const server=http.createServer(async(req,res)=>{
    securityHeaders(res);
    try {
      if(!['GET','HEAD','POST'].includes(req.method)) throw new RoomError('METHOD_NOT_ALLOWED',405);
      const url=new URL(req.url,'http://localhost'),pathname=url.pathname;
      if(pathname.startsWith('/api/')) {
        res.setHeader('Cache-Control','no-store');
        const forwarded=req.headers['x-real-ip'];
        const ip=trustProxy&&typeof forwarded==='string'&&/^[\da-fA-F:.]{3,45}$/.test(forwarded)?forwarded:(req.socket.remoteAddress??'unknown');
        rate(requests,ip,requestLimit,60000);
        if(req.method==='HEAD') throw new RoomError('METHOD_NOT_ALLOWED',405);
        if(req.method==='POST') {
          const origin=req.headers.origin,expected=publicOrigin||`http://${req.headers.host}`;
          if((origin&&origin!==expected)||req.headers['sec-fetch-site']==='cross-site') throw new RoomError('ORIGIN_DENIED',403);
        }
        if(pathname==='/api/health'&&req.method==='GET') {json(res,200,{ok:true,version:'1.0.0'});return;}
        if(pathname==='/api/rooms'&&req.method==='POST') {
          rate(creations,ip,creationLimit,600000);json(res,201,store.create(await body(req)));return;
        }
        const match=pathname.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})(?:\/(join|commands|events|replay))?$/);
        if(!match) throw new RoomError('NOT_FOUND',404);
        const [,code,action]=match;
        if(action==='join'&&req.method==='POST') {
          rate(creations,ip,creationLimit,600000);json(res,201,store.join(code,(await body(req)).name));return;
        }
        const auth=req.headers.authorization??'',token=auth.startsWith('Bearer ')?auth.slice(7):'';
        const {seat}=store.authorize(code,token);
        if(!action&&req.method==='GET') {json(res,200,store.snapshot(code,seat));return;}
        if(action==='commands'&&req.method==='POST') {json(res,200,store.command(code,token,await body(req)));return;}
        if(action==='replay'&&req.method==='GET') {
          const state=store.snapshot(code,seat);if(!state.game) throw new RoomError('GAME_NOT_ACTIVE',409);
          res.setHeader('Content-Disposition',`attachment; filename="djq-${code}.json"`);
          json(res,200,exportReplay(state.game,state.players.map(p=>p?.name??'')));return;
        }
        if(action==='events'&&req.method==='GET') {
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store',
            'Connection':'keep-alive','X-Accel-Buffering':'no'});
          res.flushHeaders();req.socket.setTimeout(0);
          const send=state=>{
            if(res.destroyed||res.writableLength>262144) {res.destroy();return;}
            res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
          };
          const disconnect=store.connect(code,token,send,reason=>{if(reason&&!res.destroyed) res.write(`event: fatal\ndata: ${JSON.stringify({error:reason})}\n\n`);res.end();});
          const heartbeat=setInterval(()=>{
            if(res.writableLength>262144) res.destroy();else res.write(': heartbeat\n\n');
          },15000);heartbeat.unref();
          res.on('close',()=>{clearInterval(heartbeat);disconnect();});return;
        }
        throw new RoomError('METHOD_NOT_ALLOWED',405);
      }
      if(req.method==='POST') throw new RoomError('METHOD_NOT_ALLOWED',405);
      const file=staticFiles.get(pathname);if(!file) throw new RoomError('NOT_FOUND',404);
      const content=await readFile(resolve(root,file[0]));
      res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-cache','Content-Length':content.length});
      res.end(req.method==='HEAD'?undefined:content);
    } catch(error) {
      if(res.headersSent) {res.end();return;}
      const status=error instanceof RoomError?error.status:500;
      if(status===429) res.setHeader('Retry-After','60');
      if(status===500) console.error('Request failed:',error.code??error.name);
      json(res,status,{error:status===500?'INTERNAL_ERROR':error.message});
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxConnections=600;
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  const timer=setInterval(()=>{
    store.tick();const now=Date.now();
    for(const map of [requests,creations]) for(const [key,bucket] of map) if(now>=bucket.until) map.delete(key);
  },500);timer.unref();
  const shutdown=()=>{clearInterval(timer);store.close();for(const socket of sockets) socket.destroy();};
  return {server,store,shutdown};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const port=Number(process.env.PORT??3000),host=process.env.HOST??'127.0.0.1';
  if(!Number.isInteger(port)||port<1||port>65535) throw Error('PORT must be between 1 and 65535');
  const app=createApp();
  app.server.listen(port,host,()=>console.log(`DJQ v1.0.0 listening on http://${host}:${port}`));
  app.server.on('error',error=>{console.error(error.message);app.shutdown();process.exitCode=1;});
  for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{app.shutdown();app.server.close();});
}
