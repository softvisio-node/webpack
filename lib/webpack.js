import "#core/result";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import webpack from "webpack";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import Ajv from "#core/ajv";
import ansi from "#core/ansi";
import { readConfig } from "#core/config";
import env from "#core/env";
import { BULLET } from "#core/unicode";
import WebpackDevServer from "#lib/webpack/dev-server";

const ajv = new Ajv().addSchema( await readConfig( "#resources/schemas/config.schema.yaml", { "resolve": import.meta.url } ) );

const BUNDLE_ANALYZER_OPTIONS = {
    "analyzerMode": "static",
    "openAnalyzer": false,
    "logLevel": "warn",
};

export default class WebpackRunner {
    #env;
    #mode;
    #command;
    #isDevServer;
    #isCordova;
    #useAnalyzer;
    #useCache;
    #clearCache;
    #buildTag;
    #components;
    #webpackConfigs;
    #context;
    #outputPath;
    #appEnv;
    #webpackDevServer;

    constructor ( command, { mode, context, useAnalyzer, useCache, clearCache, buildCordova, listen, httpsPort, httpPort, proxyUrl } = {} ) {
        this.#command = command;
        this.#context = context || process.cwd();
        this.#useAnalyzer = !!useAnalyzer;
        this.#useCache = !!useCache;
        this.#clearCache = !!clearCache;

        // mode
        if ( this.#command === "dev" ) {
            this.#mode = mode ?? "development";

            this.#isDevServer = true;

            this.#webpackDevServer = new WebpackDevServer( this, {
                listen,
                httpPort,
                httpsPort,
                proxyUrl,
            } );
        }
        else {
            this.#mode = mode ?? "production";

            this.#isDevServer = false;
        }

        // cordova
        if ( buildCordova ) {
            this.#isCordova = true;
        }
        else {
            this.#isCordova = false;
        }
    }

    // static
    static buildConfig ( configUrl ) {
        return async ( env, options ) => {
            const webpack = new this( "config", {
                ...options,
                "context": path.dirname( url.fileURLToPath( configUrl ) ),
            } );

            return webpack.run();
        };
    }

    // properties
    get env () {
        return this.#env;
    }

    get mode () {
        return this.#mode;
    }

    get isDevelopment () {
        return this.mode === "development";
    }

    get isProduction () {
        return !this.isDevelopment;
    }

    get isCordova () {
        return this.#isCordova;
    }

    get isDevServer () {
        return this.#isDevServer;
    }

    get context () {
        return this.#context;
    }

    get outputPath () {
        this.#outputPath ??= path.join( this.context, this.isCordova
            ? "cordova/www"
            : "www" );

        return this.#outputPath;
    }

    get buildTargets () {
        return `${ ansi.ok( ` ${ this.mode.toUpperCase() } ` ) }${ this.isCordova
            ? `, ${ ansi.ok( ` CORDOVA ` ) }`
            : "" }`;
    }

    get buildTag () {
        this.#buildTag ??= [ this.#command, this.mode, this.isCordova
            ? "cordova"
            : null ].filter( tag => tag ).join( "." );

        return this.#buildTag;
    }

    // public
    async run () {
        this.#env = env.loadEnv( {
            "location": this.context,
            "mode": this.mode,
            "envPrefix": false,
        } );

        const webpackConfigs = await this.#buildWebpackConfigs();

        if ( this.#command === "config" ) {
            return webpackConfigs;
        }

        console.log( "" );

        this.#printCompilationStart();

        // run
        if ( this.#command === "dev" ) {
            this.#runDevServer( webpackConfigs );
        }
        else if ( this.#command === "build" ) {
            const res = await this.#runBuild( webpackConfigs );

            process.exit( res.ok
                ? 0
                : 1 );
        }
        else if ( this.#command === "dump" ) {
            await this.#runDump( webpackConfigs );

            process.exit( 0 );
        }
    }

    // private
    // XXX cache
    async #buildWebpackConfigs () {
        if ( !this.#webpackConfigs ) {
            this.#components = [];
            this.#webpackConfigs = [];

            const sharedPreprocessorDirectives = {},
                sharedPreprocessorParams = {},
                sharedResolveAlias = {};

            // load webpack components
            for ( const dirent of fs.readdirSync( path.join( this.context, "resources/webpack-components" ), { "withFileTypes": true } ) ) {
                if ( !dirent.isDirectory() ) continue;

                const componentPath = path.join( this.context, "resources/webpack-components", dirent.name, "component.js" );

                const Component = ( await import( url.pathToFileURL( componentPath ) ) ).default;

                const component = new Component( this, dirent.name, componentPath, {
                    sharedPreprocessorDirectives,
                    sharedPreprocessorParams,
                    sharedResolveAlias,
                } );

                component.init();

                this.#validateComponentEnv( component );

                if ( !component.isEnabled ) continue;

                this.#components.push( component );
            }

            const options = {
                "webpackProcessEnv": JSON.stringify( await this.#getAppEnv() ),
                "webpackAppConfig": JSON.stringify( this.env.config ),
                "webpackTemplateParams": await this.#getTemplateParams(),
            };

            // build webpack config
            for ( const component of this.#components ) {

                // generate webpack configs
                component.buildWebpackConfig( options );

                const config = component.webpackConfig;

                // inject webpack bundle analyzer
                if ( this.#useAnalyzer ) {
                    config.plugins.push( new BundleAnalyzerPlugin( {
                        ...BUNDLE_ANALYZER_OPTIONS,
                        "reportFilename": `report.${ component.name }.${ this.buildTag }.html`,
                        "reportTitle": `${ component.name } [${ this.mode }] ${ new Date().toISOString() }`,
                    } ) );
                }

                // create dependencies
                for ( const dependency of this.#components ) {
                    if ( !dependency.isEnabled ) continue;

                    if ( dependency.buildLevel <= component.buildLevel ) continue;

                    config.dependencies ||= [];

                    config.dependencies.push( dependency.name );
                }

                // patch cache
                if ( !this.#useCache ) {
                    config.cache = false;
                }
                else {
                    const hash = crypto.createHash( "sha3-512" );

                    hash.update( JSON.stringify( this.#env ) );

                    config.cache = {
                        ...config.cache,
                        "version": hash.digest( "hex" ),
                        "buildDependencies": {},
                    };

                    // clear cache
                    if ( this.#clearCache ) {
                        const cacheDirectory = config.cache.cacheDirectory || "node_modules/.cache/webpack",
                            name = config.cache.name || `${ config.name }-${ config.mode }`,
                            cacheLocation = config.cache.cacheLocation || path.resolve( cacheDirectory, name );

                        fs.rmSync( cacheLocation, {
                            "force": true,
                            "recursive": true,
                        } );
                    }

                    // XXX this disables cache, when package deps are linked
                    // XXX https://github.com/webpack/webpack/discussions/17176
                    config.cache.buildDependencies._configs = this.#components.map( component => component.path );
                }

                this.#webpackConfigs.push( config );
            }
        }

        return this.#webpackConfigs;
    }

    #validateComponentEnv ( component ) {
        process.stdout.write( `Validating config for the "${ component.name }" component ... ` );

        if ( !component.isEnabled ) {
            console.log( `component is disabled` );
        }
        else {
            var errors;

            if ( ajv.getSchema( "env" ) && !ajv.validate( "env", process.env ) ) errors = ajv.errors;

            if ( !errors && ajv.getSchema( "build" ) && !ajv.validate( "build", this.env.build ?? {} ) ) errors = ajv.errors;

            if ( !errors && ajv.getSchema( "config" ) && !ajv.validate( "config", this.env.config || {} ) ) errors = ajv.errors;

            errors ||= component.validateEnv( this.env );

            if ( errors ) {
                console.log( `errors, see below:\n${ errors }` );

                process.exit( 1 );
            }
            else {
                console.log( `OK` );
            }
        }
    }

    async #getAppEnv () {
        if ( !this.#appEnv ) {
            this.#appEnv = {
                "NODE_ENV": this.mode,
                "WEBPACK_BUILD_DEVSERVER": this.isDevServer
                    ? "true"
                    : "",
                "WEBPACK_BUILD_CORDOVA": this.isCordova
                    ? "true"
                    : "",
                "BUILD_VERSION": await env.getBuildVersion( this.context ),
            };

            // filter "APP_" prefix
            for ( const name in process.env ) {
                if ( name.startsWith( "APP_" ) ) this.#appEnv[ name ] = process.env[ name ];
            }
        }

        return this.#appEnv;
    }

    async #getTemplateParams () {
        return {
            "env": { ...( await this.#getAppEnv() ) },
            "build": this.#env.build,
            "config": this.env.config,
        };
    }

    async #runDevServer ( webpackConfigs ) {
        const plugin = {
            "apply": compiler => {
                compiler.hooks.compile.tap( "run", () => {
                    console.clear();

                    this.#printCompilationStart();
                } );
            },
        };

        // patch config
        for ( const config of webpackConfigs ) {

            // supress webpack-dev-server logging
            config.infrastructureLogging ??= {};
            config.infrastructureLogging.level = "none";

            config.plugins.push( plugin );
        }

        const compiler = webpack( webpackConfigs );

        compiler.hooks.done.tap( "run", stats => {
            console.clear();

            // error
            if ( stats.hasErrors() ) {
                console.log( stats.toString( { "preset": "errors-warnings", "colors": true } ) );

                this.#printCompilationReport( true );
            }

            // ok
            else {
                console.log( stats.toString( { "preset": "summary", "colors": true } ) );

                this.#printCompilationReport();
            }
        } );

        // start dev server
        await this.#webpackDevServer.start( compiler, this.env.build?.webpackDevServer );
    }

    async #runBuild ( webpackConfigs ) {

        // cleanup output directory
        this.#cleanOutputPath();

        return new Promise( resolve => {
            const compiler = webpack( webpackConfigs );

            compiler.run( ( error, stats ) => {
                const res = error || stats.hasErrors()
                    ? result( 500 )
                    : result( 200 );

                compiler.close( closeError => {
                    console.log( "\n" );

                    if ( error ) {
                        console.log( error.message );
                    }
                    else {
                        console.log( stats.toString( { "preset": "normal", "colors": true } ) );
                    }

                    this.#printCompilationReport( !res.ok );

                    resolve( res );
                } );
            } );
        } );
    }

    async #runDump ( webpackConfigs ) {
        console.log( JSON.stringify( webpackConfigs, null, 4 ) );
    }

    #printCompilationStart () {
        console.log( ansi.hl( BULLET + " Building for: " ) + this.buildTargets + " ... " );
    }

    #printCompilationReport ( error ) {
        console.log( "" );

        const info = [];

        // devserver info
        if ( this.#command === "dev" ) {
            info.push(

                //
                `Webpack dev. server listening at: ${ ansi.link( this.#webpackDevServer.httpUrl ) }`,
                `Webpack dev. server listening at: ${ ansi.link( this.#webpackDevServer.httpsUrl ) }`
            );

            if ( this.#webpackDevServer.httpsDomainUrl ) {
                info.push( `Webpack dev. server listening at: ${ ansi.link( this.#webpackDevServer.httpsDomainUrl ) }` );
            }

            if ( this.#webpackDevServer.proxyUrl ) {
                info.push( `\nWebpack dev. server proxies requests to: ${ ansi.link( this.#webpackDevServer.proxyUrl ) }` );
            }
        }

        // bundle analyzer info
        if ( !error && this.#useAnalyzer ) {
            info.push( `Webpack bundle analyzer reports were created in the output directory` );
        }

        // print info
        if ( info.length ) console.log( info.join( "\n" ), "\n" );

        // error
        if ( error ) {
            console.log( ansi.hl( BULLET + " Build targets: " ) + this.buildTargets + ", " + ansi.hl( "build status: " ) + ansi.error( ` FAIL ` ) );
        }

        // ok
        else {
            console.log( ansi.hl( BULLET + " Build targets: " ) + this.buildTargets + ", " + ansi.hl( "build status: " ) + ansi.ok( ` SUCCESS ` ) );
        }
    }

    #cleanOutputPath () {
        fs.rmSync( this.outputPath, { "force": true, "recursive": true } );
    }
}
