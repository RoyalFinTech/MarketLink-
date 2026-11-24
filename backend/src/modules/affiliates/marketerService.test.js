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
   socialLinks:{facebook:'https://facebook.com/example',whatsapp:'https://wa.me/220871234567'}
  });

  expect(result).toMatchObject({id:'application-1',status:'pending'});
  expect(uploads.assertOwnedUploadReference).toHaveBeenCalledTimes(2);
  expect(uploads.assertOwnedUploadReference).toHaveBeenNthCalledWith(1,expect.any(String),'user-1','affiliate-document',null,'Identity document');
  expect(uploads.assertOwnedUploadReference).toHaveBeenNthCalledWith(2,expect.any(String),'user-1','affiliate-selfie',null,'KYC selfie');
  expect(clientQuery.mock.calls.some(([sql])=>sql.includes("UPDATE affiliates SET marketer_status='pending',commission_pct=0"))).toBe(true);
 });

 test('rejects non-WhatsApp domains in the WhatsApp contact field',async()=>{
  uploads.assertOwnedUploadReference
   .mockResolvedValueOnce({id:'identity-file',file_type:'document'})
   .mockResolvedValueOnce({id:'selfie-file',file_type:'image'});
  await expect(service.submitApplication('user-1',{
   legalName:'Awa Jallow',residentialAddress:'Serrekunda, The Gambia',
   marketingChannels:['whatsapp'],marketingPlan:'I will promote MarketLink through my local WhatsApp community and social pages.',
   identityDocumentUrl:'https://api.marketlink.test/api/v1/uploads/identity-file/content',
   selfieUrl:'https://api.marketlink.test/api/v1/uploads/selfie-file/content',
   socialLinks:{whatsapp:'https://example.com/not-whatsapp'}
  })).rejects.toMatchObject({code:'INVALID_SOCIAL_LINK',statusCode:400});
  expect(withTransaction).not.toHaveBeenCalled();
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
  expect(uploads.assertOwnedUploadReference).toHaveBeenNthCalledWith(2,expect.any(String),'user-1','affiliate-selfie',null,'KYC selfie');
  expect(withTransaction).not.toHaveBeenCalled();
 });

 test('grants the marketer role only after Admin approval and records an audit event',async()=>{
  const application={id:'application-1',user_id:'user-1',status:'pending'};
  const updated={id:'application-1',user_id:'user-1',status:'approved',reviewed_at:'2026-11-23T00:00:00Z',rejection_reason:null};
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[application]})
   .mockResolvedValueOnce({rows:[{id:'user-1',status:'active'}]})
   .mockResolvedValueOnce({rows:[{id:7}]})
   .mockResolvedValueOnce({rows:[{value:'2'}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[updated]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]});
  withTransaction.mockImplementation(fn=>fn({query:clientQuery}));

  const result=await service.reviewApplication('application-1','approved',null,{id:'admin-1',role:'admin'});

  expect(result).toMatchObject({id:'application-1',status:'approved'});
  expect(clientQuery.mock.calls[4][0]).toContain('INSERT INTO user_roles');
  expect(clientQuery.mock.calls[5][0]).toContain("UPDATE affiliates SET marketer_status='approved'");
  expect(clientQuery.mock.calls[5][1]).toEqual(['user-1',2,'admin-1']);
  expect(clientQuery.mock.calls[3][0]).toContain("affiliate_commission_pct");
  expect(clientQuery.mock.calls.some(([sql])=>sql.includes('admin_action_logs'))).toBe(true);
 });

 test('does not approve or reinstate an applicant whose MarketLink account is inactive',async()=>{
  const application={id:'application-inactive',user_id:'user-inactive',status:'pending'};
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[application]})
   .mockResolvedValueOnce({rows:[{id:'user-inactive',status:'suspended'}]});
  withTransaction.mockImplementation(fn=>fn({query:clientQuery}));
  await expect(service.reviewApplication('application-inactive','approved',null,{id:'admin-1',role:'admin'}))
   .rejects.toMatchObject({code:'APPLICANT_ACCOUNT_NOT_ACTIVE',statusCode:403});
  expect(clientQuery).toHaveBeenCalledTimes(2);
 });

 test('suspension removes the active commission rate as well as the marketer role',async()=>{
  const application={id:'application-2',user_id:'user-2',status:'approved'};
  const updated={id:'application-2',user_id:'user-2',status:'suspended'};
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[application]})
   .mockResolvedValueOnce({rows:[{id:7}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[updated]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]});
  withTransaction.mockImplementation(fn=>fn({query:clientQuery}));
  await service.reviewApplication('application-2','suspended','Policy breach',{id:'admin-1',role:'admin'});
  expect(clientQuery.mock.calls[2][0]).toContain('DELETE FROM user_roles');
  expect(clientQuery.mock.calls[3][0]).toContain("marketer_status='suspended',commission_pct=0");
 });

 test('does not approve when the configured affiliate commission is invalid',async()=>{
  const application={id:'application-3',user_id:'user-3',status:'pending'};
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[application]})
   .mockResolvedValueOnce({rows:[{id:'user-3',status:'active'}]})
   .mockResolvedValueOnce({rows:[{id:7}]})
   .mockResolvedValueOnce({rows:[{value:'invalid'}]});
  withTransaction.mockImplementation(fn=>fn({query:clientQuery}));
  await expect(service.reviewApplication('application-3','approved',null,{id:'admin-1',role:'admin'}))
   .rejects.toMatchObject({code:'AFFILIATE_COMMISSION_CONFIG_INVALID',statusCode:503});
  expect(clientQuery).toHaveBeenCalledTimes(4);
 });

 test('rejects affiliate commission above the Admin-configured 20 percent maximum',async()=>{
  const application={id:'application-4',user_id:'user-4',status:'pending'};
  const clientQuery=jest.fn()
   .mockResolvedValueOnce({rows:[application]})
   .mockResolvedValueOnce({rows:[{id:'user-4',status:'active'}]})
   .mockResolvedValueOnce({rows:[{id:7}]})
   .mockResolvedValueOnce({rows:[{value:'20.01'}]});
  withTransaction.mockImplementation(fn=>fn({query:clientQuery}));
  await expect(service.reviewApplication('application-4','approved',null,{id:'admin-1',role:'admin'}))
   .rejects.toMatchObject({code:'AFFILIATE_COMMISSION_CONFIG_INVALID',statusCode:503});
  expect(clientQuery).toHaveBeenCalledTimes(4);
 });

 test('reports only commission actually credited to the Affiliate Marketer DAHA Wallet',async()=>{
  query
   .mockResolvedValueOnce({rows:[{affiliate_code:'MLABC1234',total_clicks:8,total_orders:3,total_earnings:99,marketer_status:'approved'}]})
   .mockResolvedValueOnce({rows:[{balance:'125.00',currency:'GMD'}]})
   .mockResolvedValueOnce({rows:[{qualifying_orders:2,earned:'12.50'}]});
  const dashboard=await service.getDashboard('affiliate-user-1');
  expect(dashboard).toMatchObject({affiliateCode:'MLABC1234',qualifyingOrders:2,lifetimeEarned:12.5,walletBalance:125,currency:'GMD'});
  expect(query.mock.calls[2][0]).toContain("t.category='affiliate_commission'");
  expect(query.mock.calls[2][0]).toContain("t.reference_type='order_affiliate_payout'");
  expect(query.mock.calls[2][0]).toContain("cr.status='paid'");
 });

 test('requires an Admin rejection reason',async()=>{
  await expect(service.reviewApplication('application-1','rejected',' ',{id:'admin-1',role:'admin'}))
   .rejects.toMatchObject({code:'REJECTION_REASON_REQUIRED',statusCode:400});
  expect(withTransaction).not.toHaveBeenCalled();
 });
});
