import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
  try{
    const body=await req.json().catch(()=>({}));
    const email=String(body?.email||"").trim();
    const customerName=String(body?.customer_name||"").trim();
    const url=Deno.env.get("SUPABASE_URL")!;
    const secretJson=Deno.env.get("SUPABASE_SECRET_KEYS");
    const secret=secretJson?JSON.parse(secretJson).default:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!secret)return json({error:"SERVER_CONFIG"},500);
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await admin.rpc("create_test_order",{p_email:email,p_customer_name:customerName||null,p_game_slug:"spiknuti"});
    if(error){
      if(error.message.includes("INVALID_EMAIL"))return json({error:"INVALID_EMAIL"},400);
      throw error;
    }
    return json({ok:true,...data});
  }catch(e){return json({error:"CREATE_ORDER_FAILED",message:e instanceof Error?e.message:String(e)},500)}
});
