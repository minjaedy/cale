import {createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8} from 'jose';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export async function verifyToken(token,project,keySet=keys){
  const {payload}=await jwtVerify(token,keySet,{algorithms:['RS256'],issuer:'https://securetoken.google.com/'+project,audience:project});
  if(!payload.sub||payload.sub.length>128||payload.firebase?.sign_in_provider==='anonymous'||payload.tempo_service||payload.tempo_retention)throw Error('로그인이 필요해요.');
  return payload;
}
export async function identity(request,env){
  const value=request.headers.get('Authorization')||'';
  if(!value.startsWith('Bearer '))throw Object.assign(Error('Google 또는 패스키로 로그인해 주세요.'),{status:401});
  try{return await verifyToken(value.slice(7),env.FIREBASE_PROJECT)}catch{throw Object.assign(Error('로그인 시간이 지났어요. 다시 로그인해 주세요.'),{status:401})}
}
export async function customToken(env,uid,claims={}){
  const account=JSON.parse(env.FIREBASE_ACCOUNT),key=await importPKCS8(account.private_key,'RS256');
  return new SignJWT({uid,claims}).setProtectedHeader({alg:'RS256',typ:'JWT'}).setIssuer(account.client_email).setSubject(account.client_email).setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit').setIssuedAt().setExpirationTime('1h').sign(key);
}
let cached;
export async function serviceToken(env){
  if(cached?.project===env.FIREBASE_PROJECT&&cached.until>Date.now()+60000)return cached.token;
  const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key='+env.FIREBASE_API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:await customToken(env,'tempo-service',{tempo_service:true}),returnSecureToken:true}),signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Error('서버 인증에 연결하지 못했어요.');
  const data=await r.json();cached={project:env.FIREBASE_PROJECT,token:data.idToken,until:Date.now()+Number(data.expiresIn)*1000};return cached.token;
}
export async function database(env,path,{token,method='GET',body,query}={}){
  if(!/^tempo\/coaching\/[a-zA-Z0-9_/-]+$/.test(path)&&!/^tempo\/users\/[a-zA-Z0-9_-]+\/(events|days)$/.test(path))throw Error('잘못된 데이터 경로예요.');
  const url=new URL(env.FIREBASE_DATABASE+'/'+path+'.json');url.searchParams.set('auth',token||await serviceToken(env));
  for(const [key,value] of Object.entries(query||{}))url.searchParams.set(key,JSON.stringify(value));
  const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw Object.assign(Error(r.status===401||r.status===403?'접근 권한이 없어요. 트레이너 연결을 확인해 주세요.':'데이터를 저장하지 못했어요. 다시 시도해 주세요.'),{status:r.status===401||r.status===403?403:503});
  return r.json();
}
