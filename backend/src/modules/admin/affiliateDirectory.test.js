'use strict';
jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
const {query}=require('../../config/db');
const {getAffiliateDirectory}=require('./service');

describe('Admin Affiliate Marketer directory earnings',()=>{
 beforeEach(()=>jest.clearAllMocks());

 test('shows commission actually credited to the marketer wallet, not merely delivered order estimates',async()=>{
  query
   .mockResolvedValueOnce({rows:[{user_id:'affiliate-user-1',affiliate_code:'MLABC1234',commission_pct:'2.00',marketer_status:'approved',wallet_balance:'125.00',delivered_orders:3,settled_commission:'12.50'}]})
   .mockResolvedValueOnce({rows:[{total:1}]});
  const result=await getAffiliateDirectory({page:1,limit:50});
  expect(result.items[0]).toMatchObject({user_id:'affiliate-user-1',settled_commission:'12.50'});
  const sql=query.mock.calls[0][0];
  expect(sql).toContain("t.category='affiliate_commission'");
  expect(sql).toContain("t.reference_type='order_affiliate_payout'");
  expect(sql).toContain("credited_wallet.user_id=a.user_id");
  expect(sql).not.toContain("sum(o.affiliate_commission_amount)");
 });
});
