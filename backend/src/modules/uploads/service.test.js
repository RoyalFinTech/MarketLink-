jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));

const {query,withTransaction}=require('../../config/db');
const {deleteFile,deleteFileByUrl,upload,uploadProfilePhoto,getFile,getPublicProfileContent}=require('./service');

const fileId='66666666-6666-4666-8666-666666666666';
const riderId='33333333-3333-4333-8333-333333333333';
const file={id:fileId,uploaded_by:riderId,file_url:'https://api.marketlink.test/api/v1/uploads/'+fileId+'/content',storage_backend:'database'};

describe('COD receipt retention',()=>{
 beforeEach(()=>{jest.clearAllMocks();withTransaction.mockImplementation(async work=>work({query}));});

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

describe('vendor and rider onboarding uploads',()=>{
 const previous={storage:process.env.STORAGE_PROVIDER,node:process.env.NODE_ENV,render:process.env.RENDER,api:process.env.API_PUBLIC_URL};
 beforeEach(()=>{
  process.env.STORAGE_PROVIDER='database';
  process.env.NODE_ENV='production';
  process.env.RENDER='true';
  process.env.API_PUBLIC_URL='https://api.marketlink.test';
 });
 afterAll(()=>{
  if(previous.storage===undefined)delete process.env.STORAGE_PROVIDER;else process.env.STORAGE_PROVIDER=previous.storage;
  if(previous.node===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous.node;
  if(previous.render===undefined)delete process.env.RENDER;else process.env.RENDER=previous.render;
  if(previous.api===undefined)delete process.env.API_PUBLIC_URL;else process.env.API_PUBLIC_URL=previous.api;
 });
 test('stores a vendor logo in the durable database fallback and serves its public image URL',async()=>{
  query.mockImplementation(async(sql,params)=>{
   if(sql.includes('INSERT INTO file_uploads'))return{rows:[{id:params[0],uploaded_by:params[1],file_url:params[2],file_type:params[3],purpose:params[4],content_bytes:params[6],content_type:params[7],storage_backend:params[8]}]};
   if(sql.includes('SELECT content_bytes'))return{rows:[{content_bytes:Buffer.from('logo'),content_type:'image/png',purpose:'vendor-logo',file_type:'image'}]};
   return{rows:[]};
  });
  const file={mimetype:'image/png',size:4,buffer:Buffer.from('logo'),originalname:'shop-logo.png'};
  const result=await upload(file,'vendor-logo',riderId);
  expect(result.url).toMatch(/\/api\/v1\/uploads\/.+\/profile-content$/);
  expect(result.record.storage_backend).toBe('database');
  const image=await getPublicProfileContent(result.record.id);
  expect(image).toMatchObject({contentType:'image/png'});
  expect(image.buffer.toString()).toBe('logo');
 });
 test.each(['vendor-document','rider-document','license-document'])('%s stays private and can be retrieved by its owner',async purpose=>{
  query.mockImplementation(async(sql,params)=>{
   if(sql.includes('INSERT INTO file_uploads'))return{rows:[{id:params[0],uploaded_by:params[1],file_url:params[2],file_type:params[3],purpose:params[4],content_bytes:params[6],content_type:params[7],storage_backend:params[8]}]};
   if(sql.startsWith('SELECT * FROM file_uploads'))return{rows:[{id:fileId,uploaded_by:riderId,content_bytes:Buffer.from('identity-pdf'),content_type:'application/pdf',purpose,file_type:'document'}]};
   return{rows:[]};
  });
  const file={mimetype:'application/pdf',size:12,buffer:Buffer.from('identity-pdf'),originalname:'identity.pdf'};
  const result=await upload(file,purpose,riderId);
  expect(result.url).toMatch(/\/api\/v1\/uploads\/.+\/content$/);
  expect(result.record.storage_backend).toBe('database');
  const downloaded=await getFile(result.record.id,riderId,['rider']);
  expect(downloaded.buffer.toString()).toBe('identity-pdf');
  expect(downloaded.contentType).toBe('application/pdf');
 });
});


describe('customer profile photo upload',()=>{
 const previous={storage:process.env.STORAGE_PROVIDER,node:process.env.NODE_ENV,render:process.env.RENDER,api:process.env.API_PUBLIC_URL};
 const customerId='77777777-7777-4777-8777-777777777777';
 const png=Buffer.alloc(24);
 beforeAll(()=>{
  Buffer.from([137,80,78,71,13,10,26,10]).copy(png,0);
  png.writeUInt32BE(512,16);png.writeUInt32BE(512,20);
 });
 beforeEach(()=>{
  jest.clearAllMocks();
  process.env.STORAGE_PROVIDER='database';
  process.env.NODE_ENV='production';
  process.env.RENDER='true';
  process.env.API_PUBLIC_URL='https://api.marketlink.test';
  withTransaction.mockImplementation(async work=>work({query}));
 });
 afterAll(()=>{
  if(previous.storage===undefined)delete process.env.STORAGE_PROVIDER;else process.env.STORAGE_PROVIDER=previous.storage;
  if(previous.node===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous.node;
  if(previous.render===undefined)delete process.env.RENDER;else process.env.RENDER=previous.render;
  if(previous.api===undefined)delete process.env.API_PUBLIC_URL;else process.env.API_PUBLIC_URL=previous.api;
 });
 test('uploads the photo, persists its URL on the customer and serves the same image',async()=>{
  query.mockImplementation(async(sql,params=[])=>{
   if(sql.includes('INSERT INTO file_uploads'))return{rows:[{id:params[0],uploaded_by:params[1],file_url:params[2],file_type:params[3],purpose:params[4],content_bytes:params[6],content_type:params[7],storage_backend:params[8]}]};
   if(sql.includes('UPDATE customers SET profile_photo_url'))return{rows:[{user_id:customerId}]};
   if(sql.includes('SELECT content_bytes'))return{rows:[{content_bytes:png,content_type:'image/png',purpose:'profile-photo',file_type:'image'}]};
   return{rows:[]};
  });
  const result=await uploadProfilePhoto({mimetype:'image/png',size:png.length,buffer:png,originalname:'profile.png'},customerId);
  expect(result.profilePhotoUrl).toBe(result.url);
  expect(result.url).toMatch(/\\/api\\/v1\\/uploads\\/.+\\/profile-content$/);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE customers SET profile_photo_url'),[result.url,customerId]);
  const image=await getPublicProfileContent(result.record.id);
  expect(image.contentType).toBe('image/png');
  expect(image.buffer).toEqual(png);
 });
 test('rejects profile photo upload when the account has no customer profile',async()=>{
  query.mockImplementation(async(sql,params=[])=>{
   if(sql.includes('INSERT INTO file_uploads'))return{rows:[{id:params[0],uploaded_by:params[1],file_url:params[2],file_type:params[3],purpose:params[4],file_size_kb:params[5],content_bytes:params[6],content_type:params[7],storage_backend:params[8]}]};
   if(sql.includes('UPDATE customers SET profile_photo_url'))return{rows:[]};
   if(sql.includes('SELECT * FROM file_uploads'))return{rows:[{id:params[0],uploaded_by:customerId,file_url:'https://api.marketlink.test/api/v1/uploads/file/profile-content',storage_backend:'database'}]};
   return{rows:[]};
  });
  await expect(uploadProfilePhoto({mimetype:'image/png',size:png.length,buffer:png,originalname:'profile.png'},customerId))
   .rejects.toMatchObject({statusCode:404,code:'CUSTOMER_NOT_FOUND'});
 });
});
