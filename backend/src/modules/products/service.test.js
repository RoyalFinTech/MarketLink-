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

});
