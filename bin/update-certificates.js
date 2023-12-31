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

const res = await acme.getCertificate( "local.softvisio.net", {
    "createChallenge": createChallenge,
    "deleteChallenge": deleteChallenge,
} );

if ( !res.ok ) {
    console.log( res + "" );

    process.exit( 1 );
}

async function createChallenge ( { type, domain, dnsTxtRecordName, httpLocation, token, content } ) {
    if ( type !== "dns-01" ) return false;

    var res;

    // get zone
    res = await getDomainZone( domain );
    if ( !res.ok ) return false;

    const zone = res.data;

    // delete record, if exists
    await deleteDnsRecord( dnsTxtRecordName, zone );

    // create record
    res = await cloudflareApi.createDnsRecord( zone.id, {
        "type": "TXT",
        "name": dnsTxtRecordName,
        content,
        "ttl": 60,
    } );

    return res.ok;
}

async function deleteChallenge ( { type, domain, dnsTxtRecordName, token, httpLocation } ) {
    if ( type !== "dns-01" ) return false;

    var res;

    // get zone
    res = await getDomainZone( domain );
    if ( !res.ok ) return;

    const zone = res.data;

    await deleteDnsRecord( dnsTxtRecordName, zone );
}

async function getDomainZone ( domain ) {
    const res = await cloudflareApi.getZones();
    if ( !res.ok ) return;

    for ( const zone of res.data ) {
        if ( domain === zone.name || domain.endsWith( `.${zone.name}` ) ) {
            return result( 200, zone );
        }
    }

    return result( [404, `Domain zone not found`] );
}

async function deleteDnsRecord ( dnsTxtRecordName, zone ) {
    var res;

    // get records
    res = await cloudflareApi.getDnsRecords( zone.id );
    if ( !res.ok ) return;

    // delete record
    for ( const record of res.data ) {
        if ( record.type !== "TXT" ) continue;

        if ( record.name !== dnsTxtRecordName ) continue;

        res = await cloudflareApi.deleteDnsRecord( zone.id, record.id );

        return;
    }
}
