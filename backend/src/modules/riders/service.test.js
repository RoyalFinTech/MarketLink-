jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('../../utils/logger',()=>({info:jest.fn(),warn:jest.fn(),error:jest.fn()}));

const {query}=require('../../config/db');
const {getDeliveryHistory}=require('./service');

describe('rider delivery history cash reconciliation data',()=>{
 beforeEach(()=>jest.clearAllMocks());
 test('returns COD payment and remittance status without multiplying delivery rows',async()=>{
  const row={id:'delivery-1',payment_method:'cod',cod_payment_id:'payment-1',cod_payment_amount:'145.00',cod_remittance_status:'rejected',cod_remittance_review_note:'Reference not found in company statement'};
  query.mockResolvedValue({rows:[row]});
  const result=await getDeliveryHistory('rider-1',{page:1,limit:20});
  expect(result).toEqual([row]);
  const [sql,params]=query.mock.calls[0];
  expect(sql).toContain('LEFT JOIN LATERAL');
  expect(sql).toContain("p.method='cod'");
  expect(sql).toContain('LEFT JOIN cod_cash_remittances');
  expect(sql).toContain('ccr.status AS cod_remittance_status');
  expect(sql).toContain('ccr.review_note AS cod_remittance_review_note');
  expect(sql).toContain('LEFT JOIN LATERAL');
  expect(params).toEqual(['rider-1',20,0]);
 });
});
