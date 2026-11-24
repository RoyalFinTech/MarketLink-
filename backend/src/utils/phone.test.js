'use strict';

const {normalizePhone,toGambianNational9,detectGambianOperator}=require('./phone');

describe('Gambian phone normalization',()=>{
  test('accepts a complete nine-digit national number without guessing its carrier',()=>{
    expect(normalizePhone('891234567','GM')).toMatchObject({
      e164:'+220891234567',countryIso:'GM',national:'891234567',operator:null
    });
    expect(toGambianNational9('891234567')).toBe('891234567');
    expect(detectGambianOperator('891234567')).toBeNull();
  });

  test('continues recognizing the documented Africell, QCell and Comium prefixes',()=>{
    expect(normalizePhone('871234567','GM').operator).toBe('AFRICELL');
    expect(normalizePhone('831234567','GM').operator).toBe('QCELL');
    expect(normalizePhone('861234567','GM').operator).toBe('COMIUM');
  });

  test('keeps legacy seven-digit 9XX numbers parseable for existing-account sign-in',()=>{
    expect(normalizePhone('9123456','GM')).toMatchObject({
      e164:'+2209123456',countryIso:'GM',national:'9123456',operator:'UNATTRIBUTED_9'
    });
  });

  test('rejects a nine-digit number beginning with zero',()=>{
    expect(()=>normalizePhone('012345678','GM')).toThrow('Please check your Gambian mobile number.');
  });

  test('rejects incomplete or unmappable legacy Gambian numbers',()=>{
    expect(()=>normalizePhone('1234567','GM')).toThrow('Please check your Gambian mobile number.');
    expect(()=>normalizePhone('12345678','GM')).toThrow('Please check your Gambian mobile number.');
  });
});
