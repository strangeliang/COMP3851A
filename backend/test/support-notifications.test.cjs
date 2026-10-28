const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { createSchema } = require('../src/config/schema');
const { createTicketRepository } = require('../src/services/ticketRepository');
const { createSupportNotifications } = require('../src/services/supportNotifications');
const { createMailService } = require('../src/services/mailService');

async function setup(t, file = ':memory:') {
  const db = await new Promise((resolve,reject) => { const d = new sqlite3.Database(file,e=>e?reject(e):resolve(d)); });
  const run = (sql,args=[]) => new Promise((resolve,reject) => db.run(sql,args,e=>e?reject(e):resolve()));
  const all = (sql,args=[]) => new Promise((resolve,reject) => db.all(sql,args,(e,rows)=>e?reject(e):resolve(rows)));
  const exec = sql => new Promise((resolve,reject) => db.exec(sql,e=>e?reject(e):resolve()));
  let closed = false;
  const close = async () => { if(!closed) {closed=true;await new Promise((resolve,reject)=>db.close(e=>e?reject(e):resolve()));} };
  t.after(close);
  await exec('PRAGMA foreign_keys=ON'); await createSchema({exec});
  for(const [id,role] of [[1,'Student'],[2,'Student'],[3,'Admin']])await run(`INSERT OR IGNORE INTO users(id,name,email,password_hash,role,status) VALUES(?,?,?,?,?,'Active')`,[id,role,`${id}@example.invalid`,'x'.repeat(60),role]);
  await run('INSERT OR IGNORE INTO verified_emails VALUES(1,1)');
  const student={id:1,role:'Student'},other={id:2,role:'Student'},admin={id:3,role:'Admin'};
  const repo=createTicketRepository(db);
  const create = (owner=student) => repo.create({id:`ASK-${randomUUID()}`,clientId:randomUUID(),title:'Upload problem',description:'My PDF does not finish uploading.',category:'upload'},owner);
  const reply = (id,owner=admin,clientId=randomUUID()) => repo.reply(id,{eventId:randomUUID(),clientId,text:'Please try a smaller PDF.'},owner);
  return {db,run,all,exec,close,student,other,admin,repo,create,reply};
}

test('independent requests enter FIFO queue by handoff time, with stable pagination and scoped follow-ups',async t=>{
  const s=await setup(t);
  const first=await s.create(),second=await s.create();
  assert.equal(first.humanSupport,'Waiting');
  // Earlier login/creation is not necessarily an earlier request for a person.
  await s.run("UPDATE support_tickets SET created_at='2020-01-01T00:00:00.000Z' WHERE id=?",[second.id]);
  await s.run("UPDATE support_handoffs SET requested_at='2026-10-28T01:00:00.000Z' WHERE ticket_id=?",[first.id]);
  await s.run("UPDATE support_handoffs SET requested_at='2026-10-28T02:00:00.000Z' WHERE ticket_id=?",[second.id]);
  const filters={humanOnly:true,sort:'requested'};
  assert.deepEqual((await s.repo.list(s.admin,null,filters)).tickets.map(x=>x.id),[first.id,second.id]);
  assert.equal((await s.repo.list(s.other,null,filters)).tickets.length,0);
  assert.deepEqual((await s.repo.list(s.admin,{id:first.id,time:'2026-10-28T01:00:00.000Z'},filters)).tickets.map(x=>x.id),[second.id]);
  let ticket=await s.reply(first.id);
  assert.equal(ticket.humanSupport,'In progress');
  assert.equal((await s.repo.list(s.admin,null,filters)).tickets.length,1);
  ticket=await s.repo.status(first.id,'Resolved',ticket.version,s.admin);
  const followupId=randomUUID();
  ticket=await s.reply(first.id,s.student,followupId);
  assert.equal(ticket.status,'Open');assert.equal(ticket.humanSupport,'Waiting');assert.equal(ticket.resolvedAt,null);
  const retry=await s.reply(first.id,s.student,followupId);
  assert.equal(retry.humanRequestedAt,ticket.humanRequestedAt);
  assert.equal((await s.repo.find(second.id,s.student)).replies.filter(x=>x.kind==='reply').length,0,'Separate problems have independent replies');
  await createSchema({exec:s.exec});
  assert.equal((await s.repo.find(first.id,s.student)).humanSupport,'Waiting');
});

test('outbox survives reopen, retries safely, deduplicates admin retries and skips unverified recipients',async t=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'support-mail-test-'));
  t.after(()=>fs.rm(folder,{recursive:true,force:true}));
  let s=await setup(t,path.join(folder,'test.db'));
  const ticket=await s.create(),clientId=randomUUID();
  await s.reply(ticket.id,s.admin,clientId);await s.reply(ticket.id,s.admin,clientId);
  assert.equal((await s.all('SELECT * FROM support_email_outbox')).length,1);
  await s.close();s=await setup(t,path.join(folder,'test.db'));
  let time=1000,fail=true;const sent=[];
  const mailer={configured:true,sendSupportReply:async(...args)=>{if(fail)throw Error('secret SMTP password');sent.push(args);}};
  let worker=createSupportNotifications(s.db,mailer,()=>time);
  await worker.drain();
  let [row]=await s.all('SELECT * FROM support_email_outbox');
  assert.equal(row.state,'pending');assert.equal(row.attempts,1);assert.equal(row.last_error,'MAIL_UNAVAILABLE');
  assert.equal(JSON.stringify(row).includes('secret'),false);
  assert.equal((await s.repo.find(ticket.id,s.student)).replies.some(x=>x.role==='Admin'),true,'Failure cannot remove saved reply');
  await worker.drain();assert.equal((await s.all('SELECT * FROM support_email_outbox'))[0].attempts,1,'Backoff is respected');
  time=61001;fail=false;
  worker=createSupportNotifications(s.db,mailer,()=>time);
  await Promise.all([worker.drain(),createSupportNotifications(s.db,mailer,()=>time).drain()]);
  assert.equal(sent.length,1);assert.equal(sent[0][0],'1@example.invalid');assert.equal(sent[0][1],ticket.id);
  [row]=await s.all('SELECT * FROM support_email_outbox');assert.equal(row.state,'sent');
  await worker.retry(ticket.id);await worker.drain();assert.equal(sent.length,1,'Sent emails are not retried');
  const unverified=await s.create(s.other);await s.reply(unverified.id);
  await worker.drain();
  const blocked=(await s.all("SELECT * FROM support_email_outbox WHERE state='skipped'"))[0];
  assert.equal(blocked.last_error,'EMAIL_NOT_VERIFIED');assert.equal(sent.length,1);
  await s.run('INSERT INTO verified_emails VALUES(2,1)');await worker.retry(unverified.id);await worker.drain();
  assert.equal(sent.length,2);assert.equal(sent[1][0],'2@example.invalid');
  await s.close();
});

test('notification failures stop after five tries; stale leases recover and AI/student messages do not send mail',async t=>{
  const s=await setup(t);const ticket=await s.create();
  await s.reply(ticket.id,s.student);
  assert.equal((await s.all('SELECT * FROM support_email_outbox')).length,0);
  const eventId=(await s.all("SELECT id FROM support_events WHERE kind='reply'"))[0].id;
  await s.repo.saveAi(eventId,'AI response','test-model');
  assert.equal((await s.all('SELECT * FROM support_email_outbox')).length,0);
  await s.reply(ticket.id);
  let time=1000;
  const worker=createSupportNotifications(s.db,{configured:false},()=>time);
  for(let i=0;i<5;i++){await worker.drain();time+=3600001;}
  let [row]=await s.all('SELECT * FROM support_email_outbox');assert.equal(row.state,'failed');assert.equal(row.attempts,5);
  await worker.drain();assert.equal((await s.all('SELECT * FROM support_email_outbox'))[0].attempts,5);
  await worker.retry(ticket.id);
  await s.run("UPDATE support_email_outbox SET state='sending',lease_until=?,lease_token='dead-worker'",[time-1]);
  const sent=[];
  await createSupportNotifications(s.db,{configured:true,sendSupportReply:async(...args)=>sent.push(args)},()=>time).drain();
  assert.equal(sent.length,1);[row]=await s.all('SELECT * FROM support_email_outbox');assert.equal(row.state,'sent');
  const disabled=await s.create();await s.reply(disabled.id);await s.run("UPDATE users SET status='Disabled' WHERE id=1");
  await worker.drain();assert.ok((await s.all("SELECT * FROM support_email_outbox WHERE last_error='ACCOUNT_DISABLED'")).length);
});

test('support email uses trusted origin, no conversation content and a provider idempotency key',async()=>{
  const sent=[];
  const mailer=createMailService({provider:'resend',apiKey:'fake',from:'support@example.invalid',baseUrl:'https://study.example.invalid/path',fetchImpl:async(url,options)=>{sent.push({url,...options});return {ok:true};}});
  await mailer.sendSupportReply('student@example.invalid','ASK-123','event-123');
  const message=JSON.parse(sent[0].body);
  assert.deepEqual(message.to,['student@example.invalid']);
  assert.match(message.text,/https:\/\/study.example.invalid\/student\/support\/ASK-123/);
  assert.equal(sent[0].headers['Idempotency-Key'],'support-event-123');
  assert.doesNotMatch(message.text,/token=|password|My PDF/);
});
