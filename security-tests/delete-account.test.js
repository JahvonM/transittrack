import {describe,it,expect} from 'vitest';
import {load,mock,request} from './helpers.js';

// Deleting an account removes both the sign-in and the person, so the same
// email can sign up again later; when the sign-in can't go, nothing goes.
describe('deleteAccount',()=>{
 it('removes the sign-in, then the person',async()=>{
  const c=mock('user');
  const res=await load('deleteAccount',c).default(request({}));
  expect(res.status).toBe(200);
  expect(c.signInsDeleted).toEqual(['mock-auth-caller']);
  expect(c.tables.User.map(u=>u.id)).not.toContain('caller');
  expect(c.writes).toEqual([{name:'User',method:'delete'}]);
 });
 it('deletes nothing and says so when the sign-in is kept',async()=>{
  const c=mock('staff');
  c.asServiceRole.deleteSignIn=async()=>false;
  const res=await load('deleteAccount',c).default(request({}));
  expect(res.status).toBe(409);
  expect((await res.json()).error).toMatch(/couldn't be deleted.*ask the office/i);
  expect(c.writes).toEqual([]);
  expect(c.tables.User.map(u=>u.id)).toContain('caller');
 });
 it('deletes nothing when removing the sign-in fails outright',async()=>{
  const c=mock('user');
  c.asServiceRole.deleteSignIn=async()=>{throw new Error('down');};
  const res=await load('deleteAccount',c).default(request({}));
  expect(res.status).toBe(500);
  expect(c.writes).toEqual([]);
 });
 it('only ever deletes the caller',async()=>{
  const c=mock('user');
  c.tables.User.push({id:'someone',role:'admin',auth_user_id:'mock-auth-other'});
  await load('deleteAccount',c).default(request({id:'someone',user_id:'someone'}));
  expect(c.signInsDeleted).toEqual(['mock-auth-caller']);
  expect(c.tables.User.map(u=>u.id)).toEqual(['someone']);
 });
 it('signed out: 401 and nothing removed',async()=>{
  const c=mock(null);
  const res=await load('deleteAccount',c).default(request({}));
  expect(res.status).toBe(401);
  expect(c.signInsDeleted).toEqual([]);
  expect(c.writes).toEqual([]);
 });
});
