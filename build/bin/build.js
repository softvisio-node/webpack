#!/usr/bin/env node

import Cli from "#core/cli";
import ExternalResourceBuilder from "#core/external-resource-builder";
import LocalSoftvisioNet from "#lib/local.softvisio.net";

const CLI = {
    "title": "Update resources",
    "options": {
        "force": {
            "description": "Force build",
            "default": false,
            "schema": {
                "type": "boolean",
            },
        },
    },
};

await Cli.parse( CLI );

const res = await ExternalResourceBuilder.build(
    [

        //
        LocalSoftvisioNet,
    ],
    { "force": process.cli.options.force }
);

if ( !res.ok ) process.exit( 1 );
