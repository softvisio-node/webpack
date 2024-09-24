#!/usr/bin/env node

// preserve symlinks
await preserveSymlinks();

const { "default": Cli } = await import( "#core/cli" );
const { "default": Webpack } = await import( "#lib/webpack" );

const cli = {
    "title": "Webpack runner",
    "options": {
        "mode": {
            "short": "m",
            "description": `environment mode`,
            "default": "production",
            "schema": { "enum": [ "development", "production" ] },
        },
        "cordova": {
            "short": false,
            "description": "build for cordova",
            "default": false,
            "schema": { "type": "boolean" },
        },
        "analyzer": {
            "short": "a",
            "description": `Inject webpack bundle analyzer. Static report file will be created in the output dir after each compilation.`,
            "default": false,
            "schema": { "type": "boolean" },
        },
        "cache": {
            "short": "C",
            "description": `disable webpack cache`,
            "default": true,
            "schema": { "type": "boolean" },
        },
        "clear-cache": {
            "short": "c",
            "description": `clear webpack cache`,
            "default": false,
            "schema": { "type": "boolean" },
        },
        "listen": {
            "short": "l",
            "description": `Development server listen IP address.`,
            "default": "0.0.0.0",
            "schema": { "type": "string", "format": "ip-address" },
        },
        "http-port": {
            "short": "p",
            "description": `HTTP development server listen IP port.`,
            "default": 80,
            "schema": { "type": "integer", "format": "random-ip-port" },
        },
        "https-port": {
            "short": "P",
            "description": `HTTPS development server listen IP port.`,
            "default": 443,
            "schema": { "type": "integer", "format": "random-ip-port" },
        },
        "proxy-url": {
            "short": false,
            "description": `Proxy URL.`,
            "schema": { "type": "string", "format": "uri" },
        },
    },
    "arguments": {
        "command": {
            "description": `One of: "dev", "build", "dump"`,
            "required": true,
            "schema": { "type": "string", "enum": [ "dev", "build", "dump" ] },
        },
    },
};

await Cli.parse( cli );

const webpack = new Webpack( {
    "mode": process.cli.options.mode,
    "command": process.cli.arguments.command,
    "useAnalyzer": process.cli.options.analyzer,
    "useCache": process.cli.options.cache,
    "clearCache": process.cli.options[ "clear-cache" ],
    "buildCordova": process.cli.options.cordova,
    "listen": process.cli.options.listen,
    "httpPort": process.cli.options[ "http-port" ],
    "httpsPort": process.cli.options[ "https-port" ],
    "proxyUrl": process.cli.options[ "proxy-url" ],
} );

webpack.run();

async function preserveSymlinks ( { preserveSymlinksMain = true } = {} ) {
    const execArgv = new Set( process.execArgv ),
        preserveSymlinks = !execArgv.has( "--preserve-symlinks" ) && !process.env.NODE_PRESERVE_SYMLINKS;

    if ( preserveSymlinksMain ) {
        preserveSymlinksMain = !execArgv.has( "--preserve-symlinks-main" ) && !process.env.NODE_PRESERVE_SYMLINKS_MAIN;
    }

    if ( preserveSymlinks || preserveSymlinksMain ) {
        const { "default": childProcess } = await import( "node:child_process" ),
            { dirname, resolve } = await import( "node:path" ),
            { readlinkSync } = await import( "node:fs" );

        let scriptPath;

        try {
            scriptPath = resolve( dirname( process.argv[ 1 ] ), readlinkSync( process.argv[ 1 ] ) );
        }
        catch {
            scriptPath = process.argv[ 1 ];
        }

        const res = childProcess.spawnSync(
            process.argv[ 0 ],
            [

                //
                "--preserve-symlinks",
                "--preserve-symlinks-main",
                scriptPath,
                ...process.argv.slice( 2 ),
            ],
            {
                "cwd": process.cwd(),
                "env": {
                    ...process.env,
                    "NODE_PRESERVE_SYMLINKS": "1",
                    "NODE_PRESERVE_SYMLINKS_MAIN": preserveSymlinksMain
                        ? ""
                        : "1",
                },
                "stdio": "inherit",
            }
        );

        process.exit( res.status );
    }
}
