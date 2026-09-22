import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {create,act} from 'react-test-renderer';
import {loadSource} from './helpers.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
test('file picker and drag/drop share a validated queue; upload is explicit and remains course-scoped',async()=>{
  let renderer;const uploads=[];
  const state={studentCourses:[{id:'course',code:'CS',name:'Test'}],materials:[],currentCourse:{id:'course',code:'CS'},currentCourseId:'course',courseMaterials:[],
    selectCourse(){},deleteMaterial(){},cancelUpload(){},retryCourses(){},retryMaterials(){},
    uploadState:{pending:false},courseState:{loading:false},materialState:{loading:false},
    addMaterials:async(files,courseId)=>{uploads.push({files,courseId});return {ok:true,message:'Uploaded'};}};
  const {default:Upload}=await loadSource("export {default} from './src/pages/student/UploadPage.jsx'",{
    '../../state/AppDataContext':{useAppData:()=>state},
    '../../state/LanguageContext':{useLanguage:()=>({language:'en'})},
    '../../layouts/StudentLayout':({children})=>React.createElement('main',{},children),
    '../../components/Toolbar':()=>null,
  });
  const file=(name,size=100)=>({name,size,lastModified:1});
  const zone=()=>renderer.root.findAllByType('section').find(n=>n.props.onDrop);
  const view=()=>JSON.stringify(renderer.toJSON());
  const drop=async(files,items=[])=>{
    let prevented=false;
    await act(async()=>zone().props.onDrop({preventDefault(){prevented=true;},stopPropagation(){},dataTransfer:{files,items}}));
    assert.ok(prevented,'Dropping must prevent browser navigation');
  };
  try {
    await act(async()=>{renderer=create(React.createElement(Upload));});
    await act(async()=>zone().props.onDragEnter({preventDefault(){},stopPropagation(){}}));
    assert.match(zone().props.className,/drag-active/);
    const pdf=file('notes.pdf');await drop([pdf]);
    assert.doesNotMatch(zone().props.className,/drag-active/);
    assert.equal(uploads.length,0,'Drop must not upload automatically');
    assert.match(view(),/notes.pdf/);
    await drop([pdf]);assert.equal(renderer.root.findAllByProps({'aria-label':'Remove notes.pdf'}).length,1);
    const picker=renderer.root.findByProps({type:'file'});
    await act(async()=>picker.props.onChange({target:{files:[file('slides.pptx')],value:'chosen'}}));
    assert.match(view(),/slides.pptx/);assert.match(view(),/notes.pdf/);
    await drop([]);assert.match(view(),/browser link or text/);
    await drop([file('folder')],[{webkitGetAsEntry:()=>({isDirectory:true})}]);assert.match(view(),/not folders/);
    await drop([file('legacy.ppt')]);assert.match(view(),/Save old PPT/);
    await drop([file('large.pdf',11000000)]);assert.match(view(),/at most 10 MB/);
    await drop([file('a.txt'),file('b.txt')]);assert.match(view(),/select up to 3 files/);
    assert.equal(renderer.root.findAllByType('button').filter(b=>b.props['aria-label']?.startsWith('Remove ')).length,2,'Rejected batch preserves queue');
    await act(async()=>renderer.root.findByProps({'aria-label':'Remove slides.pptx'}).props.onClick());
    await act(async()=>renderer.root.findAllByType('button').find(b=>b.children.includes('Upload All')).props.onClick());
    assert.equal(uploads.length,1);assert.equal(uploads[0].courseId,'course');assert.deepEqual(uploads[0].files,[pdf]);
    assert.equal(renderer.root.findAllByProps({'aria-label':'Remove notes.pdf'}).length,0);
    state.uploadState.pending=true;await act(async()=>renderer.update(React.createElement(Upload)));
    await drop([pdf]);assert.equal(renderer.root.findAllByProps({'aria-label':'Remove notes.pdf'}).length,0);
    state.uploadState.pending=false;state.currentCourse=null;await act(async()=>renderer.update(React.createElement(Upload)));
    await drop([pdf]);assert.match(view(),/Select a course/);
    state.currentCourse={id:'course'};await act(async()=>renderer.update(React.createElement(Upload)));
    await drop([pdf]);assert.match(view(),/notes.pdf/);
    state.currentCourseId='other';await act(async()=>renderer.update(React.createElement(Upload)));
    assert.equal(renderer.root.findAllByProps({'aria-label':'Remove notes.pdf'}).length,0,'Changing course clears queued files');
    const longName='very-long-course-material-name-'.repeat(8)+'.pdf';
    await drop([file(longName),pdf]);
    const remove=renderer.root.findByProps({'aria-label':`Remove ${longName}`});
    assert.ok(remove.children.includes('Remove'),'Remove has a visible text label');
    assert.equal(remove.parent.props.className,'upload-queue-item','Button is outside the filename text');
    await act(async()=>renderer.root.findAllByType('button').find(b=>b.children.includes('Clear pending files')).props.onClick());
    assert.equal(renderer.root.findAllByType('button').filter(b=>b.props['aria-label']?.startsWith('Remove ')).length,0);
    assert.equal(uploads.length,1,'Clearing queue must not trigger another upload');
  } finally {if(renderer)await act(async()=>renderer.unmount());}
});
