jest.mock('../utils/logger',()=>({error:jest.fn()}));
const logger=require('../utils/logger');
const {errorHandler,AppError}=require('./errorHandler');

function response(){
 const res={status:jest.fn(),json:jest.fn()};
 res.status.mockReturnValue(res);
 return res;
}

describe('API error handling',()=>{
 beforeEach(()=>jest.clearAllMocks());

 test('returns invalid bearer tokens as 401 without logging a server fault',()=>{
  const res=response();
  errorHandler({name:'JsonWebTokenError',message:'invalid signature'}, {}, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({success:false,error:'Invalid token.',code:'INVALID_TOKEN'});
  expect(logger.error).not.toHaveBeenCalled();
 });

 test('returns expired bearer tokens as 401 without logging a server fault',()=>{
  const res=response();
  errorHandler({name:'TokenExpiredError',message:'jwt expired'}, {}, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({success:false,error:'Token expired.',code:'TOKEN_EXPIRED'});
  expect(logger.error).not.toHaveBeenCalled();
 });

 test('continues to log unexpected application errors',()=>{
  const res=response();
  errorHandler(new Error('database unavailable'), {}, res, jest.fn());
  expect(logger.error).toHaveBeenCalledWith('Unexpected error',expect.objectContaining({message:'database unavailable'}));
  expect(res.status).toHaveBeenCalledWith(500);
 });

 test('does not log operational application errors',()=>{
  const res=response();
  errorHandler(new AppError('Not found',404,'NOT_FOUND'), {}, res, jest.fn());
  expect(logger.error).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(404);
 });
});
