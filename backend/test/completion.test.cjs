const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const bcrypt=require('bcryptjs');

test('complete support search and explicit handoff lifecycle are scoped, durable and idempotent',async t=>{
  process.env.STUDY_DATABASE_PATH=':memory:';
  process.env.STUDY_SEED_DEMO='0';
  process.env.NODE_ENV='test';
  const database=require('../src/config/database');
  const {createApp}=require('../src/app');
  await database.initializeDatabase();
  const run=(sql,args=[])=>new Promise((resolve,reject)=>database.db.run(sql,args,e=>e?reject(e):resolve()));
  const password='completion-test-password';
  const student=await database.registerStudent('Student','student@completion.invalid',bcrypt.hashSync(password,4));
  const other=await database.registerStudent('Other','other@completion.invalid',bcrypt.hashSync(password,4));
  const admin=await database.registerStudent('Admin','admin@completion.invalid',bcrypt.hashSync(password,4));
  await run("UPDATE users SET role='Admin' WHERE id=?",[admin.id]);
  const server=createApp({database}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>database.db.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const request=(url,cookie,method='GET',data)=>fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
  async function json(url,cookie,method,data,status=200){const r=await request(url,cookie,method,data);const body=await r.json();assert.equal(r.status,status,JSON.stringify(body));return body;}
  async function login(user){const r=await request('/auth/login',null,'POST',{email:user.email,password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
  const sc=await login(student),oc=await login(other),ac=await login(admin);
  const current=(await json('/tickets/current-session',sc)).ticket;
  const url=`/tickets/${current.id}`;
  const req={clientId:randomUUID()};
  assert.equal((await request(url+'/human-support',oc,'POST',req)).status,404);
  assert.equal((await request(url+'/human-support',ac,'POST',req)).status,403);
  const waiting=(await json(url+'/human-support',sc,'POST',req)).ticket;
  assert.equal(waiting.humanSupport,'Waiting');assert.equal(waiting.needsReply,true);assert.equal(waiting.hasMessages,true);
  assert.deepEqual((await json(url+'/human-support',sc,'POST',req)).ticket,waiting);
  assert.deepEqual((await json(url+'/human-support',sc,'POST',{clientId:randomUUID()})).ticket,waiting,'Double requests do not duplicate events');
  const {createTicketRepository}=require('../src/services/ticketRepository');
  const repo=createTicketRepository(database.db);
  await repo.reply(current.id,{eventId:'ai-question',clientId:randomUUID(),text:'Still need a person'},student);
  await repo.saveAi('ai-question','AI can explain this but cannot close the request','stub');
  assert.equal((await json(url,sc)).ticket.humanSupport,'Waiting');
  assert.equal((await json('/tickets?humanOnly=true&hideEmpty=true',ac)).tickets[0].id,current.id);
  await database.initializeDatabase();
  assert.equal((await repo.find(current.id,student)).humanSupport,'Waiting','Schema initialization preserves handoffs');
  let ticket=(await json(url+'/replies',ac,'POST',{clientId:randomUUID(),text:'A staff member is reviewing your question'},201)).ticket;
  assert.equal(ticket.humanSupport,'In progress');assert.equal(ticket.status,'In progress');
  assert.equal(ticket.replies.find(e=>e.role==='Admin').emailState,'pending');
  assert.equal((await request(url+'/retry-email',sc,'POST',{})).status,403);
  assert.equal((await request('/tickets/ASK-missing/retry-email',ac,'POST',{})).status,404);
  await json(url+'/retry-email',ac,'POST',{});
  assert.equal((await json('/tickets?humanOnly=true',ac)).tickets.length,0);
  assert.equal((await json(url,sc)).ticket.replies.some(e=>e.role==='Admin'),true);
  ticket=(await json(url+'/status',ac,'PATCH',{status:'Resolved',version:ticket.version})).ticket;
  assert.equal(ticket.humanSupport,'Resolved');
  assert.equal((await json(url+'/human-support',sc,'POST',req)).ticket.humanSupport,'Resolved','Old retries cannot reopen resolved requests');
  ticket=(await json(url+'/human-support',sc,'POST',{clientId:randomUUID()})).ticket;
  assert.equal(ticket.humanSupport,'Waiting');assert.equal(ticket.status,'Open');
  assert.equal((await request(url+'/status',ac,'PATCH',{status:'Resolved',version:1})).status,409);

  // Search an old reply without first loading more than 200 newer conversations.
  for(let i=0;i<205;i++)await database.createLoginConversation(`SESSION-search-${String(i).padStart(3,'0')}`,student.id);
  await run("UPDATE support_tickets SET created_at='2026-10-19T00:00:00.000Z',updated_at='2026-10-19T00:00:00.000Z'");
  await run("UPDATE support_tickets SET created_at='2026-10-07T23:59:59.999Z',updated_at='2026-10-07T23:59:59.999Z' WHERE id=?",[current.id]);
  await run("UPDATE support_events SET body='rare-search-phrase 100%_literal' WHERE id='ai-question'");
  assert.equal((await json('/tickets',ac)).tickets.some(x=>x.id===current.id),false);
  const matched=await json('/tickets?q=rare-search-phrase&from=2026-10-07&to=2026-10-07',ac);
  assert.deepEqual(matched.tickets.map(x=>x.id),[current.id]);
  assert.equal((await json('/tickets?q=rare-search-phrase',oc)).tickets.length,0);
  assert.equal((await json('/tickets?q=AI%20can%20explain',ac)).tickets[0].id,current.id);
  assert.equal((await json('/tickets?q=100%25_literal',ac)).tickets.length,1);
  assert.equal((await json('/tickets?q=%25_notthere',ac)).tickets.length,0);
  assert.equal((await json('/tickets?from=2026-10-08&q=rare-search-phrase',ac)).tickets.length,0);
  for(const query of ['from=2026-02-30','from=2026-10-09&to=2026-10-01','q=a&q=b','humanOnly=yes','status=bad'])
    assert.equal((await request('/tickets?'+query,ac)).status,400);
  await run(`INSERT INTO account_recovery_requests(id,client_id,account_name,email,created_at,updated_at)
    VALUES('RECOVERY-search','request-search','Applicant','applicant@example.invalid','2026-10-07T00:00:00.000Z','2026-10-07T00:00:00.000Z')`);
  await run(`INSERT INTO account_recovery_events(id,ticket_id,author_id,client_id,kind,body,created_at)
    VALUES('recovery-note','RECOVERY-search',?,'note-search','reply','rare-search-phrase','2026-10-07T00:00:00.000Z')`,[admin.id]);
  assert.equal((await json('/tickets?q=rare-search-phrase',ac)).tickets.length,2);
  assert.equal((await json('/tickets?q=rare-search-phrase',sc)).tickets.length,1);
  assert.equal((await json('/tickets?q=rare-search-phrase&category=account',ac)).tickets.length,1);
  const first=await json('/tickets?sort=oldest',ac);
  assert.equal(first.tickets.length,200);assert.equal(first.tickets[0].id,'RECOVERY-search');
  const last=await json('/tickets?sort=oldest&cursor='+encodeURIComponent(first.nextCursor),ac);
  assert.equal(new Set([...first.tickets,...last.tickets].map(x=>x.id)).size,208);
  assert.equal(last.hasMore,false);
  // FIFO queue pagination is based on handoff time, not ticket creation time.
  for(let i=0;i<205;i++)await repo.requestHuman(`SESSION-search-${String(i).padStart(3,'0')}`,randomUUID(),student);
  const queue=await json('/tickets?humanOnly=true&sort=requested',ac);
  const queueNext=await json('/tickets?humanOnly=true&sort=requested&cursor='+encodeURIComponent(queue.nextCursor),ac);
  assert.equal(queue.tickets.length,200);
  assert.equal(new Set([...queue.tickets,...queueNext.tickets].map(x=>x.id)).size,206);
  assert.equal(queueNext.hasMore,false);
  assert.equal((await request('/tickets?sort=requested',ac)).status,400);
  assert.equal((await request('/tickets?q=different&sort=oldest&cursor='+encodeURIComponent(first.nextCursor),ac)).status,400);
});
