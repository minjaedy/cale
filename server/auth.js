import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {customToken,database} from './firebase.js';
export const sql=(env,q,...args)=>env.DB.prepare(q).bind(...args);
export const problem=(message,status=400)=>Object.assign(Error(message),{status});
async function challenge(env,uid,kind,value){const id=crypto.randomUUID();await sql(env,'INSERT INTO challenges(id,uid,kind,challenge,expires) VALUES(?,?,?,?,?)',id,uid,kind,value,Date.now()+300000).run();return id;}
async function consume(env,id,uid,kind){const c=await sql(env,'DELETE FROM challenges WHERE id=? AND uid=? AND kind=? AND expires>? RETURNING *',String(id||''),uid,kind,Date.now()).first();if(!c)throw problem('인증 시간이 지났어요. 다시 시도해 주세요.');return c;}
export async function authAction(path,b,env,current,services={database,customToken}){
  const rpID=new URL(env.APP_ORIGIN).hostname;
  if(path.startsWith('register/')||path==='keys'||path==='remove'){
    if(!current)throw problem('먼저 Google로 로그인해 주세요.',401);
    const profile=await services.database(env,'tempo/coaching/profiles/'+current.sub);
    if(profile?.role!=='trainer')throw problem('트레이너 입장 후 등록할 수 있어요.',403);
    if(path==='keys')return {keys:(await sql(env,'SELECT id,created_at FROM passkeys WHERE uid=? ORDER BY created_at DESC',current.sub).all()).results};
    if(Date.now()/1000-Number(current.auth_time)>300)throw problem('안전을 위해 Google로 다시 인증한 후 시도해 주세요.',401);
    if(path==='remove'){await sql(env,'DELETE FROM passkeys WHERE id=? AND uid=?',String(b.id||''),current.sub).run();return {ok:true};}
    if(path==='register/options'){
      const existing=(await sql(env,'SELECT id FROM passkeys WHERE uid=?',current.sub).all()).results;
      if(existing.length>=5)throw problem('패스키는 계정당 5개까지 등록할 수 있어요.');
      const options=await generateRegistrationOptions({rpName:'TEMPO Trainer',rpID,userName:'TEMPO · '+(current.email||current.name||current.sub),userDisplayName:'TEMPO 트레이너',userID:new TextEncoder().encode(current.sub),attestationType:'none',excludeCredentials:existing.map(k=>({id:k.id})),authenticatorSelection:{residentKey:'required',userVerification:'required',authenticatorAttachment:'platform'}});
      return {options,challengeId:await challenge(env,current.sub,'register',options.challenge)};
    }
    const c=await consume(env,b.challengeId,current.sub,'register');
    const result=await verifyRegistrationResponse({response:b.response,expectedChallenge:c.challenge,expectedOrigin:env.APP_ORIGIN,expectedRPID:rpID,requireUserVerification:true});
    if(!result.verified)throw problem('패스키를 확인하지 못했어요.',403);
    const k=result.registrationInfo.credential;
    await sql(env,'INSERT INTO passkeys(id,uid,public_key,counter,transports,created_at) VALUES(?,?,?,?,?,?)',k.id,current.sub,Buffer.from(k.publicKey).toString('base64'),k.counter,JSON.stringify(k.transports||[]),Date.now()).run();return {ok:true};
  }
  if(path==='login/options'){
    const options=await generateAuthenticationOptions({rpID,userVerification:'required'});
    return {options,challengeId:await challenge(env,'','login',options.challenge)};
  }
  if(path==='login/verify'){
    const c=await consume(env,b.challengeId,'','login');
    const k=await sql(env,'SELECT * FROM passkeys WHERE id=?',String(b.response?.id||'')).first();
    if(!k)throw problem('TEMPO에 등록한 패스키가 아니에요. Google로 먼저 입장해 주세요.',403);
    const profile=await services.database(env,'tempo/coaching/profiles/'+k.uid);
    if(profile?.role!=='trainer')throw problem('트레이너 계정으로 다시 로그인해 주세요.',403);
    const result=await verifyAuthenticationResponse({response:b.response,expectedChallenge:c.challenge,expectedOrigin:env.APP_ORIGIN,expectedRPID:rpID,credential:{id:k.id,publicKey:new Uint8Array(Buffer.from(k.public_key,'base64')),counter:k.counter,transports:JSON.parse(k.transports)},requireUserVerification:true});
    if(!result.verified)throw problem('인증하지 못했어요.',403);
    if(b.response.response.userHandle&&Buffer.from(b.response.response.userHandle,'base64url').toString()!==k.uid)throw problem('패스키 계정이 일치하지 않아요.',403);
    const updated=await sql(env,'UPDATE passkeys SET counter=? WHERE id=? AND counter=?',result.authenticationInfo.newCounter,k.id,k.counter).run();
    if(!updated.meta.changes)throw problem('동시에 다른 인증이 진행됐어요. 다시 시도해 주세요.');
    return {token:await services.customToken(env,k.uid,{tempo_passkey:true})};
  }
  throw problem('지원하지 않는 요청이에요.',404);
}
