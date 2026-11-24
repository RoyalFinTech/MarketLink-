'use strict';
jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
const walletRouter=require('../wallets/routes');
const withdrawalRouter=require('./routes');

function getAuthorizationMiddleware(router,path,method){
 const layer=router.stack.find(item=>item.route&&item.route.path===path&&item.route.methods[method]);
 if(!layer) throw new Error('Route not found: '+method.toUpperCase()+' '+path);
 return layer.route.stack[1].handle;
}

describe('Affiliate Marketer wallet and withdrawal route access',()=>{
 test.each([
  [walletRouter,'/me','get'],
  [walletRouter,'/withdrawals','post'],
  [withdrawalRouter,'/me','get'],
  [withdrawalRouter,'/me','post'],
 ])('allows an authenticated Affiliate Marketer through %s %s',async(router,path,method)=>{
  const middleware=getAuthorizationMiddleware(router,path,method);
  const next=jest.fn();
  await middleware({user:{id:'affiliate-user-1',roles:['affiliate_marketer']}},{},next);
  expect(next).toHaveBeenCalledWith();
 });
});
