import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionRows, nextSessionStudent, performanceCounts} from '../src/classroom.js';
const students = [
{id:'a',grade:2,section:'أ',name:'أول'},
{id:'b',grade:2,section:'أ',name:'ثان'},
{id:'c',grade:2,section:'أ',name:'ثالث'},
{id:'other',grade:2,section:'ب',name:'خارج'},
];
const current = {id:'draft',sessionId:'session',studentId:'a',grade:2,rosterIds:['a','b','c','other'],sectionAtTest:'أ'};
const state = () => ({students:structuredClone(students),results:[],drafts:[structuredClone(current)]});
test('next student excludes completed, skipped, archived and different section records',()=>{
const s=state();
assert.equal(nextSessionStudent(s,current).id,'b');
s.results.push({...current,id:'done',studentId:'b',completedAt:'2026-10-20T12:00:00Z'});
assert.equal(nextSessionStudent(s,current).id,'c');
s.drafts.push({...current,id:'skip',studentId:'c',deferred:true});
assert.equal(nextSessionStudent(s,current),null);
s.drafts.pop();s.students[2].archived=true;
assert.equal(nextSessionStudent(s,current),null);
});
test('other sessions do not make a student completed in the current session',()=>{
const s=state();s.results.push({...current,sessionId:'older',studentId:'b'});
assert.equal(nextSessionStudent(s,current).id,'b');
});
test('session roster does not include unrelated students or other-session results',()=>{
const s=state();s.drafts[0].rosterIds=['a','b','c'];
s.results=[{...current,id:'result',studentId:'a',completedAt:'2026-10-20T12:00:00Z'}, {...current,id:'other-result',sessionId:'older',studentId:'b',completedAt:'2026-10-20T12:00:00Z'}];
const rows=sessionRows(s,'session');
assert.equal(rows.length,3);assert.equal(rows.filter(x=>x.result).length,1);
assert.equal(rows[1].result,null);assert.deepEqual(sessionRows(s,''),[]);
});
test('performance distribution preserves each chosen label and excludes missing answers',()=>{
assert.deepEqual(performanceCounts({cards:[{id:'a'},{id:'b'},{id:'c'},{id:'d'},{id:'e'}],answers:{a:{score:'excellent'},b:{score:'advanced'},c:{score:'proficient'},d:{score:'incorrect'}}}),{excellent:1,advanced:1,proficient:1,incorrect:1});
});
