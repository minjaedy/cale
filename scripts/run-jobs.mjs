// Independent fallback for Cloudflare trigger propagation or a missed invocation.
const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience','tempo-food-sync');
const tokenResponse=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},signal:AbortSignal.timeout(15000)});
if(!tokenResponse.ok)throw Error('Workflow authentication failed');
const {value}=await tokenResponse.json();
const result=await fetch('https://tempo-coach.couple-private-push.workers.dev/jobs/run',{method:'POST',headers:{Authorization:'Bearer '+value,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(120000)});
if(!result.ok)throw Error('Scheduled maintenance failed: HTTP '+result.status);
console.log('Scheduled maintenance completed.');
