import "#core/result";
import ansi from "#core/text/ansi";
import env from "#core/env";
import webpack from "webpack";
import WebpackDevServer from "webpack-dev-server";
import fs from "node:fs";
import path from "node:path";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import Ajv from "#core/ajv";
import { readConfig } from "#core/config";
import crypto from "node:crypto";
import url from "node:url";

const commonSchemaValidator = new Ajv().compile( readConfig( "#resources/schemas/env.schema.yaml", { "resolve": import.meta.url } ) );

const DEVSERVER_OPTIONS = {
    "host": "0.0.0.0",
    "port": 80,
    "allowedHosts": "all",
    "hot": true,
    "compress": false,
    "historyApiFallback": true,
    "setupExitSignals": true,
    "client": {
        "logging": "none",
        "progress": true,
        "overlay": {
            "errors": true,
            "warnings": false,
        },
    },
    "headers": {
        "Service-Worker-Allowed": "/",
    },
};

const BUNDLE_ANALYZER_OPTIONS = {
    "analyzerMode": "static",
    "openAnalyzer": false,
    "logLevel": "warn",
};

export default class WebpackRunner {
    #devServerProxyUrl;
    #env;
    #mode;
    #command;
    #isDevServer;
    #isCordova;
    #useAnalyzer;
    #useCache;
    #buildTag;
    #components;
    #webpackConfigs;
    #context;
    #outputPath;
    #appEnv;
    #contextSchemaValidator;

    constructor ( { mode, command, useAnalyzer, useCache, buildCordova, listen, port, proxytUrl } = {} ) {
        this.#command = command;
        this.#useAnalyzer = useAnalyzer;
        this.#useCache = useCache;

        // mode
        if ( this.#command === "dev" ) {
            this.#mode = mode ?? "development";

            this.#isDevServer = true;

            if ( listen ) DEVSERVER_OPTIONS.host = listen;
            if ( port ) DEVSERVER_OPTIONS.port = port;

            if ( proxytUrl ) this.#devServerProxyUrl = proxytUrl;
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

    // properties
    get env () {
        return this.#env;
    }

    get isCordova () {
        return this.#isCordova;
    }

    get buildTag () {
        this.#buildTag ??= [this.#command, this.mode, this.isCordova ? "cordova" : null].filter( tag => tag ).join( "." );

        return this.#buildTag;
    }

    get context () {
        this.#context ??= path.resolve( "." );

        return this.#context;
    }

    get outputPath () {
        this.#outputPath ??= path.join( this.context, this.isCordova ? "cordova/www" : "www" );

        return this.#outputPath;
    }

    get mode () {
        return this.#mode;
    }

    get isDevServer () {
        return this.#isDevServer;
    }

    get buildTargets () {
        return `${ansi.ok( ` ${this.mode.toUpperCase()} ` )}${this.isCordova ? `, ${ansi.ok( ` CORDOVA ` )}` : ""}`;
    }

    get isDevelopment () {
        return this.mode === "development";
    }

    get isProduction () {
        return !this.isProduction;
    }

    // public
    async run () {
        this.#env = env.loadEnv( {
            "location": this.context,
            "mode": this.mode,
            "envPrefix": false,
        } );

        const webpackConfigs = await this.#buildWebpackConfigs();

        this.#printCompilationStart();

        // run
        if ( this.#command === "dev" ) {
            this.#runDevServer( webpackConfigs );
        }
        else if ( this.#command === "build" ) {
            const res = await this.#runBuild( webpackConfigs );

            process.exit( res.ok ? 0 : 1 );
        }
        else if ( this.#command === "dump" ) {
            await this.#runDump( webpackConfigs );

            process.exit( 0 );
        }
    }

    // private
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

                const componentPath = path.join( this.context, "resources/webpack-components", dirent.name, "index.js" );

                const Component = ( await import( url.pathToFileURL( componentPath ) ) ).default;

                const component = new Component( this, dirent.name, componentPath, {
                    "buildOptions": this.#env.build,
                    "appConfig": this.env.config,
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

                // inject webpack bundle analyzer
                if ( this.#useAnalyzer ) {
                    component.webpackConfig.plugins.push( new BundleAnalyzerPlugin( {
                        ...BUNDLE_ANALYZER_OPTIONS,
                        "reportFilename": `report.${component.name}.${this.buildTag}.html`,
                        "reportTitle": `${component.name} [${this.mode}] ${new Date().toISOString()}`,
                    } ) );
                }

                // create dependencies
                for ( const dependency of this.#components ) {
                    if ( !dependency.isEnabled ) continue;

                    if ( dependency.buildLevel <= component.buildLevel ) continue;

                    component.webpackConfig.dependencies ||= [];

                    component.webpackConfig.dependencies.push( dependency.name );
                }

                // patch cache
                if ( !this.#useCache ) {
                    component.webpackConfig.cache = false;
                }
                else {
                    const hash = crypto.createHash( "sha3-512" );

                    hash.update( JSON.stringify( this.#env ) );

                    component.webpackConfig.cache = {
                        ...component.webpackConfig.cache,
                        "version": hash.digest( "hex" ),
                        "buildDependencies": {},
                    };

                    component.webpackConfig.cache.buildDependencies._configs = this.#components.map( component => component.path );
                }

                this.#webpackConfigs.push( component.webpackConfig );
            }
        }

        return this.#webpackConfigs;
    }

    #validateComponentEnv ( component ) {
        process.stdout.write( `Validating environment for the "${component.name}" component ... ` );

        if ( !component.isEnabled ) {
            console.log( `component is disabled` );
        }
        else {
            for ( const schema of [commonSchemaValidator, ...component.schemas] ) {
                if ( !schema ) continue;

                const validator = typeof schema === "function" ? schema : new Ajv().compile( readConfig( schema ) );

                const config = {
                    ...this.env,
                    "env": process.env,
                };

                if ( !validator( config ) ) {
                    console.log( `errors, see below:\n${validator.errors}` );

                    process.exit( 1 );
                }
            }

            console.log( `OK` );
        }
    }

    async #getAppEnv () {
        if ( !this.#appEnv ) {
            this.#appEnv = {
                "NODE_ENV": this.mode,
                "WEBPACK_BUILD_DEVSERVER": this.isDevServer ? "true" : "",
                "WEBPACK_BUILD_CORDOVA": this.isCordova ? "true" : "",
                "GIT_ID": JSON.stringify( await env.getGitId( this.context ) ),
            };

            // filter "APP_" prefix
            for ( const name in process.env ) {
                if ( name.startsWith( "APP_" ) ) this.#appEnv[name] = process.env[name];
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

        this.#devServerProxyUrl ||= this.env.build?.webpackDevServer?.proxyUrl;

        if ( this.#devServerProxyUrl ) {
            DEVSERVER_OPTIONS.proxy = [
                {
                    "ws": true,
                    "target": this.#devServerProxyUrl,
                    context ( path ) {
                        if ( path === "/ws" ) return false;

                        return true;
                    },
                },
            ];
        }

        const compiler = webpack( webpackConfigs ),
            server = new WebpackDevServer( DEVSERVER_OPTIONS, compiler );

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

        await server.start();
    }

    async #runBuild ( webpackConfigs ) {

        // cleanup output directory
        this.#cleanOutputPath();

        return new Promise( resolve => {
            const compiler = webpack( webpackConfigs );

            compiler.run( ( error, stats ) => {
                const res = error || stats.hasErrors() ? result( 500 ) : result( 200 );

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
        process.stdout.write( ansi.hl( "• Building for: " ) + this.buildTargets + " ... " );
    }

    #printCompilationReport ( error ) {
        console.log( "" );

        // error
        if ( error ) {
            console.log( ansi.hl( "• Compilation status:" ), ansi.error( ` FAIL ` ) + ",", "targets:", this.buildTargets );
        }

        // ok
        else {
            console.log( ansi.hl( "• Compilation status:" ), ansi.ok( ` SUCCESS ` ) + ",", "targets:", this.buildTargets );
        }

        if ( this.#command === "dev" ) {
            if ( this.#devServerProxyUrl ) {
                console.log( " ", `Webpack dev. server proxies requests to: ${ansi.hl( this.#devServerProxyUrl )}` );
            }

            console.log( " ", `Webpack dev. server listening at: ${ansi.hl( `http://${DEVSERVER_OPTIONS.host}:${DEVSERVER_OPTIONS.port}/` )}` );
        }

        if ( !error && this.#useAnalyzer ) console.log( " ", `Webpack bundle analyzer reports were created in the output directory` );
    }

    #cleanOutputPath () {
        fs.rmSync( this.outputPath, { "force": true, "recursive": true } );
    }
}
