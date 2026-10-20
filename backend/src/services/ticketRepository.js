// Queries always scope student access by the authenticated owner, never a client owner field.
function createTicketRepository(db) {
  const all = (sql, args=[]) => new Promise((resolve,reject) => db.all(sql,args,(e,r) => e?reject(e):resolve(r)));
  const get = async (sql,args=[]) => (await all(sql,args))[0];
  const run = (sql,args=[]) => new Promise((resolve,reject) => db.run(sql,args,function(e) { e?reject(e):resolve(this.changes); }));
  const scope = (user) => user.role==='Admin' ? [1, user.id] : [0,user.id];
  const select = `SELECT t.*,u.name,h.state AS human_state,h.requested_at AS human_requested_at,
    (SELECT COUNT(*) FROM support_events e WHERE e.ticket_id=t.id AND e.kind='reply') AS message_count,
    (SELECT author.role FROM support_events e JOIN users author ON author.id=e.author_id
      WHERE e.ticket_id=t.id AND e.kind='reply' ORDER BY e.created_at DESC,e.rowid DESC LIMIT 1) AS last_author_role
    FROM support_tickets t JOIN users u ON u.id=t.owner_id LEFT JOIN support_handoffs h ON h.ticket_id=t.id`;
  async function find(id,user) {
    const ticket=await get(`${select} WHERE t.id=? AND (?=1 OR t.owner_id=?)`,[id,...scope(user)]);
    if (!ticket) return null;
    const replies=await all(`SELECT e.id,e.kind,e.body AS text,e.created_at AS createdAt,u.name,u.role,f.body AS faq,
      a.body AS ai,a.model AS aiModel,a.created_at AS aiCreatedAt
      FROM support_events e JOIN users u ON u.id=e.author_id LEFT JOIN support_faq_replies f ON f.event_id=e.id
      LEFT JOIN support_ai_replies a ON a.event_id=e.id
      WHERE e.ticket_id=? ORDER BY e.created_at,e.rowid`,[id]);
    return {...map(ticket),replies:replies.flatMap(({faq,ai,aiModel,aiCreatedAt,...event})=>ai
      ? [event,{id:`ai-${event.id}`,kind:'reply',text:ai,createdAt:aiCreatedAt,name:'Ask Me · Gemini',role:'AI',model:aiModel}]
      : faq ? [event,{id:`faq-${event.id}`,kind:'reply',text:faq,createdAt:event.createdAt,name:'Ask Me',role:'FAQ'}] : [event])
      .sort((a,b)=>a.createdAt.localeCompare(b.createdAt))};
  }
  function map(t) {return {id:t.id,userId:t.owner_id,name:t.name,category:t.category,title:t.title,
    description:t.description,status:t.status,version:t.version,createdAt:t.created_at,
    updatedAt:t.updated_at,resolvedAt:t.resolved_at,isLoginConversation:t.id.startsWith('SESSION-'),
    humanSupport:t.human_state || null,humanRequestedAt:t.human_requested_at || null,
    hasMessages:!!t.human_state || !t.id.startsWith('SESSION-') || t.message_count>0,
    needsReply:t.status!=='Resolved' && (t.human_state==='Waiting' || t.last_author_role==='Student' || (!t.last_author_role && !t.id.startsWith('SESSION-')))};}
  return {
    find,
    message: (id,clientId,user) => get(`SELECT e.id,e.body,a.body AS answer FROM support_events e
      JOIN support_tickets t ON t.id=e.ticket_id LEFT JOIN support_ai_replies a ON a.event_id=e.id
      WHERE e.ticket_id=? AND e.author_id=? AND e.client_id=? AND t.owner_id=?`,[id,user.id,clientId,user.id]),
    saveAi: (eventId,answer,model) => run(`INSERT INTO support_ai_replies(event_id,body,model,created_at)
      VALUES(?,?,?,?) ON CONFLICT(event_id) DO NOTHING`,[eventId,answer,model,new Date().toISOString()]),
    requestHuman: async(id,requestId,user) => {
      if(user.role!=='Student')return null;
      await run(`INSERT INTO support_events(id,ticket_id,author_id,client_id,kind,body,created_at)
        SELECT lower(hex(randomblob(16))),id,?,?,'status','Human support requested',?
        FROM support_tickets WHERE id=? AND owner_id=?
        AND NOT EXISTS(SELECT 1 FROM support_handoffs WHERE ticket_id=? AND state IN ('Waiting','In progress'))
        ON CONFLICT(ticket_id,author_id,client_id) DO NOTHING`,
      [user.id,requestId,new Date().toISOString(),id,user.id,id]);
      return find(id,user);
    },
    list: async(user, before = null, filters = {}) => {
      const conditions=['(?=1 OR t.owner_id=?)']; const args=[...scope(user)];
      const add=(sql,...values)=>{conditions.push(sql);args.push(...values);};
      if(filters.q) {
        const term=`%${filters.q.replace(/[\\%_]/g,'\\$&')}%`;
        add(`(t.id LIKE ? ESCAPE '\\' OR t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\'
          OR u.name LIKE ? ESCAPE '\\' OR t.category LIKE ? ESCAPE '\\' OR EXISTS(
          SELECT 1 FROM support_events e LEFT JOIN support_ai_replies a ON a.event_id=e.id
          LEFT JOIN support_faq_replies f ON f.event_id=e.id WHERE e.ticket_id=t.id
          AND (e.body LIKE ? ESCAPE '\\' OR a.body LIKE ? ESCAPE '\\' OR f.body LIKE ? ESCAPE '\\')))`,...Array(8).fill(term));
      }
      if(filters.status)add('t.status=?',filters.status);
      if(filters.category)add('t.category=?',filters.category);
      if(filters.from)add('t.created_at>=?',filters.from);
      if(filters.until)add('t.created_at<?',filters.until);
      if(filters.humanOnly)add("h.state='Waiting'");
      if(filters.hideEmpty)add("(t.id NOT LIKE 'SESSION-%' OR h.state IS NOT NULL OR EXISTS(SELECT 1 FROM support_events e WHERE e.ticket_id=t.id AND e.kind='reply'))");
      if(filters.needsReply)add(`t.status<>'Resolved' AND (h.state='Waiting' OR
        (SELECT author.role FROM support_events e JOIN users author ON author.id=e.author_id
        WHERE e.ticket_id=t.id AND e.kind='reply' ORDER BY e.created_at DESC,e.rowid DESC LIMIT 1)='Student'
        OR (t.id NOT LIKE 'SESSION-%' AND NOT EXISTS(SELECT 1 FROM support_events e WHERE e.ticket_id=t.id AND e.kind='reply')))`);
      const column=filters.sort==='oldest'?'t.created_at':'t.updated_at';
      const ascending=filters.sort==='oldest';
      if(before)add(`(${column}${ascending?'>':'<'}? OR (${column}=? AND t.id>?))`,before.time,before.time,before.id);
      const rows=await all(`${select} WHERE ${conditions.join(' AND ')} ORDER BY ${column} ${ascending?'ASC':'DESC'},t.id ASC LIMIT 201`,args);
      return {tickets:rows.slice(0,200).map(map),hasMore:rows.length>200};
    },
    create: async({id,clientId,category,title,description},user) => {
      const now=new Date().toISOString();
      await run(`INSERT INTO support_tickets(id,client_id,owner_id,category,title,description,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,client_id) DO NOTHING`,[id,clientId,user.id,category,title,description,now,now]);
      const row=await get('SELECT id,category,title,description FROM support_tickets WHERE owner_id=? AND client_id=?',[user.id,clientId]);
      if(row.category!==category||row.title!==title||row.description!==description)return null;
      return find(row.id,user);
    },
    reply: async(id,{eventId,clientId,text,faq},user) => {
      await run(`INSERT INTO support_events(id,ticket_id,author_id,client_id,kind,body,created_at)
        SELECT ?,id,?,?,'reply',?,? FROM support_tickets WHERE id=? AND (?=1 OR owner_id=?)
        ON CONFLICT(ticket_id,author_id,client_id) DO NOTHING`,[eventId,user.id,clientId,text,new Date().toISOString(),id,...scope(user)]);
      const event=await get('SELECT id,body FROM support_events WHERE ticket_id=? AND author_id=? AND client_id=?',[id,user.id,clientId]);
      if(event?.body===text && faq) await run('INSERT INTO support_faq_replies(event_id,body) VALUES(?,?) ON CONFLICT(event_id) DO NOTHING',[event.id,faq]);
      return event?.body===text ? find(id,user) : null;
    },
    status: async(id,status,version,user) => {
      const now=new Date().toISOString();
      const changes=await run(`UPDATE support_tickets SET status=?,version=version+1,updated_by=?,updated_at=?,resolved_at=?
        WHERE id=? AND version=?`,[status,user.id,now,status==='Resolved'?now:null,id,version]);
      return changes ? find(id,user) : null;
    },
  };
}
module.exports={createTicketRepository};
