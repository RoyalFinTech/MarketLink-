jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
const {query}=require('../../config/db');
const {list,getById,update}=require('./service');

describe('product category filtering',()=>{
 beforeEach(()=>jest.clearAllMocks());
 test('binds a category ID in both the product list and count queries',async()=>{
  query.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{count:'0'}]});
  const result=await list({categoryId:17});
  expect(result.total).toBe(0);
  expect(query).toHaveBeenCalledTimes(2);
  const [listSql,listParams]=query.mock.calls[0];
  const [countSql,countParams]=query.mock.calls[1];
  expect(listSql).toContain('SELECT id FROM categories WHERE id=$1');
  expect(countSql).toContain('SELECT id FROM categories WHERE id=$1');
  expect(listParams).toEqual([17,20,0]);
  expect(countParams).toEqual([17]);
 });
 test('keeps search and category placeholders in the correct order',async()=>{
  query.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{count:'0'}]});
  await list({search:'rice',categoryId:17});
  const [listSql,listParams]=query.mock.calls[0];
  const [countSql,countParams]=query.mock.calls[1];
  expect(listSql).toContain('plainto_tsquery(\'english\',$1)');
  expect(listSql).toContain('SELECT id FROM categories WHERE id=$2');
  expect(countSql).toContain('plainto_tsquery(\'english\',$1)');
  expect(countSql).toContain('SELECT id FROM categories WHERE id=$2');
  expect(listParams).toEqual(['rice',17,20,0]);
  expect(countParams).toEqual(['rice',17]);
 });
 test('uses the recursive category branch so parent categories include active descendants',async()=>{
  query.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{count:'0'}]});
  await list({categoryId:17});
  expect(query.mock.calls[0][0]).toContain('WITH RECURSIVE category_branch');
  expect(query.mock.calls[0][0]).toContain('JOIN category_branch parent ON child.parent_id=parent.id');
 });
 test('clamps invalid catalog pagination before querying',async()=>{
  query.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{count:'0'}]});
  const result=await list({page:-5,limit:-2});
  expect(result).toMatchObject({page:1,limit:1});
  expect(query.mock.calls[0][1]).toEqual([1,0]);
 });

 test('keeps vendor and price filters aligned across list and count queries',async()=>{
  query.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{count:'0'}]});
  await list({vendorId:'vendor-1',minPrice:10,maxPrice:50});
  const [listSql,listParams]=query.mock.calls[0];
  const [countSql,countParams]=query.mock.calls[1];
  expect(listSql).toContain('p.vendor_id=$1');
  expect(listSql).toContain('(CASE WHEN p.admin_price_override_enabled THEN p.admin_price_override ELSE p.price END)>=$2');
  expect(listSql).toContain('(CASE WHEN p.admin_price_override_enabled THEN p.admin_price_override ELSE p.price END)<=$3');
  expect(countSql).toContain('p.vendor_id=$1');
  expect(countSql).toContain('(CASE WHEN p.admin_price_override_enabled THEN p.admin_price_override ELSE p.price END)>=$2');
  expect(countSql).toContain('(CASE WHEN p.admin_price_override_enabled THEN p.admin_price_override ELSE p.price END)<=$3');
  expect(listParams).toEqual(['vendor-1',10,50,20,0]);
  expect(countParams).toEqual(['vendor-1',10,50]);
 });
 test('keeps the vendors join in the count query for vendor-owned unpublished listings',async()=>{
  query.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{count:'0'}]});
  await list({vendorId:'vendor-1',includeAllStatuses:true});
  const [countSql,countParams]=query.mock.calls[1];
  expect(countSql).toContain('LEFT JOIN vendors v ON v.user_id=p.vendor_id');
  expect(countSql).toContain('WHERE p.vendor_id=$1');
  expect(countSql).not.toContain("p.status='active'");
  expect(countParams).toEqual(['vendor-1']);
 });
 test('rejects unpublished catalogue access without vendor ownership before querying',async()=>{
  await expect(list({includeAllStatuses:true})).rejects.toMatchObject({statusCode:403,code:'FORBIDDEN'});
  expect(query).not.toHaveBeenCalled();
 });

 test('public product listing returns only the effective customer price, not Admin or vendor-private data',async()=>{
  query.mockResolvedValueOnce({rows:[{id:'product-1',price:'125.00'}]}).mockResolvedValueOnce({rows:[{count:'1'}]});
  const result=await list({page:1,limit:20});
  expect(result.items[0]).toMatchObject({price:'125.00'});
  expect(result.items[0]).not.toHaveProperty('vendor_listed_price');
  expect(result.items[0]).not.toHaveProperty('admin_price_override');
  expect(result.items[0]).not.toHaveProperty('admin_price_override_enabled');
  expect(result.items[0]).not.toHaveProperty('admin_price_override_note');
  const sql=query.mock.calls[0][0];
  expect(sql).toContain('(CASE WHEN p.admin_price_override_enabled THEN p.admin_price_override ELSE p.price END) AS price');
  expect(sql).not.toContain('p.price AS vendor_listed_price');
  expect(sql).not.toContain('p.admin_price_override_note');
 });

 test('vendor-owned product listing keeps the vendor price separate from the customer price',async()=>{
  query.mockResolvedValueOnce({rows:[{id:'product-1',price:'100.00',effective_customer_price:'125.00',admin_pricing_adjusted:true}]}).mockResolvedValueOnce({rows:[{count:'1'}]});
  const result=await list({vendorId:'vendor-1',includeAllStatuses:true});
  expect(result.items[0]).toMatchObject({price:'100.00',effective_customer_price:'125.00',admin_pricing_adjusted:true});
  expect(query.mock.calls[0][0]).toContain('p.price AS price');
  expect(query.mock.calls[0][0]).toContain('AS effective_customer_price');
  expect(query.mock.calls[0][0]).toContain('AS admin_pricing_adjusted');
  expect(query.mock.calls[0][0]).not.toContain('admin_price_override_note');
 });

 test('public product details strip Admin override metadata and vendor base price',async()=>{
  query.mockResolvedValueOnce({rows:[{
    id:'product-1',price:'100.00',effective_customer_price:'125.00',vendor_listed_price:'100.00',
    admin_price_override:'125.00',admin_price_override_enabled:true,admin_price_override_by:'admin-id',
    admin_price_override_at:'2026-11-23T16:00:00.000Z',admin_price_override_note:'Private reason'
  }]});
  const product=await getById('product-1');
  expect(product.price).toBe(125);
  for(const key of ['vendor_listed_price','effective_customer_price','admin_price_override','admin_price_override_enabled','admin_price_override_by','admin_price_override_at','admin_price_override_note']){
    expect(product).not.toHaveProperty(key);
  }
 });

 test('vendor product edits return their listed price and effective customer price without Admin audit fields',async()=>{
  query.mockResolvedValueOnce({rows:[{vendor_id:'vendor-1'}]}).mockResolvedValueOnce({rows:[{
   id:'product-1',vendor_id:'vendor-1',price:'100.00',admin_price_override:'125.00',
   admin_price_override_enabled:true,admin_price_override_by:'admin-id',
   admin_price_override_at:'2026-11-23T16:00:00.000Z',admin_price_override_note:'Private reason'
  }]});
  const result=await update('product-1','vendor-1',false,{name:'Rice Plus'});
  expect(result).toMatchObject({price:'100.00',effective_customer_price:125,admin_pricing_adjusted:true});
  for(const key of ['admin_price_override','admin_price_override_enabled','admin_price_override_by','admin_price_override_at','admin_price_override_note']){
   expect(result).not.toHaveProperty(key);
  }
 });


});
