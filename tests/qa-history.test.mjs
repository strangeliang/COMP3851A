import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create, act} from 'react-test-renderer';
import {loadSource} from './helpers.mjs';
import {groupQAHistory} from '../src/utils/qaHistory.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const cid='a'.repeat(36);
const row=(id,role,order,extra={})=>({id,owner_id:1,course_id:'course',kind:'qa',created_at:`2026-10-28 10:00:0${order}`,
  payload:{role,text:role==='User'?'My question':'The answer',conversationId:cid,messageOrder:order,scopeKey:'scope'},...extra});

test('Q&A groups explicit conversation messages, orders follow-ups and never guesses legacy links',()=>{
  const rows=[row('a2','AI',3),row('q2','User',2),row('a1','AI',1),row('q1','User',0),
    row('legacy-q','User',0,{payload:{role:'User',text:'Earlier question'}}),row('legacy-a','AI',1,{payload:{role:'AI',text:'Earlier answer'}}),
    row('other-user','AI',0,{owner_id:2}),row('other-course','User',0,{course_id:'other'}),
    row('other-scope','User',0,{payload:{...row('x','User',0).payload,scopeKey:'different'}})];
  const grouped=groupQAHistory(rows);
  assert.equal(grouped.length,6);
  const conversation=grouped.find(record=>record.messageRecords?.length===4);
  assert.equal(conversation.id,'q1');
  assert.deepEqual(conversation.messageRecords.map(record=>record.id),['q1','a1','q2','a2']);
  assert.equal(conversation.created_at,'2026-10-28 10:00:03');
  assert.equal(groupQAHistory([...rows].reverse()).find(record=>record.messageRecords?.length===4).id,'q1');
  assert.equal(rows.length,9,'Grouping must not mutate stored message rows');
});

test('history shows a whole conversation and deletes/restores all its messages in one action',async()=>{
  let renderer,active=[row('a','AI',1),row('q','User',0)],deleted=[];const calls=[];
  const {default:History}=await loadSource("export {default} from './src/pages/student/HistoryPage.jsx'",{
    '../../layouts/StudentLayout':({children})=>children,
    '../../state/LanguageContext':{useLanguage:()=>({language:'en'})},
    '../../state/AppDataContext':{useAppData:()=>({studentCourses:[],summaryRecords:[],currentChatRecords:[],quizAttempts:[],refreshStudyHistory:async()=>{}})},
    '../../services/apiClient':{apiRequest:async(url,options={})=>{
      calls.push({url,method:options.method||'GET'});
      if(options.method==='DELETE'){deleted=active;active=[];return{ok:true};}
      if(url.endsWith('/restore')){active=deleted;deleted=[];return{record:active[0],reviews:[]};}
      return{records:active,reviews:[],deletedRecords:deleted};
    }},
  });
  try{
    await act(async()=>{renderer=create(React.createElement(History));});
    assert.equal(renderer.root.findAllByProps({className:'history-record-open'}).length,1);
    await act(async()=>renderer.root.findByProps({className:'history-record-open'}).props.onClick());
    assert.equal(renderer.root.findAllByProps({className:'history-qa-message'}).length,2);
    assert.match(JSON.stringify(renderer.toJSON()),/My question/);assert.match(JSON.stringify(renderer.toJSON()),/The answer/);
    await act(async()=>renderer.root.findByProps({className:'history-delete-button'}).props.onClick());
    assert.equal(renderer.root.findAllByProps({className:'history-record-open'}).length,0);
    await act(async()=>renderer.root.findByProps({className:'history-undo-banner'}).findByType('button').props.onClick());
    assert.equal(renderer.root.findAllByProps({className:'history-record-open'}).length,1);
    assert.deepEqual(calls.filter(c=>c.method!=='GET'),[{url:'/history/q',method:'DELETE'},{url:'/history/q/restore',method:'POST'}]);
  }finally{if(renderer)await act(async()=>renderer.unmount());}
});

test('an unanswered saved question is not presented as a successful AI response',async()=>{
  let renderer;
  const {default:History}=await loadSource("export {default} from './src/pages/student/HistoryPage.jsx'",{
    '../../layouts/StudentLayout':({children})=>children,
    '../../state/LanguageContext':{useLanguage:()=>({language:'en'})},
    '../../state/AppDataContext':{useAppData:()=>({studentCourses:[],summaryRecords:[],currentChatRecords:[],quizAttempts:[]})},
    '../../services/apiClient':{apiRequest:async()=>({records:[row('q','User',0)],reviews:[],deletedRecords:[]})},
  });
  try{
    await act(async()=>{renderer=create(React.createElement(History));});
    await act(async()=>renderer.root.findByProps({className:'history-record-open'}).props.onClick());
    assert.match(JSON.stringify(renderer.toJSON()),/No AI reply is saved/);
    assert.equal(renderer.root.findAllByProps({className:'history-qa-message'}).length,1);
  }finally{if(renderer)await act(async()=>renderer.unmount());}
});
