import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {encodeCBOR} from '@levischuck/tiny-cbor';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {authAction} from '../auth.js';
import {verifyToken} from '../firebase.js';
import {environment} from './helpers.js';
const b64=b=>Buffer.from(b).toString('base64url');
test('real WebAuthn registration/login verifies signature, origin, user verification, ownership and one-time challenge',async()=>{
  const env=environment(),person={sub:'coach',email:'test@example.invalid',auth_time:Math.floor(Date.now()/1000)},services={database:async()=>({role:'trainer'}),customToken:async(_,uid)=>'verified-'+uid};
  const call=(path,b={},p=person)=>authAction(path,b,env,p,services);
  try{
    await assert.rejects(()=>call('register/options',{},null));
    await assert.rejects(()=>call('register/options',{}, {...person,auth_time:1}));
    const reg=await call('register/options');
    const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'});
    const cose=encodeCBOR(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
    const id=Buffer.from('tempo-test-key'),rp=createHash('sha256').update('minjaedy.github.io').digest(),len=Buffer.alloc(2);len.writeUInt16BE(id.length);
    const client=Buffer.from(JSON.stringify({type:'webauthn.create',challenge:reg.options.challenge,origin:env.APP_ORIGIN}));
    const data=Buffer.concat([rp,Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),len,id,Buffer.from(cose)]);
    const response={id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(client),attestationObject:b64(encodeCBOR(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(data)]]))),transports:['internal']}};
    await assert.rejects(()=>call('register/verify',{response,challengeId:reg.challengeId},{...person,sub:'impostor'}));
    assert.equal((await call('register/verify',{response,challengeId:reg.challengeId})).ok,true);
    await assert.rejects(()=>call('register/verify',{response,challengeId:reg.challengeId}));
    const assertion=(challenge,origin=env.APP_ORIGIN,flags=0x05)=>{const c=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin})),counter=Buffer.alloc(4);counter.writeUInt32BE(1);const a=Buffer.concat([rp,Buffer.from([flags]),counter]);return {id:b64(id),rawId:b64(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(c),authenticatorData:b64(a),signature:b64(sign('sha256',Buffer.concat([a,createHash('sha256').update(c).digest()]),privateKey)),userHandle:b64('coach')}};};
    for(const [origin,flags] of [['https://attacker.invalid',5],[env.APP_ORIGIN,1]]){const r=await call('login/options',{},null);await assert.rejects(()=>call('login/verify',{challengeId:r.challengeId,response:assertion(r.options.challenge,origin,flags)},null));}
    const login=await call('login/options',{},null),auth=assertion(login.options.challenge),body={challengeId:login.challengeId,response:auth};
    assert.equal((await call('login/verify',body,null)).token,'verified-coach');await assert.rejects(()=>call('login/verify',body,null));
    assert.equal((await call('keys')).keys.length,1);await call('remove',{id:b64(id)});assert.equal((await call('keys')).keys.length,0);
  }finally{env.sqlite.close()}
});
test('Firebase ID tokens must belong to this project and a non-anonymous human account',async()=>{
  const pair=await generateKeyPair('RS256'),jwk=await exportJWK(pair.publicKey);jwk.kid='test';const keys=createLocalJWKSet({keys:[jwk]});
  const token=(changes={})=>new SignJWT({sub:'owner',iss:'https://securetoken.google.com/cale-b2c40',aud:'cale-b2c40',firebase:{sign_in_provider:'google.com'},...changes}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuedAt().setExpirationTime(changes.exp??'1h').sign(pair.privateKey);
  assert.equal((await verifyToken(await token(),'cale-b2c40',keys)).sub,'owner');
  for(const changes of [{aud:'other'},{iss:'https://attacker.invalid'},{firebase:{sign_in_provider:'anonymous'}},{tempo_service:true},{exp:1}])await assert.rejects(()=>token(changes).then(t=>verifyToken(t,'cale-b2c40',keys)));
});
