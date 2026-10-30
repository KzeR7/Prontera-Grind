// Defence in depth for the production Pages project's branch/deployment URLs.
// Even if Cloudflare unexpectedly supplies production bindings to a preview,
// never allow that preview to run account, save, GM, prize or social APIs.
// The production pages.dev hostname itself and the separately named staging
// project are unaffected. Old preview deployments need separate review.
const isProductionPreview=host=>host.toLowerCase().replace(/\.$/,'').endsWith('.prontera-grind.pages.dev');
export async function onRequest(context) {
  const host=new URL(context.request.url).hostname;
  let headerHost='';
  try { headerHost=new URL('http://'+(context.request.headers.get('host')||'')).hostname; } catch {}
  // The URL is the principal check. Checking Host as well can only add a
  // refusal, not bypass it; local proxies may preserve the external Host only.
  if(isProductionPreview(host)||isProductionPreview(headerHost)) {
    return new Response(JSON.stringify({err:'Cloud APIs are disabled on production-project previews.'}),{
      status:503,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
    });
  }
  return context.next();
}
