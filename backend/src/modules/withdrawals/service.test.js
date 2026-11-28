jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
const {query}=require('../../config/db');
const {listMine,listPendingForAdmin}=require('./service');

describe('withdrawal history pagination',()=>{
 beforeEach(()=>{jest.clearAllMocks();query.mockResolvedValue({rows:[]});});
 test('clamps customer withdrawal history pagination',async()=>{
  await listMine('customer-id',{page:-3,limit:-5});
  expect(query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $2 OFFSET $3'),['customer-id',1,0]);
 });
 test('clamps Admin withdrawal queue pagination and includes every reserved state',async()=>{
  await listPendingForAdmin({page:-2,limit:500});
  expect(query).toHaveBeenCalledWith(expect.stringContaining("status IN ('initiating','processing','payout_pending')"),[100,0]);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $1 OFFSET $2'),[100,0]);
 });
 test('preserves customer and status parameter ordering',async()=>{
  await listMine('customer-id',{page:2,limit:10,status:'completed'});
  expect(query).toHaveBeenCalledWith(expect.stringContaining('status=$2'),['customer-id','completed',10,10]);
 });
});
