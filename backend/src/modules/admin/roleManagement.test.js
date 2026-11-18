jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
const {withTransaction}=require('../../config/db');
const {grantAdminRole}=require('./service');

const actor={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',role:'super_admin'};
const targetId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('administrator role assignment',()=>{
 let tx;
 beforeEach(()=>{
  jest.clearAllMocks();
  tx=jest.fn(async(sql)=>{
   if(sql.includes('SELECT id,full_name,status FROM users'))return{rows:[{id:targetId,full_name:'MarketLink Customer',status:'active'}]};
   if(sql.includes('SELECT r.name FROM user_roles'))return{rows:[{name:'customer'}]};
   if(sql.includes("SELECT id FROM roles WHERE name='admin'"))return{rows:[{id:4}]};
   return{rows:[]};
  });
  withTransaction.mockImplementation(fn=>fn({query:tx}));
 });
 test('only super administrators can grant the admin role',async()=>{
  await expect(grantAdminRole(targetId,{id:actor.id,role:'admin'}))
   .rejects.toMatchObject({statusCode:403,code:'ADMIN_ROLE_GRANT_FORBIDDEN'});
  expect(withTransaction).not.toHaveBeenCalled();
 });
 test('adds admin role while preserving customer role and writes audit log atomically',async()=>{
  const result=await grantAdminRole(targetId,actor);
  expect(result).toMatchObject({user:{id:targetId,status:'active'},roles:['customer','admin'],alreadyAssigned:false});
  expect(tx).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_roles'),[targetId,4]);
  expect(tx.mock.calls.some(([sql])=>sql.includes('user.admin_role_granted'))).toBe(true);
 });
 test('does not duplicate an existing admin role',async()=>{
  tx.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT id,full_name,status FROM users'))return{rows:[{id:targetId,full_name:'MarketLink Customer',status:'active'}]};
   if(sql.includes('SELECT r.name FROM user_roles'))return{rows:[{name:'customer'},{name:'admin'}]};
   return{rows:[]};
  });
  const result=await grantAdminRole(targetId,actor);
  expect(result.alreadyAssigned).toBe(true);
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO user_roles'))).toBe(false);
 });
 test('rejects suspended accounts',async()=>{
  tx.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT id,full_name,status FROM users'))return{rows:[{id:targetId,full_name:'Suspended Account',status:'suspended'}]};
   return{rows:[]};
  });
  await expect(grantAdminRole(targetId,actor))
   .rejects.toMatchObject({statusCode:409,code:'ADMIN_ROLE_TARGET_INACTIVE'});
 });
 test('does not downgrade or duplicate a super administrator',async()=>{
  tx.mockImplementation(async(sql)=>{
   if(sql.includes('SELECT id,full_name,status FROM users'))return{rows:[{id:targetId,full_name:'Existing Super Admin',status:'active'}]};
   if(sql.includes('SELECT r.name FROM user_roles'))return{rows:[{name:'super_admin'}]};
   return{rows:[]};
  });
  const result=await grantAdminRole(targetId,actor);
  expect(result.roles).toEqual(['super_admin']);
  expect(result.alreadyAssigned).toBe(true);
  expect(tx.mock.calls.some(([sql])=>sql.includes('INSERT INTO user_roles'))).toBe(false);
 });
});
