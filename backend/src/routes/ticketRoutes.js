const express=require('express');
const {randomUUID}=require('crypto');
const {StudyError}=require('../services/studyContracts');
const {createRateLimiter}=require('../services/sessionService');
const {createTicketRepository}=require('../services/ticketRepository');
const {createRecoveryRepository}=require('../services/recoveryRepository');
const {secretPattern}=require('../services/supportAiContracts');
const {createSupportNotifications}=require('../services/supportNotifications');
const categories=['account','upload','quiz','review','other'];
const statuses=['Open','In progress','Resolved'];
// Defence in depth. This rejects common credentials; it cannot detect every possible secret.
function body(req,keys) {
  if(!req.body||Array.isArray(req.body)||typeof req.body!=='object'||Object.keys(req.body).some(k=>!keys.includes(k)))
    throw new StudyError(400,'INVALID_TICKET','Unexpected ticket fields.');
  return req.body;
}
function text(value,min,max) {
  if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new StudyError(400,'INVALID_TICKET',`Enter between ${min} and ${max} characters.`);
  if(secretPattern.test(value))throw new StudyError(400,'SENSITIVE_CONTENT','Remove passwords, verification codes and API keys before submitting.');
  return value.trim();
}
function clientId(value) {
  if(typeof value!=='string'||!/^[a-f0-9-]{36}$/i.test(value))throw new StudyError(400,'INVALID_TICKET','A valid request ID is required.');
  return value;
}
function createTicketRoutes({database,authenticate,gemini,mailer}) {
  const router=express.Router();
  const repo=createTicketRepository(database.db);
  const recovery=createRecoveryRepository(database.db);
  const notifications=createSupportNotifications(database.db,mailer);
  const recoveryLimit=createRateLimiter(5,10*60*1000);
  const repository=req=>req.params.id?.startsWith('RECOVERY-') ? recovery : repo;
  router.post('/auth/recovery-request',async(req,res)=>{
    recoveryLimit(req.ip);
    const b=body(req,['clientId','accountName','email','consent']);
    if(b.consent!==true || typeof b.accountName!=='string' || !b.accountName.trim() || b.accountName.trim().length>80
      || [...b.accountName].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127) || secretPattern.test(b.accountName)
      || typeof b.email!=='string' || b.email.length>254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(b.email.trim()))
      throw new StudyError(400,'INVALID_RECOVERY','Enter your account name and email, and agree to share them with support. Do not include credentials.');
    await recovery.submit({id:`RECOVERY-${randomUUID()}`,clientId:clientId(b.clientId),accountName:b.accountName.trim(),email:b.email.trim().toLowerCase()});
    // No user lookup, account existence, ticket ID, verification token or credentials in this response.
    res.status(202).json({ok:true,message:'Your request has been received for review. This does not confirm an account exists. No email has been sent and no password has been changed.'});
  });
  const limit=createRateLimiter(40,10*60*1000);
  const aiLimit=createRateLimiter(20,10*60*1000);
  const generating=new Set();
  router.use('/tickets',authenticate,(req,res,next)=>{
    if(!['Student','Admin'].includes(req.user.role))throw new StudyError(403,'FORBIDDEN','Ticket access is not allowed.');
    if(req.method!=='GET')limit(req.user.id);
    next();
  });
  async function owned(req) {
    const result=await repository(req).find(req.params.id,req.user);
    if(!result)throw new StudyError(404,'TICKET_NOT_FOUND','Ticket not found.');
    return result;
  }
  router.get('/tickets',async(req,res)=>{
    const filters={};
    const invalid=()=>{throw new StudyError(400,'INVALID_FILTER','Choose valid search filters and a creation-date range (UTC).');};
    if(Object.keys(req.query).some(k=>!['cursor','q','status','category','from','to','hideEmpty','needsReply','humanOnly','sort'].includes(k)))invalid();
    for(const value of Object.values(req.query))if(typeof value!=='string')invalid();
    if(req.query.q!==undefined){if(req.query.q.length>200)invalid();filters.q=req.query.q.trim();}
    for(const [key,allowed] of [['status',statuses],['category',categories],['sort',['newest','oldest','requested']]]){
      if(req.query[key]!==undefined){if(!allowed.includes(req.query[key]))invalid();filters[key]=req.query[key];}
    }
    for(const key of ['hideEmpty','needsReply','humanOnly']){
      if(req.query[key]!==undefined){if(!['true','false'].includes(req.query[key]))invalid();filters[key]=req.query[key]==='true';}
    }
    if(filters.sort==='requested' && !filters.humanOnly)invalid();
    for(const key of ['from','to']){
      if(req.query[key]!==undefined){
        const value=req.query[key];
        if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)invalid();
        if(key==='from')filters.from=`${value}T00:00:00.000Z`;
        else filters.until=new Date(Date.parse(value)+86400000).toISOString();
      }
    }
    if(filters.from && filters.until && filters.from>=filters.until)invalid();
    const filterKey=JSON.stringify(filters);
    let before = null;
    if (req.query.cursor !== undefined) {
      try {
        if (typeof req.query.cursor !== 'string' || req.query.cursor.length > 2500 || !/^[A-Za-z0-9_-]+$/.test(req.query.cursor)) throw new Error();
        before = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8'));
        if (!before || typeof before.time !== 'string' || before.time.length > 40 || !Number.isFinite(Date.parse(before.time)) || typeof before.id !== 'string' || !before.id || before.id.length > 160) throw new Error();
        if(before.filters!==filterKey)throw new Error();
      } catch { throw new StudyError(400, 'INVALID_CURSOR', 'Refresh the ticket list before loading older conversations.'); }
    }
    const [regular,requests]=await Promise.all([repo.list(req.user,before,filters),recovery.list(req.user,before,filters)]);
    const tickets=[...regular.tickets,...requests.tickets].sort((a,b)=>(filters.sort==='requested'?a.humanRequestedAt.localeCompare(b.humanRequestedAt):filters.sort==='oldest'?a.createdAt.localeCompare(b.createdAt):b.updatedAt.localeCompare(a.updatedAt))||a.id.localeCompare(b.id));
    const page = tickets.slice(0,200);
    const hasMore = regular.hasMore||requests.hasMore||tickets.length>200;
    const last = page.at(-1);
    res.json({tickets:page,hasMore,nextCursor:hasMore && last ? Buffer.from(JSON.stringify({time:filters.sort==='requested'?last.humanRequestedAt:filters.sort==='oldest'?last.createdAt:last.updatedAt,id:last.id,filters:filterKey})).toString('base64url') : null});
  });
  async function current(req) {
    if(req.user.role!=='Student')throw new StudyError(403,'FORBIDDEN','Only students have support login conversations.');
    const ticket=req.session?.conversationId ? await repo.find(req.session.conversationId,req.user) : null;
    if(!ticket)throw new StudyError(409,'LOGIN_CONVERSATION_REQUIRED','Please sign out and sign in again to start your support conversation.');
    return ticket;
  }
  router.get('/tickets/current-session',async(req,res)=>res.json({ticket:await current(req)}));
  router.post('/tickets/current-session/messages',async(req,res)=>{
    const sessionTicket=await current(req);
    const b=body(req,['clientId','text','language','conversationId']);
    if(b.conversationId!==sessionTicket.id)throw new StudyError(409,'SESSION_CHANGED','Your login changed. Refresh the conversation before sending.');
    if(!['en','zh'].includes(b.language))throw new StudyError(400,'INVALID_TICKET','Choose a supported language.');
    const message=text(b.text,1,2000);
    const requestId=clientId(b.clientId);
    if(generating.has(req.user.id))throw new StudyError(409,'AI_IN_PROGRESS','A support reply is already being generated. Please wait.');
    generating.add(req.user.id);
    try {
      let event=await repo.message(sessionTicket.id,requestId,req.user);
      if(event && event.body!==message)throw new StudyError(409,'REQUEST_CONFLICT','This message request was already used.');
      if(event?.answer)return res.json({ticket:await repo.find(sessionTicket.id,req.user)});
      aiLimit(req.user.id);
      const saved=await repo.reply(sessionTicket.id,{eventId:randomUUID(),clientId:requestId,text:message},req.user);
      event=await repo.message(sessionTicket.id,requestId,req.user);
      // Only recent messages from this owned support conversation, never study materials or other accounts.
      const before=saved.replies.slice(0,saved.replies.findIndex(e=>e.id===event.id));
      let total=0;
      const history=before.filter(e=>e.kind==='reply' && !secretPattern.test(e.text)).slice(-10)
        .map(e=>({role:e.role==='AI'||e.role==='FAQ'?'model':'user',text:e.role==='Admin'?`Support administrator (quoted): ${e.text}`:e.text}))
        .reverse().filter(e=>{total+=e.text.length;return e.text.length<=5000 && total<=16000;}).reverse();
      let aiError;
      try {
        const result=await gemini.generate('support',{question:message,language:b.language,history});
        await repo.saveAi(event.id,result.answer,gemini.status().model);
      } catch(error) {
        aiError={code:error instanceof StudyError?error.code:'AI_UNAVAILABLE',message:error instanceof StudyError?error.message:'The AI reply is unavailable. Your message is saved for support.'};
      }
      res.status(201).json({ticket:await repo.find(sessionTicket.id,req.user),...(aiError?{aiError}:{})});
    } finally {generating.delete(req.user.id);}
  });
  router.get('/tickets/:id',async(req,res)=>res.json({ticket:await owned(req)}));
  router.post('/tickets/:id/human-support',async(req,res)=>{
    if(req.user.role!=='Student')throw new StudyError(403,'FORBIDDEN','Only students can request human support.');
    await owned(req);
    const b=body(req,['clientId']);
    const ticket=await repo.requestHuman(req.params.id,`human-${clientId(b.clientId)}`,req.user);
    res.json({ticket});
  });
  router.post('/tickets',async(req,res)=>{
    if(req.user.role!=='Student')throw new StudyError(403,'FORBIDDEN','Only students can submit support tickets.');
    const b=body(req,['clientId','category','title','description']);
    if(!categories.includes(b.category))throw new StudyError(400,'INVALID_TICKET','Choose a valid category.');
    const ticket=await repo.create({id:`ASK-${randomUUID()}`,clientId:clientId(b.clientId),category:b.category,title:text(b.title,1,100),description:text(b.description,10,2000)},req.user);
    if(!ticket)throw new StudyError(409,'REQUEST_CONFLICT','This request ID was already used for different content.');
    res.status(201).json({ticket});
  });
  router.post('/tickets/:id/replies',async(req,res)=>{
    await owned(req);
    const b=body(req,['clientId','text']);
    const ticket=await repository(req).reply(req.params.id,{eventId:randomUUID(),clientId:clientId(b.clientId),text:text(b.text,1,2000)},req.user);
    if(!ticket)throw new StudyError(409,'REQUEST_CONFLICT','This reply request was already used.');
    res.status(201).json({ticket});
  });
  router.post('/tickets/:id/retry-email',async(req,res)=>{
    if(req.user.role!=='Admin')throw new StudyError(403,'FORBIDDEN','Only administrators can retry notifications.');
    await owned(req);
    body(req,[]);
    await notifications.retry(req.params.id);
    res.json({ticket:await owned(req)});
  });
  router.patch('/tickets/:id/status',async(req,res)=>{
    if(req.user.role!=='Admin')throw new StudyError(403,'FORBIDDEN','Only administrators can change ticket status.');
    await owned(req);
    const b=body(req,['status','version']);
    if(!statuses.includes(b.status)||!Number.isSafeInteger(b.version)||b.version<1)throw new StudyError(400,'INVALID_TICKET','Choose a valid status and version.');
    const ticket=await repository(req).status(req.params.id,b.status,b.version,req.user);
    if(!ticket)throw new StudyError(409,'TICKET_CHANGED','This ticket changed. Refresh it before updating the status.');
    res.json({ticket});
  });
  return router;
}
module.exports={createTicketRoutes};
