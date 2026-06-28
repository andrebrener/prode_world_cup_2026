import { createClient } from "@libsql/client";
import fs from "fs"; import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../../..");
for (const line of fs.readFileSync(path.join(REPO,".env.local"),"utf8").split("\n")){const m=line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const c=createClient({url:process.env.TURSO_DATABASE_URL!,authToken:process.env.TURSO_AUTH_TOKEN});
const pool=(await c.execute({sql:`SELECT id,name,slug FROM pools WHERE slug='kbarulo-fun'`})).rows[0] as any;
const nameById:Record<string,string>={};
for(const r of (await c.execute({sql:`SELECT p.id,p.name FROM pool_members m JOIN participants p ON p.id=m.participant_id WHERE m.pool_id=?`,args:[pool.id]})).rows as any[]) nameById[r.id]=r.name;
const types=(await c.execute({sql:`SELECT card_type, count(*) n FROM fun_cards WHERE pool_id=? GROUP BY card_type ORDER BY n DESC`,args:[pool.id]})).rows;
console.log("CARD TYPES:", JSON.stringify(types.map((t:any)=>`${t.card_type}:${t.n}`)));
// swaps / attacks played, with dates
const atks=(await c.execute({sql:`SELECT participant_id,target_participant_id,card_type,status,reflected,draw_date FROM fun_cards WHERE pool_id=? AND target_participant_id IS NOT NULL ORDER BY draw_date`,args:[pool.id]})).rows as any[];
console.log("\nATAQUES/SOCIALES jugados (por fecha):");
for(const a of atks){
  const res = a.status==='blocked'?'BLOCKED':a.reflected?'REFLECTED':'hit';
  console.log(`${a.draw_date} | ${a.card_type.padEnd(14)} | ${(nameById[a.participant_id]||'?').padEnd(12)} -> ${(nameById[a.target_participant_id]||'?').padEnd(12)} | ${res}`);
}
// rank timeline
const rk=(await c.execute({sql:`SELECT date,participant_id,rank,total FROM pool_day_rank WHERE pool_id=? ORDER BY date,rank`,args:[pool.id]})).rows as any[];
const dates=[...new Set(rk.map((r:any)=>r.date))].sort();
console.log("\nTABLA por fecha (rank+1):");
const byDate:Record<string,any[]>={};
for(const r of rk){(byDate[r.date]??=[]).push(r);}
for(const d of dates){
  const order=byDate[d].sort((a:any,b:any)=>a.rank-b.rank).map((r:any)=>`${r.rank+1}.${nameById[r.participant_id]||'?'}`);
  console.log(`${d}: ${order.join("  ")}`);
}
