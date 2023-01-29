import "#core/result";
import ansi from "#core/text/ansi";
import env from "#core/env";
import webpack from "webpack";
import WebpackDevServer from "webpack-dev-server";
import fs from "node:fs";
import path from "node:path";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import { TmpDir } from "#core/tmp";
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
    #webpackConfigs;
    #context;
    #outputPath;
    #tmpPath;
    #appEnv;
    #appConfig;
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

    get tmpPath () {
        this.#tmpPath ??= new TmpDir();

        return this.#tmpPath.path;
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

        const webpackConfig = await this.#buildWebpackConfig();

        this.#printCompilationStart();

        // run
        if ( this.#command === "dev" ) {
            this.#runDevServer( webpackConfig );
        }
        else if ( this.#command === "build" ) {
            const res = await this.#runBuild( webpackConfig );

            process.exit( res.ok ? 0 : 1 );
        }
        else if ( this.#command === "dump" ) {
            await this.#runDump( webpackConfig );

            process.exit( 0 );
        }
    }

    // private
    async #buildWebpackConfig () {
        if ( !this.#webpackConfigs ) {
            this.#webpackConfigs = [];

            const components = [];

            for ( const dirent of fs.readdirSync( path.join( this.context, "resources/webpack-components" ), { "withFileTypes": true } ) ) {
                if ( !dirent.isDirectory() ) continue;

                components[dirent.name] = ( await import( url.pathToFileURL( path.join( this.context, "resources/webpack-components", dirent.name, "index.js" ) ) ) ).default;
            }

            const configs = [],
                preprocessorDirectives = {},
                preprocessorParams = {};

            for ( const [name, Config] of Object.entries( components ) ) {
                const config = new Config( this, name, {
                    "buildOptions": this.#env.build,
                    "appConfig": this.#getAppConfig(),
                    preprocessorDirectives,
                    preprocessorParams,
                } );

                config.prepare();

                this.#validateConfigEnv( config );

                configs.push( config );
            }

            // build config options
            const options = {
                "appEnv": JSON.stringify( await this.#getAppEnv() ),
                "appConfig": JSON.stringify( this.#getAppConfig() ),
                "templateParams": await this.#getTemplateParams(),
                "preprocessorOptions": {
                    "debug": this.isDevelopment,
                    "verbose": this.isDevelopment,
                    "directives": {
                        ...preprocessorDirectives,
                    },
                    "params": {
                        ...preprocessorParams,
                        "isProduction": this.isProduciotn,
                        "isDevelopment": this.isDevelopment,
                        "isCordova": this.isCordova,
                    },
                },
            };

            // build config
            for ( const config of configs ) {
                if ( !config.isEnabled ) continue;

                // generate configs
                const webpackConfig = config.webpackConfig( options );

                // inject webpack bundle analyzer
                if ( this.#useAnalyzer ) {
                    webpackConfig.plugins.push( new BundleAnalyzerPlugin( {
                        ...BUNDLE_ANALYZER_OPTIONS,
                        "reportFilename": `report.${webpackConfig.name}.${this.buildTag}.html`,
                        "reportTitle": `${webpackConfig.name} [${this.mode}] ${new Date().toISOString()}`,
                    } ) );
                }

                // patch cache
                if ( !this.#useCache ) {
                    webpackConfig.cache = false;
                }
                else {
                    const hash = crypto.createHash( "sha3-512" );
                    hash.update( JSON.stringify( options.preprocessorOptions ) );

                    webpackConfig.cache = {
                        ...webpackConfig.cache,
                        "name": path.join( this.buildTag, webpackConfig.name ),
                        "version": hash.digest( "hex" ),
                    };
                }

                // create dependencies
                for ( const dependency of configs ) {
                    if ( dependency === config ) continue;

                    if ( !dependency.isEnabled ) continue;

                    if ( dependency.buildLevel >= config.buildLevel ) continue;

                    webpackConfig.dependencies ||= [];

                    webpackConfig.dependencies.push( dependency.name );
                }

                this.#webpackConfigs.push( webpackConfig );
            }
        }

        return this.#webpackConfigs;
    }

    #validateConfigEnv ( config ) {
        process.stdout.write( `Validating environment for the "${config.name}" config ... ` );

        if ( !config.isEnabled ) {
            console.log( `config is disabled` );
        }
        else {
            for ( const schema of [commonSchemaValidator, ...config.schemas] ) {
                if ( !schema ) continue;

                const validator = typeof schema === "function" ? schema : new Ajv().compile( readConfig( schema ) );

                const config1 = {
                    ...this.env,
                    "env": process.env,
                };

                if ( !validator( config1 ) ) {
                    console.log( `errors, see below:\n${validator.errors}` );

                    process.exit( 1 );
                }
            }

            console.log( `OK` );
        }

        return true;
    }

    async #getAppEnv () {
        if ( !this.#appEnv ) {
            this.#appEnv = {
                "NODE_ENV": this.mode,
                "WEBPACK_BUILD_DEVSERVER": this.isDevServer,
                "WEBPACK_BUILD_CORDOVA": this.isCordova,
                "GIT_ID": JSON.stringify( await env.getGitId( this.context ) ),
            };

            // filter "APP_" prefix
            for ( const name in process.env ) {
                if ( name.startsWith( "APP_" ) ) this.#appEnv[name] = process.env[name];
            }
        }

        return this.#appEnv;
    }

    #getAppConfig () {
        if ( !this.#appConfig ) {
            this.#appConfig = this.env.config;
        }

        return this.#appConfig;
    }

    async #getTemplateParams () {
        return {
            "env": { ...( await this.#getAppEnv() ) },
            "config": this.#getAppConfig(),
        };
    }

    async #runDevServer ( webpackConfig ) {
        const plugin = {
            "apply": compiler => {
                compiler.hooks.compile.tap( "run", () => {
                    console.clear();

                    this.#printCompilationStart();
                } );

                compiler.hooks.assetEmitted.tap( "run", ( file, info ) => {

                    // store to the tmp path
                    if ( info.targetPath.startsWith( this.tmpPath ) ) {
                        fs.mkdirSync( path.dirname( info.targetPath ), { "recursive": true } );

                        fs.writeFileSync( info.targetPath, info.content );
                    }
                } );
            },
        };

        // patch config
        for ( const config of webpackConfig ) {

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

        const compiler = webpack( webpackConfig ),
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

    async #runBuild ( webpackConfig ) {

        // cleanup output directory
        this.#cleanOutputPath();

        return new Promise( resolve => {
            const compiler = webpack( webpackConfig );

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

    async #runDump ( webpackConfig ) {
        console.log( JSON.stringify( webpackConfig, null, 4 ) );
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

            console.log( " ", `Webpack dev. server listening on: ${ansi.hl( `http://${DEVSERVER_OPTIONS.host}:${DEVSERVER_OPTIONS.port}` )}` );
        }

        if ( !error && this.#useAnalyzer ) console.log( " ", `Webpack bundle analyzer reports were created in the output directory` );
    }

    #cleanOutputPath () {
        fs.rmSync( this.outputPath, { "force": true, "recursive": true } );
    }
}
