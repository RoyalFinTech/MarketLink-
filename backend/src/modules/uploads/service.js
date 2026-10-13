// src/modules/uploads/service.js
// Durable Supabase Storage in production, local storage for development only.
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { query } = require('../../config/db');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

const ALLOWED_IMAGE_TYPES = ['image/jpeg','image/png','image/webp','image/gif'];
const ALLOWED_DOC_TYPES = ['application/pdf','image/jpeg','image/png'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_DOC_SIZE = 10 * 1024 * 1024;
const EXT_BY_MIME = {'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif','application/pdf':'.pdf'};

const PROFILE_IMAGE_MIN_DIMENSION = 512;
function imageDimensions(buffer, mime) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (mime === 'image/png' && buffer.length >= 24 &&
      buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    return {width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
  }
  if (mime === 'image/jpeg' && buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset=2;
    while(offset+9<buffer.length) {
      if(buffer[offset]!==0xff){offset++;continue;}
      const marker=buffer[offset+1];offset+=2;
      if(marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
      if(offset+2>buffer.length)break;
      const length=buffer.readUInt16BE(offset);
      if(length<2||offset+length>buffer.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        return {height:buffer.readUInt16BE(offset+3),width:buffer.readUInt16BE(offset+5)};
      }
      offset+=length;
    }
  }
  return null;
}
function isProfilePhoto(purpose) {
  const p=String(purpose||'').toLowerCase().replace(/_/g,'-').replace(/\s+/g,'-');
  return p==='profile-photo'||p==='profile-image'||p==='avatar';
}
function validateFile(file, purpose) {
  const p=String(purpose||'general').toLowerCase();
  const profilePhoto=isProfilePhoto(p);
  const isDoc=p.includes('document')||p.includes('doc')||file.mimetype==='application/pdf';
  const allowed=profilePhoto?['image/jpeg','image/png']:(isDoc?ALLOWED_DOC_TYPES:ALLOWED_IMAGE_TYPES);
  const maxSize=isDoc?MAX_DOC_SIZE:MAX_IMAGE_SIZE;
  if(!allowed.includes(file.mimetype)) throw new AppError(profilePhoto?'Profile photos must be JPG/JPEG or PNG.':'This file type is not supported for this upload.',400,'INVALID_FILE_TYPE');
  if(!Number.isFinite(Number(file.size))||file.size<=0) throw new AppError('The selected file is empty or invalid.',400,'INVALID_FILE');
  if(file.size>maxSize) throw new AppError('File is too large. Maximum size is '+(maxSize/1024/1024)+' MB.',400,'FILE_TOO_LARGE');
  if(profilePhoto) {
    const dimensions=imageDimensions(file.buffer,file.mimetype);
    if(!dimensions) throw new AppError('MarketLink could not read this image. Please choose a valid JPG or PNG file.',400,'INVALID_IMAGE');
    if(dimensions.width<PROFILE_IMAGE_MIN_DIMENSION||dimensions.height<PROFILE_IMAGE_MIN_DIMENSION) {
      throw new AppError('Profile photos must be at least 512 × 512 pixels. Please choose a larger image.',400,'IMAGE_DIMENSIONS_TOO_SMALL');
    }
  }
}

function publicApiBase() {
  return String(process.env.API_PUBLIC_URL || process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || 'https://marketlink-gambia.onrender.com').replace(/\/+$/, '');
}
function supabaseConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'marketlink-uploads').trim();
  return {url, key, bucket, privateBucket:String(process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || (bucket + '-private')).trim()};
}
function getStorageProvider() {
  const configured=String(process.env.STORAGE_PROVIDER||'').trim().toLowerCase();
  const supabase=supabaseConfig();
  if(configured==='supabase'||(supabase.url&&supabase.key)) return 'supabase';
  if(configured==='local'&&process.env.NODE_ENV!=='production'&&!process.env.RENDER) return 'local';
  if(process.env.NODE_ENV==='production'||process.env.RENDER) return 'database';
  return 'local';
}
function encodeObjectPath(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}
function safePurpose(value) {
  return String(value || 'general').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'general';
}
function authHeaders(config, contentType) {
  const h = {'apikey':config.key, 'Authorization':'Bearer ' + config.key};
  if (contentType) h['Content-Type'] = contentType;
  return h;
}
async function supabaseRequest(url, options, operation) {
  let response;
  try { response = await fetch(url, options); }
  catch (err) {
    logger.error('Supabase Storage request failed', {operation, error:err.message});
    throw new AppError('Secure image storage could not be reached. Please try again shortly.', 503, 'STORAGE_UNAVAILABLE');
  }
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch(e) {}
  if (!response.ok) {
    logger.error('Supabase Storage rejected request', {operation, status:response.status, message:data.message || data.error || ''});
    throw new AppError(response.status === 413 ? 'The selected file is too large.' : 'Secure file storage could not complete the request. Please contact support if this continues.', response.status === 413 ? 413 : 503, 'STORAGE_REQUEST_FAILED');
  }
  return {response, data};
}
async function ensureBucket(config, bucket, isPublic) {
  const base = config.url + '/storage/v1/bucket/' + encodeURIComponent(bucket);
  let existing;
  try {
    const response = await fetch(base, {headers:authHeaders(config)});
    if (response.ok) existing = await response.json();
    else if (response.status !== 404) {
      const body = await response.text();
      logger.error('Could not inspect Supabase Storage bucket', {bucket, status:response.status, message:body.slice(0,180)});
      throw new AppError('Storage configuration needs attention. Please contact support.', 503, 'STORAGE_BUCKET_ERROR');
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Secure file storage could not be reached.', 503, 'STORAGE_UNAVAILABLE');
  }
  if (existing) {
    if (Boolean(existing.public) !== Boolean(isPublic)) {
      throw new AppError('The configured Supabase Storage bucket has the wrong privacy setting. Check the bucket configuration.', 503, 'STORAGE_BUCKET_PRIVACY_MISMATCH');
    }
    return;
  }
  const createUrl = config.url + '/storage/v1/bucket';
  const payload = {id:bucket,name:bucket,public:Boolean(isPublic),file_size_limit:MAX_DOC_SIZE,allowed_mime_types:isPublic?ALLOWED_IMAGE_TYPES:ALLOWED_DOC_TYPES};
  let response;
  try {
    response = await fetch(createUrl, {method:'POST',headers:authHeaders(config,'application/json'),body:JSON.stringify(payload)});
  } catch (err) { throw new AppError('Secure file storage could not be reached.', 503, 'STORAGE_UNAVAILABLE'); }
  if (!response.ok && response.status !== 409) {
    const body = await response.text();
    logger.error('Could not create Supabase Storage bucket', {bucket,status:response.status,message:body.slice(0,180)});
    throw new AppError('The required Supabase Storage bucket is not available. Check storage credentials and bucket permissions.', 503, 'STORAGE_BUCKET_ERROR');
  }
}
async function uploadSupabase(file, purpose) {
  const config = supabaseConfig();
  if (!config.url || !config.key) throw new AppError('Supabase Storage credentials are missing on the backend.', 503, 'STORAGE_NOT_CONFIGURED');
  const privateFile = String(purpose).toLowerCase().includes('document') || String(purpose).toLowerCase().includes('doc') || file.mimetype === 'application/pdf';
  const bucket = privateFile ? config.privateBucket : config.bucket;
  await ensureBucket(config, bucket, !privateFile);
  const key = safePurpose(purpose) + '/' + Date.now() + '-' + crypto.randomUUID() + (EXT_BY_MIME[file.mimetype] || '.bin');
  const endpoint = config.url + '/storage/v1/object/' + encodeURIComponent(bucket) + '/' + encodeObjectPath(key);
  await supabaseRequest(endpoint, {
    method:'POST',
    headers:Object.assign(authHeaders(config,file.mimetype), {'x-upsert':'false','cache-control':'3600'}),
    body:file.buffer,
  }, 'upload');
  if (privateFile) return {storedUrl:'supabase://' + bucket + '/' + key, publicUrl:null, privateFile:true};
  return {
    storedUrl:config.url + '/storage/v1/object/public/' + encodeURIComponent(bucket) + '/' + encodeObjectPath(key),
    publicUrl:config.url + '/storage/v1/object/public/' + encodeURIComponent(bucket) + '/' + encodeObjectPath(key),
    privateFile:false,
  };
}
async function uploadLocal(file, purpose) {
  const uploadsDir = path.join(process.cwd(), 'uploads', safePurpose(purpose));
  fs.mkdirSync(uploadsDir, {recursive:true});
  const filename = Date.now() + '-' + crypto.randomUUID() + (EXT_BY_MIME[file.mimetype] || '.bin');
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer, {flag:'wx'});
  const relative = '/uploads/' + safePurpose(purpose) + '/' + filename;
  logger.info('File stored locally', {purpose});
  return {storedUrl:publicApiBase() + relative, publicUrl:publicApiBase() + relative, privateFile:false};
}
async function upload(file, purpose, uploaderId) {
  validateFile(file,purpose);
  const type=privateDocumentType(file,purpose);
  const provider=getStorageProvider();
  let stored;
  if(provider==='database') {
    if(!isProfilePhoto(purpose)) {
      throw new AppError('Secure cloud storage is not configured for this type of file. Please contact MarketLink support.',503,'STORAGE_NOT_CONFIGURED');
    }
    // Profile images are small and bounded; keep the binary in Postgres when cloud
    // object storage is not configured instead of making profile uploads unavailable.
    const id=crypto.randomUUID();
    const url=publicApiBase()+'/api/v1/uploads/'+id+'/profile-content';
    const {rows:[record]}=await query(
      'INSERT INTO file_uploads (id,uploaded_by,file_url,file_type,purpose,file_size_kb,content_bytes,content_type,storage_backend) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [id,uploaderId||null,url,type,purpose,Math.ceil(file.size/1024),file.buffer,file.mimetype,'database']
    );
    return {url,record:Object.assign({},record,{file_url:url})};
  }
  if(provider==='supabase') stored=await uploadSupabase(file,purpose);
  else if(provider==='local') stored=await uploadLocal(file,purpose);
  else throw new AppError('The configured storage provider is not available.',503,'STORAGE_NOT_CONFIGURED');
  const {rows:[record]}=await query(
    'INSERT INTO file_uploads (uploaded_by,file_url,file_type,purpose,file_size_kb,storage_backend,content_type) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [uploaderId||null,stored.storedUrl,type,purpose,Math.ceil(file.size/1024),provider,file.mimetype]
  );
  const url=stored.publicUrl||(publicApiBase()+'/api/v1/uploads/'+record.id+'/content');
  return {url,record:Object.assign({},record,{file_url:url})};
}
async function getPublicProfileContent(fileId) {
  const {rows:[f]}=await query("SELECT content_bytes,content_type,purpose,file_type FROM file_uploads WHERE id=$1 AND deleted_at IS NULL",[fileId]);
  if(!f || !f.content_bytes || !['profile-photo','profile_photo','profile photo'].includes(String(f.purpose||'').toLowerCase()) || f.file_type!=='image') {
    throw new AppError('Profile photo not found.',404,'FILE_NOT_FOUND');
  }
  return {buffer:f.content_bytes,contentType:f.content_type || 'image/jpeg'};
}
function privateDocumentType(file,purpose) {
  const p=String(purpose || '').toLowerCase();
  return file.mimetype === 'application/pdf' || p.includes('document') || p.includes('doc') ? 'document' : 'image';
}
async function storageDelete(storedUrl) {
  const raw = String(storedUrl || '');
  if (raw.startsWith('supabase://')) {
    const config=supabaseConfig();
    const rest=raw.slice('supabase://'.length);
    const sep=rest.indexOf('/');
    if (sep < 1) throw new AppError('Stored file reference is invalid.',500,'INVALID_STORAGE_REFERENCE');
    const bucket=rest.slice(0,sep), key=rest.slice(sep+1);
    if (!config.url || !config.key) throw new AppError('Supabase Storage credentials are missing.',503,'STORAGE_NOT_CONFIGURED');
    await supabaseRequest(config.url + '/storage/v1/object/' + encodeURIComponent(bucket) + '/' + encodeObjectPath(key), {
      method:'DELETE',headers:authHeaders(config)
    },'delete');
    return;
  }
  const config=supabaseConfig();
  if (config.url && config.key && raw.startsWith(config.url + '/storage/v1/object/public/')) {
    const pathPart=raw.slice((config.url + '/storage/v1/object/public/').length);
    const sep=pathPart.indexOf('/');
    if (sep < 1) return;
    const bucket=decodeURIComponent(pathPart.slice(0,sep));
    const key=pathPart.slice(sep+1).split('/').map(decodeURIComponent).join('/');
    await supabaseRequest(config.url + '/storage/v1/object/' + encodeURIComponent(bucket) + '/' + encodeObjectPath(key), {
      method:'DELETE',headers:authHeaders(config)
    },'delete');
    return;
  }
  let pathname='';
  try { pathname = new URL(raw, publicApiBase()).pathname; } catch(e) { pathname=raw; }
  if (pathname.startsWith('/uploads/')) {
    const root=path.resolve(process.cwd(),'uploads');
    const target=path.resolve(process.cwd(),'.' + pathname);
    if (target === root || !target.startsWith(root + path.sep)) return;
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}
function parseSupabaseRef(storedUrl) {
  const raw=String(storedUrl || '');
  if(!raw.startsWith('supabase://')) return null;
  const rest=raw.slice('supabase://'.length),sep=rest.indexOf('/');
  if(sep<1) return null;
  return {bucket:rest.slice(0,sep),key:rest.slice(sep+1)};
}
async function getFile(fileId, requesterId, roles) {
  const {rows:[f]}=await query('SELECT * FROM file_uploads WHERE id=$1 AND deleted_at IS NULL',[fileId]);
  if(!f) throw new AppError('File not found.',404,'FILE_NOT_FOUND');
  const isAdmin=(roles||[]).some(r=>['admin','super_admin','moderator'].includes(r));
  if(!isAdmin && String(f.uploaded_by)!==String(requesterId)) throw new AppError('You are not allowed to access this file.',403,'FORBIDDEN');
  if(f.content_bytes) return {buffer:Buffer.from(f.content_bytes),contentType:f.content_type||'application/octet-stream'};
  const ref=parseSupabaseRef(f.file_url);
  if(ref) {
    const config=supabaseConfig();
    let response;
    try {
      response=await fetch(config.url + '/storage/v1/object/' + encodeURIComponent(ref.bucket) + '/' + encodeObjectPath(ref.key), {method:'GET',headers:authHeaders(config)});
    } catch(err) {
      throw new AppError('Secure file storage could not be reached.',503,'STORAGE_UNAVAILABLE');
    }
    if(!response.ok) {
      logger.warn('Supabase Storage file download failed',{fileId,status:response.status});
      throw new AppError('File content is temporarily unavailable.',503,'STORAGE_DOWNLOAD_FAILED');
    }
    const contentType=response.headers.get('content-type') || 'application/octet-stream';
    return {buffer:Buffer.from(await response.arrayBuffer()),contentType};
  }
  let pathname='';
  try { pathname=new URL(f.file_url,publicApiBase()).pathname; } catch(e) { pathname=String(f.file_url); }
  if (!pathname.startsWith('/uploads/')) throw new AppError('File content is not available from this server.',404,'FILE_NOT_FOUND');
  const root=path.resolve(process.cwd(),'uploads'), target=path.resolve(process.cwd(),'.'+pathname);
  if(target===root || !target.startsWith(root+path.sep) || !fs.existsSync(target)) throw new AppError('File content is no longer available.',404,'FILE_NOT_FOUND');
  return {buffer:fs.readFileSync(target),contentType:EXT_CONTENT_TYPE(target)};
}
function EXT_CONTENT_TYPE(filePath) {
  const ext=path.extname(filePath).toLowerCase();
  return ({'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.pdf':'application/pdf'})[ext] || 'application/octet-stream';
}
async function deleteFile(fileId, requesterId, roles) {
  const {rows:[f]}=await query('SELECT * FROM file_uploads WHERE id=$1 AND deleted_at IS NULL',[fileId]);
  if(!f) throw new AppError('File not found.',404,'FILE_NOT_FOUND');
  const isAdmin=(roles||[]).some(r=>['admin','super_admin','moderator'].includes(r));
  if(!isAdmin && String(f.uploaded_by)!==String(requesterId)) throw new AppError('You are not allowed to delete this file.',403,'FORBIDDEN');
  if(f.storage_backend==='database') await query('UPDATE file_uploads SET deleted_at=now(),content_bytes=NULL WHERE id=$1',[fileId]);
  else {
    await storageDelete(f.file_url);
    await query('UPDATE file_uploads SET deleted_at=now() WHERE id=$1',[fileId]);
  }
  return {deleted:true,id:fileId};
}
async function deleteFileByUrl(url, requesterId) {
  const {rows:[f]}=await query('SELECT * FROM file_uploads WHERE file_url=$1 AND uploaded_by=$2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',[url,requesterId]);
  if(!f) return {deleted:false,reason:'NOT_OWNED_OR_NOT_FOUND'};
  const {rows:[refs]}=await query(
    'SELECT EXISTS(SELECT 1 FROM customers WHERE profile_photo_url=$1) AS customer_ref, ' +
    'EXISTS(SELECT 1 FROM riders WHERE profile_photo_url=$1) AS rider_ref, ' +
    'EXISTS(SELECT 1 FROM vendors WHERE logo_url=$1) AS vendor_ref',
    [url]
  );
  if(refs && (refs.customer_ref || refs.rider_ref || refs.vendor_ref)) return {deleted:false,reason:'STILL_IN_USE'};
  if(f.storage_backend==='database') await query('UPDATE file_uploads SET deleted_at=now(),content_bytes=NULL WHERE id=$1',[f.id]);
  else {
    await storageDelete(f.file_url);
    await query('UPDATE file_uploads SET deleted_at=now() WHERE id=$1',[f.id]);
  }
  return {deleted:true,id:f.id};
}
async function removeProfilePhoto(requesterId) {
  const {rows:[customer]}=await query('SELECT profile_photo_url FROM customers WHERE user_id=$1',[requesterId]);
  if(!customer) throw new AppError('Customer profile not found.',404,'CUSTOMER_NOT_FOUND');
  const oldUrl=customer.profile_photo_url;
  await query('UPDATE customers SET profile_photo_url=NULL WHERE user_id=$1',[requesterId]);
  if(oldUrl) {
    try { await deleteFileByUrl(oldUrl,requesterId); }
    catch(err) { logger.warn('Profile image removed from account but old stored file could not be cleaned up',{requesterId,error:err.message}); }
  }
  return {removed:true,profilePhotoUrl:null};
}
module.exports={upload,deleteFile,deleteFileByUrl,removeProfilePhoto,getFile,getPublicProfileContent,validateFile};
