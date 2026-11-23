jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
const {query}=require('../../config/db');
const {list}=require('./service');

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

 test('public product listing exposes Admin customer price while retaining vendor-listed price',async()=>{
  query.mockResolvedValueOnce({rows:[{id:'product-1',price:'125.00',vendor_listed_price:'100.00',admin_price_override_enabled:true}]}).mockResolvedValueOnce({rows:[{count:'1'}]});
  const result=await list({page:1,limit:20});
  expect(result.items[0]).toMatchObject({price:'125.00',vendor_listed_price:'100.00',admin_price_override_enabled:true});
  expect(query.mock.calls[0][0]).toContain('(CASE WHEN p.admin_price_override_enabled THEN p.admin_price_override ELSE p.price END) AS price');
  expect(query.mock.calls[0][0]).toContain('p.price AS vendor_listed_price');
 });


});
