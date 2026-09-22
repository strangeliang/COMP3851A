const express=require('express');
const {randomUUID}=require('crypto');
const {StudyError}=require('../services/studyContracts');
const {createRateLimiter}=require('../services/sessionService');
const {createTicketRepository}=require('../services/ticketRepository');
const {createRecoveryRepository}=require('../services/recoveryRepository');
const {secretPattern}=require('../services/supportAiContracts');
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
function createTicketRoutes({database,authenticate,gemini}) {
  const router=express.Router();
  const repo=createTicketRepository(database.db);
  const recovery=createRecoveryRepository(database.db);
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
    const [regular,requests]=await Promise.all([repo.list(req.user),recovery.list(req.user)]);
    const tickets=[...regular.tickets,...requests.tickets].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
    res.json({tickets:tickets.slice(0,200),hasMore:regular.hasMore||requests.hasMore||tickets.length>200});
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
