import { createClient } from "@libsql/client";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../../..");
for (const line of fs.readFileSync(path.join(REPO,".env.local"),"utf8").split("\n")){const m=line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const c=createClient({url:process.env.TURSO_DATABASE_URL!,authToken:process.env.TURSO_AUTH_TOKEN});
const pool=(await c.execute({sql:`SELECT id FROM pools WHERE slug='kbarulo-fun'`})).rows[0] as any;
const nameById:Record<string,string>={};
for(const r of (await c.execute({sql:`SELECT p.id,p.name FROM pool_members m JOIN participants p ON p.id=m.participant_id WHERE m.pool_id=?`,args:[pool.id]})).rows as any[]) nameById[r.id]=r.name;
const imp=['game_is_game','caparazon','golpe','remontada','duelo','vendetta'];
const rows=(await c.execute({sql:`SELECT participant_id,target_participant_id,card_type,status,reflected,draw_date FROM fun_cards WHERE pool_id=? AND card_type IN (${imp.map(()=>'?').join(',')}) ORDER BY draw_date`,args:[pool.id,...imp]})).rows as any[];
for(const r of rows){const res=r.status==='blocked'?'BLOCKED':r.reflected?'REFLECTED':r.status==='held'?'(en mano)':'hit';
  console.log(`${r.draw_date} | ${r.card_type.padEnd(13)} | quien:${(nameById[r.participant_id]||'?').padEnd(12)} | target:${(nameById[r.target_participant_id]||'-').padEnd(12)} | ${res}`);}
