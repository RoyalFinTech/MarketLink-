jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));

const {query}=require('../../config/db');
const {deleteFile,deleteFileByUrl}=require('./service');

const fileId='66666666-6666-4666-8666-666666666666';
const riderId='33333333-3333-4333-8333-333333333333';
const file={id:fileId,uploaded_by:riderId,file_url:'https://api.marketlink.test/api/v1/uploads/'+fileId+'/content',storage_backend:'database'};

describe('COD receipt retention',()=>{
 beforeEach(()=>jest.clearAllMocks());

 test('prevents riders and admins from deleting a file linked to a COD remittance',async()=>{
  query.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT * FROM file_uploads'))return{rows:[file]};
   if(sql.includes('FROM cod_cash_remittances'))return{rows:[{in_use:true}]};
   return{rows:[]};
  });
  await expect(deleteFile(fileId,riderId,['rider']))
   .rejects.toMatchObject({statusCode:409,code:'FILE_IN_USE'});
  expect(query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE file_uploads'),expect.anything());
  await expect(deleteFile(fileId,'admin-user',['admin']))
   .rejects.toMatchObject({statusCode:409,code:'FILE_IN_USE'});
 });

 test('prevents profile cleanup from deleting a COD receipt linked to a remittance',async()=>{
  query.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT * FROM file_uploads'))return{rows:[file]};
   if(sql.includes('FROM cod_cash_remittances'))return{rows:[{in_use:true}]};
   return{rows:[]};
  });
  await expect(deleteFileByUrl(file.file_url,riderId))
   .resolves.toMatchObject({deleted:false,reason:'STILL_IN_USE'});
  expect(query).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE file_uploads'),expect.anything());
 });

 test('allows deletion of an unreferenced database-backed file',async()=>{
  query.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT * FROM file_uploads'))return{rows:[file]};
   if(sql.includes('FROM cod_cash_remittances'))return{rows:[{in_use:false}]};
   return{rows:[]};
  });
  await expect(deleteFile(fileId,riderId,['rider'])).resolves.toMatchObject({deleted:true,id:fileId});
  expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE file_uploads'),[fileId]);
 });
});
