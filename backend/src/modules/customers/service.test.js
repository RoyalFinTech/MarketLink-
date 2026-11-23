jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));

const {query,withTransaction}=require('../../config/db');
const {addAddress,updateAddress,getWishlist}=require('./service');

describe('customer wishlist price privacy',()=>{
 const customerId='77777777-7777-4777-8777-777777777777';
 beforeEach(()=>jest.clearAllMocks());
 test('returns Admin-effective price without vendor raw price or override audit metadata',async()=>{
  query.mockResolvedValueOnce({rows:[{product_id:'product-1',name:'Rice',price:'125.00'}]});
  const result=await getWishlist(customerId,{page:1,limit:20});
  expect(result[0]).toMatchObject({price:'125.00'});
  expect(result[0]).not.toHaveProperty('vendor_listed_price');
  const sql=query.mock.calls[0][0];
  expect(sql).toContain('CASE WHEN p.admin_price_override_enabled THEN p.admin_price_override ELSE p.price END AS price');
  expect(sql).not.toContain('p.price AS vendor_listed_price');
  expect(sql).not.toContain('admin_price_override_note');
 });
});

describe('customer saved delivery addresses',()=>{
 const customerId='77777777-7777-4777-8777-777777777777';
 const addressId='88888888-8888-4888-8888-888888888888';
 let clientQuery;
 beforeEach(()=>{
  jest.clearAllMocks();
  clientQuery=jest.fn();
  withTransaction.mockImplementation(callback=>callback({query:clientQuery}));
 });
 test('saves the selected Gambian place pin and preserves a valid zero coordinate',async()=>{
  const saved={id:addressId,customer_id:customerId,full_address:'Banjul, The Gambia',latitude:'0',longitude:'-16.58',is_default:true};
  clientQuery
   .mockResolvedValueOnce({rows:[{user_id:customerId}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[saved]});
  const result=await addAddress(customerId,{
   label:'Home',fullAddress:'Banjul, The Gambia',area:'Banjul',
   latitude:0,longitude:-16.58,isDefault:true
  });
  expect(result).toEqual(saved);
  expect(clientQuery.mock.calls[0][0]).toContain('FROM customers WHERE user_id = $1 FOR UPDATE');
  expect(clientQuery.mock.calls[1][0]).toContain('SET is_default = FALSE');
  expect(clientQuery.mock.calls[2][0]).toContain('latitude, longitude, is_default');
  expect(clientQuery.mock.calls[2][1]).toEqual([customerId,'Home','Banjul, The Gambia','Banjul',0,-16.58,true]);
 });
 test('updates a saved delivery address pin only for the authenticated customer owner',async()=>{
  const updated={id:addressId,customer_id:customerId,latitude:'13.27',longitude:'-16.65'};
  clientQuery
   .mockResolvedValueOnce({rows:[{user_id:customerId}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[updated]});
  const result=await updateAddress(customerId,addressId,{latitude:13.27,longitude:-16.65,isDefault:true});
  expect(result).toEqual(updated);
  expect(clientQuery.mock.calls[0][0]).toContain('FROM customers WHERE user_id = $1 FOR UPDATE');
  expect(clientQuery.mock.calls[1][0]).toContain('SET is_default = FALSE');
  expect(clientQuery.mock.calls[2][0]).toContain('WHERE id = $4 AND customer_id = $5 RETURNING *');
  expect(clientQuery.mock.calls[2][1]).toEqual([13.27,-16.65,true,addressId,customerId]);
 });
 test('does not change a different customer’s saved address',async()=>{
  clientQuery.mockResolvedValueOnce({rows:[]});
  await expect(updateAddress(customerId,addressId,{latitude:13.27,longitude:-16.65}))
   .rejects.toMatchObject({statusCode:404,code:'ADDRESS_NOT_FOUND'});
 });

 test('rejects a latitude without a longitude before writing',async()=>{
  await expect(addAddress(customerId,{fullAddress:'Banjul',latitude:13.45}))
   .rejects.toMatchObject({statusCode:400,code:'INCOMPLETE_COORDINATES'});
  expect(clientQuery).not.toHaveBeenCalled();
 });

 test('rejects partial coordinate edits without changing the saved pin',async()=>{
  await expect(updateAddress(customerId,addressId,{latitude:13.45}))
   .rejects.toMatchObject({statusCode:400,code:'INCOMPLETE_COORDINATES'});
  expect(clientQuery).not.toHaveBeenCalled();
 });

 test('locks the customer row before changing the default address',async()=>{
  clientQuery
   .mockResolvedValueOnce({rows:[{user_id:customerId}]})
   .mockResolvedValueOnce({rows:[]})
   .mockResolvedValueOnce({rows:[{id:addressId,customer_id:customerId,is_default:true}]});
  await addAddress(customerId,{fullAddress:'Serrekunda',isDefault:true});
  expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
 });
});
