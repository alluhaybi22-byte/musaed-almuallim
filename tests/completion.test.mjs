import test from 'node:test';
import assert from 'node:assert/strict';
import {completedSkills, completionKey, pendingPlanCards, eligibleRoster, instantiatePlan, matchingDraft, planSignature} from '../src/completion.js';
import {lessonAssessmentSkills, lessonAssessmentCards} from '../src/lesson-assessment.js';
import {lessonReadingCards, lessonReadingSkills} from '../src/reading-lessons.js';
import {emptyState, validateBackup, mergeBackup} from '../src/domain.js';
import {nextSessionStudent} from '../src/classroom.js';
const cards=(lesson,level='single')=>lessonReadingCards(lessonReadingSkills(lesson).find(s=>s.readingLevel===level));
const plan=(lessons=['g2-u1-l2'],level='single')=>({grade:2,semester:1,unit:1,cards:lessons.flatMap(l=>cards(l,level))});
const students=['a','b','c'].map(id=>({id,name:'طالب '+id,grade:2,section:'أ'}));
const state=()=>({...emptyState(),students:structuredClone(students)});
const result=(studentId,p,score='proficient',id='result')=>({id,studentId,...p,cards:instantiatePlan({results:[]},p,studentId).cards,answers:Object.fromEntries(instantiatePlan({results:[]},p,studentId).cards.map(c=>[c.id,{score}])),startedAt:'2026-10-20T12:00:00Z',completedAt:'2026-10-20T12:05:00Z'});
test('a completed sentence hides its student across sessions and sentence variants, even if incorrect',()=>{
 const s=state(),p=plan();s.results=[result('a',p,'incorrect')];
 assert.deepEqual(eligibleRoster(s,p,'أ').map(x=>x.id),['b','c']);
 assert.equal(pendingPlanCards(s,plan(['g2-u1-l2'],'sentences'),'a').length,0);
 assert.ok(pendingPlanCards(s,plan(['g2-u1-l2'],'words'),'a').length);
});
test('the same lesson keeps listening, dictation, words and sentences independent',()=>{
 const s=state(),p=plan();s.results=[result('a',p)];
 for(const kind of ['lesson-listening','lesson-dictation']){
  const skill=lessonAssessmentSkills('g2-u1-l2').find(x=>x.kind===kind);
  const q={...p,cards:lessonAssessmentCards(skill)};
  assert.ok(eligibleRoster(s,q,'أ').some(x=>x.id==='a'));
  s.results.push(result('a',q,'assisted',kind));
  assert.ok(!eligibleRoster(s,q,'أ').some(x=>x.id==='a'));
 }
});
test('partial, skipped, untaught or unassessed records do not hide students',()=>{
 const s=state(),p=plan(['g2-u1-l2'],'words');
 for(const score of ['not_taught','not_assessed']){
  s.results=[result('a',p,score)];assert.equal(eligibleRoster(s,p,'أ').length,3);
 }
 const partial=result('a',p);delete partial.answers[partial.cards[0].id];s.results=[partial];
 assert.equal(eligibleRoster(s,p,'أ').length,3);
 s.results=[];s.drafts=[{...result('a',plan()),completedAt:undefined,deferred:true}];
 assert.equal(eligibleRoster(s,plan(),'أ').length,3);
});
test('two lessons keep only each student\'s missing lesson, regardless of selection order',()=>{
 const s=state(),first=plan(['g2-u1-l1']),both=plan(['g2-u1-l1','g2-u1-l2']);
 s.results=[result('a',first),result('b',both,'proficient','both')];
 assert.deepEqual(eligibleRoster(s,both,'أ').map(x=>x.id),['a','c']);
 assert.deepEqual(instantiatePlan(s,both,'a').cards.map(c=>c.lessonId),['g2-u1-l2']);
 assert.equal(instantiatePlan(s,both,'c').cards.length,2);
 assert.equal(planSignature(both),planSignature({...both,cards:[...both.cards].reverse()}));
});
test('different grade, semester, unit, lesson and section are not treated as the same assessment',()=>{
 const p=plan(),s=state();s.results=[result('a',p)];
 for(const change of [{grade:3},{semester:2},{unit:2}])assert.ok(pendingPlanCards(s,{...p,...change},'a').length);
 assert.ok(pendingPlanCards(s,plan(['g2-u1-l1']),'a').length);
 assert.equal(eligibleRoster(s,p,'ب').length,0);
});
test('next student ignores completed results from other sessions while preserving roster order',()=>{
 const s=state(),p=plan();s.results=[result('b',p)];
 const current={studentId:'a',grade:2,sessionId:'new',rosterIds:['a','b','c'],sessionTemplate:p};
 assert.equal(nextSessionStudent(s,current).id,'c');
 s.drafts=[{sessionId:'new',studentId:'c',deferred:true}];assert.equal(nextSessionStudent(s,current),null);
});
test('legacy reading results and a restored backup still prevent duplicate testing',()=>{
 const s=state(),p=plan();s.results=[result('a',p)];
 const backup=validateBackup({app:'al-musaed',...s});
 const restored=mergeBackup(emptyState(),JSON.parse(JSON.stringify(backup)));
 assert.equal(completedSkills(restored.results,'a').size,1);
 assert.deepEqual(eligibleRoster(restored,p,'أ').map(x=>x.id),['b','c']);
});
test('saved partial work can be resumed only for the same lesson and skill scope',()=>{
 const s=state(),p=plan();s.drafts=[{id:'saved',studentId:'a',...p,sessionTemplate:p,answers:{}}];
 assert.equal(matchingDraft(s,p,'a').id,'saved');
 assert.equal(matchingDraft(s,plan(['g2-u1-l1']),'a'),null);
 s.results=[result('a',p)];assert.equal(matchingDraft(s,p,'a'),null);
});
test('new lesson listening and dictation use the selected lesson and do not expose dictation words',()=>{
 for(const id of ['g2-u1-l1','g2-u1-l2']){
  const ss=lessonAssessmentSkills(id);
  const d=lessonAssessmentCards(ss.find(s=>s.kind==='lesson-dictation'));
  assert.equal(d.length,5);assert.ok(d.every(c=>c.lessonId===id && c.teacherText && !c.display.includes(c.teacherText)));
  const l=lessonAssessmentCards(ss.find(s=>s.kind==='lesson-listening'));
  assert.equal(l.length,3);assert.ok(l.every(c=>c.lessonId===id && c.teacherText && !c.audioPath));
  if(id==='g2-u1-l2') assert.ok(l[0].teacherText.includes('مَكْتَبَةِ الْمَدْرَسَةِ'));
 }
});
