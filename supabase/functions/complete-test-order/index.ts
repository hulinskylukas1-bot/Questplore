import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
  try{
    const body=await req.json().catch(()=>({}));
    const orderId=String(body?.order_id||"").trim();
    if(!orderId)return json({error:"MISSING_ORDER_ID"},400);
    const url=Deno.env.get("SUPABASE_URL")!;
    const secretJson=Deno.env.get("SUPABASE_SECRET_KEYS");
    const secret=secretJson?JSON.parse(secretJson).default:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!secret)return json({error:"SERVER_CONFIG"},500);
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await admin.rpc("complete_test_order",{p_order_id:orderId});
    if(error)throw error;
    return json(data);
  }catch(e){return json({error:"COMPLETE_ORDER_FAILED",message:e instanceof Error?e.message:String(e)},500)}
});
