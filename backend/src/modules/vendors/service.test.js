jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));

const {query,withTransaction}=require('../../config/db');
const {register,approve,updateProfile,updateAdminProfile}=require('./service');

describe('vendor application registration and approval',()=>{
 const userId='22222222-2222-4222-8222-222222222222';
 const adminId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 let clientQuery;
 beforeEach(()=>{
  jest.clearAllMocks();
  clientQuery=jest.fn();
  withTransaction.mockImplementation(callback=>callback({query:clientQuery}));
 });
 test('stores a pending vendor application, assigns the role, creates a wallet and alerts admins',async()=>{
  query
   .mockResolvedValueOnce({rows:[{name:'Groceries',parent_name:'Food'}]})
   .mockResolvedValueOnce({rows:[]});
  clientQuery
   .mockResolvedValueOnce({rows:[{user_id:userId,kyc_status:'pending'}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]});
  const result=await register(userId,{
   businessName:'Bakoteh Fresh Shop',businessCategory:'Groceries',businessAddress:'Bakoteh, Kanifing Municipality',
   phone:'+220871234567',whatsappNumber:'+220831234567',
   idDocumentUrl:'https://api.marketlink.test/id.pdf',shopPhotoUrl:'https://api.marketlink.test/shop.jpg',
   latitude:13.43313,longitude:-16.69101
  });
  expect(result).toMatchObject({user_id:userId,kyc_status:'pending'});
  expect(clientQuery.mock.calls[0][0]).toContain("VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'pending')");
  expect(clientQuery.mock.calls[0][1]).toContain('+220871234567');
  expect(clientQuery.mock.calls[0][1]).toContain('+220831234567');
  expect(clientQuery.mock.calls[0][1]).toContain(13.43313);
  expect(clientQuery.mock.calls[1][0]).toContain("name = 'vendor'");
  expect(clientQuery.mock.calls[2][0]).toContain('INSERT INTO wallets');
  expect(clientQuery.mock.calls[3][0]).toContain('vendor_application_submitted');
  expect(clientQuery.mock.calls[3][0]).toContain("r.name IN ('admin','super_admin','moderator')");
 });
 test('blocks duplicate vendor applications for the same account',async()=>{
  query.mockResolvedValueOnce({rows:[{user_id:userId}]});
  await expect(register(userId,{businessName:'Another Shop',phone:'+220871234567'}))
   .rejects.toMatchObject({statusCode:409,code:'VENDOR_EXISTS'});
  expect(withTransaction).not.toHaveBeenCalled();
 });
 test('vendor profile update binds fields and owner ID as SQL parameters',async()=>{
  query.mockResolvedValueOnce({rows:[{user_id:userId,whatsapp_number:'+220831234567'}]});
  const result=await updateProfile(userId,{whatsappNumber:'+220831234567'});
  expect(result.whatsapp_number).toBe('+220831234567');
  expect(query.mock.calls[0][0]).toContain('whatsapp_number = $1 WHERE user_id = $2 RETURNING *');
  expect(query.mock.calls[0][1]).toEqual(['+220831234567',userId]);
 });
 test('Admin can update commission percentage but vendor self-service cannot',async()=>{
  await expect(updateProfile(userId,{commissionPct:3.5})).rejects.toMatchObject({statusCode:400,code:'VALIDATION_ERROR'});
  query.mockResolvedValueOnce({rows:[{user_id:userId,commission_pct:'3.50'}]});
  const result=await updateAdminProfile(userId,{commissionPct:3.5});
  expect(result.commission_pct).toBe('3.50');
  expect(query.mock.calls[0][0]).toContain('commission_pct = $1 WHERE user_id = $2 RETURNING *');
  expect(query.mock.calls[0][1]).toEqual([3.5,userId]);
 });
 test('admin approval changes KYC state, notifies the vendor and writes an audit entry',async()=>{
  const before={user_id:userId,kyc_status:'pending'};
  const updated={user_id:userId,kyc_status:'approved'};
  query
   .mockResolvedValueOnce({rows:[before]})
   .mockResolvedValueOnce({rows:[updated]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[]});
  const result=await approve(userId,{id:adminId,role:'admin',meta:{}},'Documents reviewed');
  expect(result).toEqual(updated);
  expect(query.mock.calls[1][0]).toContain("SET kyc_status = 'approved'");
  expect(query.mock.calls[1][1]).toEqual([adminId,'Documents reviewed',userId]);
  expect(query.mock.calls[2][0]).toContain('vendor_approved');
  expect(query.mock.calls[3][1][2]).toBe('vendor.approved');
 });
});
