jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));

const {query,withTransaction}=require('../../config/db');
const {deleteFile,deleteFileByUrl,upload,uploadProfilePhoto,getFile,getPublicProfileContent,assertOwnedUploadReference}=require('./service');

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
  const logo=Buffer.from([137,80,78,71,13,10,26,10]);
  query.mockImplementation(async(sql,params)=>{
   if(sql.includes('INSERT INTO file_uploads'))return{rows:[{id:params[0],uploaded_by:params[1],file_url:params[2],file_type:params[3],purpose:params[4],content_bytes:params[6],content_type:params[7],storage_backend:params[8]}]};
   if(sql.includes('SELECT content_bytes'))return{rows:[{content_bytes:logo,content_type:'image/png',purpose:'vendor-logo',file_type:'image'}]};
   return{rows:[]};
  });
  const file={mimetype:'image/png',size:logo.length,buffer:logo,originalname:'shop-logo.png'};
  const result=await upload(file,'vendor-logo',riderId);
  expect(result.url).toContain('/api/v1/uploads/');
  expect(result.url.endsWith('/profile-content')).toBe(true);
  expect(result.record.storage_backend).toBe('database');
  const image=await getPublicProfileContent(result.record.id);
  expect(image).toMatchObject({contentType:'image/png'});
  expect(image.buffer.toString()).toBe(logo.toString());
 });
 test('rejects a spoofed browser MIME type before storing content',async()=>{
  query.mockClear();
  const buffer=Buffer.from('not-an-image');
  await expect(upload({mimetype:'image/png',size:buffer.length,buffer,originalname:'fake.png'},'vendor-logo',riderId))
   .rejects.toMatchObject({statusCode:400,code:'INVALID_FILE_SIGNATURE'});
  expect(query).not.toHaveBeenCalled();
 });
 test('rejects a size that does not match the received buffer',async()=>{
  query.mockClear();
  const buffer=Buffer.from([137,80,78,71,13,10,26,10]);
  await expect(upload({mimetype:'image/png',size:buffer.length+3,buffer,originalname:'logo.png'},'vendor-logo',riderId))
   .rejects.toMatchObject({statusCode:400,code:'INVALID_FILE'});
  expect(query).not.toHaveBeenCalled();
 });
 test.each(['vendor-document','rider-document','license-document','affiliate-document'])('%s stays private and can be retrieved by its owner',async purpose=>{
  const pdf=Buffer.from('%PDF-1.7\\nidentity-pdf');
  query.mockImplementation(async(sql,params)=>{
   if(sql.includes('INSERT INTO file_uploads'))return{rows:[{id:params[0],uploaded_by:params[1],file_url:params[2],file_type:params[3],purpose:params[4],content_bytes:params[6],content_type:params[7],storage_backend:params[8]}]};
   if(sql.startsWith('SELECT * FROM file_uploads'))return{rows:[{id:fileId,uploaded_by:riderId,content_bytes:pdf,content_type:'application/pdf',purpose,file_type:'document'}]};
   return{rows:[]};
  });
  const file={mimetype:'application/pdf',size:pdf.length,buffer:pdf,originalname:'identity.pdf'};
  const result=await upload(file,purpose,riderId);
  expect(result.url).toContain('/api/v1/uploads/');
  expect(result.url.endsWith('/content')).toBe(true);
  expect(result.record.storage_backend).toBe('database');
  const downloaded=await getFile(result.record.id,riderId,['rider']);
  expect(downloaded.buffer.toString()).toBe(pdf.toString());
  expect(downloaded.contentType).toBe('application/pdf');
 });

 test('affiliate selfie uploads as a private image and remains owner-readable',async()=>{
  const previous={storage:process.env.STORAGE_PROVIDER,node:process.env.NODE_ENV,render:process.env.RENDER,api:process.env.API_PUBLIC_URL};
  process.env.STORAGE_PROVIDER='database';
  process.env.NODE_ENV='production';
  process.env.RENDER='true';
  process.env.API_PUBLIC_URL='https://api.marketlink.test';
  const png=Buffer.alloc(24);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(png,0);
  png.write('IHDR',12,'ascii');png.writeUInt32BE(512,16);png.writeUInt32BE(512,20);
  query.mockImplementation(async(sql,params=[])=>{
   if(sql.includes('INSERT INTO file_uploads'))return{rows:[{id:params[0],uploaded_by:params[1],file_url:params[2],file_type:params[3],purpose:params[4],content_bytes:params[6],content_type:params[7],storage_backend:params[8]}]};
   if(sql.startsWith('SELECT * FROM file_uploads'))return{rows:[{id:fileId,uploaded_by:riderId,content_bytes:png,content_type:'image/png',purpose:'affiliate-selfie',file_type:'image'}]};
   return{rows:[]};
  });
  try{
   const result=await upload({mimetype:'image/png',size:png.length,buffer:png,originalname:'selfie.png'},'affiliate-selfie',riderId);
   expect(result.record.file_type).toBe('image');
   expect(result.record.purpose).toBe('affiliate-selfie');
   expect(result.url).toContain('/api/v1/uploads/');
   expect(result.url.endsWith('/content')).toBe(true);
   const downloaded=await getFile(result.record.id,riderId,['customer']);
   expect(downloaded.contentType).toBe('image/png');
   expect(downloaded.buffer.toString()).toBe(png.toString());
  }finally{
   for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key==='storage'?'STORAGE_PROVIDER':key==='node'?'NODE_ENV':key==='render'?'RENDER':'API_PUBLIC_URL'];else process.env[key==='storage'?'STORAGE_PROVIDER':key==='node'?'NODE_ENV':key==='render'?'RENDER':'API_PUBLIC_URL']=value;}
  }
 });
});


describe('customer profile photo upload',()=>{
 const previous={storage:process.env.STORAGE_PROVIDER,node:process.env.NODE_ENV,render:process.env.RENDER,api:process.env.API_PUBLIC_URL};
 const customerId='77777777-7777-4777-8777-777777777777';
 const png=Buffer.alloc(24);
 beforeAll(()=>{
  Buffer.from([137,80,78,71,13,10,26,10]).copy(png,0);
  png.write('IHDR',12,'ascii');
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
  expect(result.url).toContain('/api/v1/uploads/');
  expect(result.url.endsWith('/profile-content')).toBe(true);
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

describe('applicant upload ownership validation',()=>{
 beforeEach(()=>jest.clearAllMocks());
 test('accepts a file owned by the applicant and with the expected KYC purpose',async()=>{
  query.mockResolvedValueOnce({rows:[{id:fileId,uploaded_by:riderId,purpose:'rider-document',file_type:'document',file_url:file.file_url}]});
  const result=await assertOwnedUploadReference(file.file_url,riderId,'rider-document','document','Rider identity document');
  expect(result).toMatchObject({id:fileId,uploaded_by:riderId,purpose:'rider-document'});
  expect(query.mock.calls[0][1]).toEqual([fileId]);
 });
 test('rejects a file belonging to another account',async()=>{
  query.mockResolvedValueOnce({rows:[{id:fileId,uploaded_by:'another-user',purpose:'rider-document',file_type:'document'}]});
  await expect(assertOwnedUploadReference(file.file_url,riderId,'rider-document','document','Rider identity document')).rejects.toMatchObject({statusCode:403,code:'UPLOAD_NOT_OWNED'});
 });
 test('rejects an image used as an identity document',async()=>{
  query.mockResolvedValueOnce({rows:[{id:fileId,uploaded_by:riderId,purpose:'rider-photo',file_type:'image'}]});
  await expect(assertOwnedUploadReference(file.file_url,riderId,'rider-document','document','Rider identity document')).rejects.toMatchObject({statusCode:400,code:'UPLOAD_PURPOSE_MISMATCH'});
 });
});

describe('scoped moderator access to private KYC files',()=>{
 beforeEach(()=>{jest.clearAllMocks();withTransaction.mockImplementation(async work=>work({query}));});

 test('allows a moderator to read only a vendor KYC file linked to a vendor record',async()=>{
  const vendorFile={...file,purpose:'vendor-document',content_bytes:Buffer.from('%PDF-test'),content_type:'application/pdf'};
  query.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT * FROM file_uploads'))return{rows:[vendorFile]};
   if(sql.includes('FROM vendors v WHERE'))return{rows:[{in_use:true}]};
   return{rows:[]};
  });
  await expect(getFile(fileId,'moderator-user',['moderator']))
   .resolves.toMatchObject({contentType:'application/pdf'});
 });

 test('denies moderator access to affiliate marketer KYC documents',async()=>{
  const affiliateFile={...file,purpose:'affiliate-document',content_bytes:Buffer.from('%PDF-test')};
  query.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT * FROM file_uploads'))return{rows:[affiliateFile]};
   return{rows:[]};
  });
  await expect(getFile(fileId,'moderator-user',['moderator']))
   .rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
 });

 test('denies moderator access to vendor KYC files not linked to a vendor or rider record',async()=>{
  const orphanFile={...file,purpose:'vendor-document',content_bytes:Buffer.from('%PDF-test')};
  query.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT * FROM file_uploads'))return{rows:[orphanFile]};
   if(sql.includes('FROM vendors v WHERE'))return{rows:[{in_use:false}]};
   return{rows:[]};
  });
  await expect(getFile(fileId,'moderator-user',['moderator']))
   .rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
 });

 test('does not allow a moderator to delete another users KYC file',async()=>{
  const vendorFile={...file,purpose:'vendor-document'};
  query.mockImplementation(async(sql)=>{
   if(sql.startsWith('SELECT * FROM file_uploads'))return{rows:[vendorFile]};
   return{rows:[]};
  });
  await expect(deleteFile(fileId,'moderator-user',['moderator']))
   .rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
 });
});
