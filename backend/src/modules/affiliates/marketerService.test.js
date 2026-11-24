jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../uploads/service',()=>({assertOwnedUploadReference:jest.fn()}));

const {query,withTransaction}=require('../../config/db');
const uploads=require('../uploads/service');
const service=require('./marketerService');

describe('Affiliate Marketer application and approval',()=>{
 beforeEach(()=>{jest.clearAllMocks();});

 test('submits a pending application only after validating private KYC uploads',async()=>{
  uploads.assertOwnedUploadReference
   .mockResolvedValueOnce({id:'identity-file',file_type:'document'})
   .mockResolvedValueOnce({id:'selfie-file',file_type:'image'});
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[{id:'user-1',status:'active'}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[{id:'application-1',status:'pending',submitted_at:'2026-11-23T00:00:00Z'}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]});
  withTransaction.mockImplementation(fn=>fn({query:clientQuery}));

  const result=await service.submitApplication('user-1',{
   legalName:'Awa Jallow',
   residentialAddress:'Serrekunda, The Gambia',
   marketingChannels:['whatsapp','facebook'],
   marketingPlan:'I will promote MarketLink through my local community groups and social pages.',
   identityDocumentUrl:'https://api.marketlink.test/api/v1/uploads/identity-file/content',
   selfieUrl:'https://api.marketlink.test/api/v1/uploads/selfie-file/content',
   socialLinks:{facebook:'https://facebook.com/example'}
  });

  expect(result).toMatchObject({id:'application-1',status:'pending'});
  expect(uploads.assertOwnedUploadReference).toHaveBeenCalledTimes(2);
  expect(uploads.assertOwnedUploadReference).toHaveBeenNthCalledWith(1,expect.any(String),'user-1','affiliate-document',null,'Identity document');
  expect(clientQuery.mock.calls.some(([sql])=>sql.includes("UPDATE affiliates SET marketer_status='pending',commission_pct=0"))).toBe(true);
 });

 test('rejects a PDF uploaded in the selfie field before creating an application',async()=>{
  uploads.assertOwnedUploadReference
   .mockResolvedValueOnce({id:'identity-file',file_type:'document'})
   .mockResolvedValueOnce({id:'selfie-file',file_type:'document'});
  await expect(service.submitApplication('user-1',{
   legalName:'Awa Jallow',
   residentialAddress:'Serrekunda, The Gambia',
   marketingChannels:['whatsapp'],
   marketingPlan:'I will promote MarketLink through local community groups and social pages.',
   identityDocumentUrl:'https://api.marketlink.test/api/v1/uploads/identity-file/content',
   selfieUrl:'https://api.marketlink.test/api/v1/uploads/selfie-file/content'
  })).rejects.toMatchObject({code:'KYC_SELFIE_IMAGE_REQUIRED',statusCode:400});
  expect(withTransaction).not.toHaveBeenCalled();
 });

 test('grants the marketer role only after Admin approval and records an audit event',async()=>{
  const application={id:'application-1',user_id:'user-1',status:'pending'};
  const updated={id:'application-1',user_id:'user-1',status:'approved',reviewed_at:'2026-11-23T00:00:00Z',rejection_reason:null};
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[application]})
   .mockResolvedValueOnce({rows:[{id:7}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[updated]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]});
  withTransaction.mockImplementation(fn=>fn({query:clientQuery}));

  const result=await service.reviewApplication('application-1','approved',null,{id:'admin-1',role:'admin'});

  expect(result).toMatchObject({id:'application-1',status:'approved'});
  expect(clientQuery.mock.calls[2][0]).toContain('INSERT INTO user_roles');
  expect(clientQuery.mock.calls[3][0]).toContain("UPDATE affiliates SET marketer_status='approved'");
  expect(clientQuery.mock.calls.some(([sql])=>sql.includes('admin_action_logs'))).toBe(true);
 });

 test('requires an Admin rejection reason',async()=>{
  await expect(service.reviewApplication('application-1','rejected',' ',{id:'admin-1',role:'admin'}))
   .rejects.toMatchObject({code:'REJECTION_REASON_REQUIRED',statusCode:400});
  expect(withTransaction).not.toHaveBeenCalled();
 });
});
