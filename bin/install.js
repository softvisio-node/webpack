#!/usr/bin/env node

import externalResources from "#core/external-resources";

externalResources.add( {
    "id": "softvisio-node/webpack/resources/local.softvisio.net",
    "node": true,
} );

const res = await externalResources.update( {
    "force": false,
    "silent": false,
} );

if ( !res.ok ) process.exit( 1 );
