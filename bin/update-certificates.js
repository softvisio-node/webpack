#!/usr/bin/env node

import env from "#core/env";
import Acme from "#core/api/acme";
import Cloudflare from "#core/api/cloudflare";

env.loadUserEnv();

var cloudflareApi;

if ( process.env.CLOUDFLARE_KEY && process.env.CLOUDFLARE_EMAIL ) {
    cloudflareApi = new Cloudflare( process.env.CLOUDFLARE_KEY, process.env.CLOUDFLARE_EMAIL );
}
else if ( process.env.CLOUDFLARE_TOKEN ) {
    cloudflareApi = new Cloudflare( process.env.CLOUDFLARE_TOKEN );
}

if ( !cloudflareApi ) {
    console.log( `CloudFlare API not avaulable` );

    process.exit( 1 );
}

const acme = new Acme( {
    "provider": "letsencrypt",
    "test": true,
    "email": "zdm@softvisio.net",
    "accountKey": null,
} );

const res = await acme.getCertificate( "local.softvisio.net", {} );

if ( !res.ok ) {
    console.log( res + "" );

    process.exit( 1 );
}
