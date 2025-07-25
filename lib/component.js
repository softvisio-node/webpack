import fs from "node:fs";
import path from "node:path";
import { createConfig } from "@softvisio/babel";
import TerserPlugin from "terser-webpack-plugin";
import Ajv from "#core/ajv";
import { readConfigSync } from "#core/config";
import { mergeObjects } from "#core/utils";

export default class WebpackComponent {
    #webpack;
    #name;
    #path;
    #webpackProcessEnv;
    #webpackAppConfig;
    #webpackTemplateParams;
    #sharedPreprocessorDirectives;
    #sharedPreprocessorParams;
    #sharedResolveAlias;
    #preprocessorDirectives = {};
    #preprocessorParams = {};
    #webpackConfig;
    #webpackTerserPlugin;

    constructor ( webpack, name, path, { sharedPreprocessorDirectives, sharedPreprocessorParams, sharedResolveAlias } = {} ) {
        this.#webpack = webpack;
        this.#name = name;
        this.#path = path;
        this.#sharedPreprocessorDirectives = sharedPreprocessorDirectives;
        this.#sharedPreprocessorParams = sharedPreprocessorParams;
        this.#sharedResolveAlias = sharedResolveAlias;
    }

    // properties
    get name () {
        return this.#name;
    }

    get path () {
        return this.#path;
    }

    get buildOptions () {
        return this.#webpack.env.build;
    }

    get appConfig () {
        return this.#webpack.env.config;
    }

    get sharedPreprocessorDirectives () {
        return this.#sharedPreprocessorDirectives;
    }

    get sharedPreprocessorParams () {
        return this.#sharedPreprocessorParams;
    }

    get sharedResolveAlias () {
        return this.#sharedResolveAlias;
    }

    get buildLevel () {
        return 0;
    }

    get isEnabled () {
        return true;
    }

    get mode () {
        return this.#webpack.mode;
    }

    get isDevelopment () {
        return this.mode === "development";
    }

    get isProduction () {
        return !this.isDevelopment;
    }

    get context () {
        return this.#webpack.context;
    }

    get outputPath () {
        return this.#webpack.outputPath;
    }

    get isDevServer () {
        return this.#webpack.isDevServer;
    }

    get isCordova () {
        return this.#webpack.isCordova;
    }

    get preprocessorDirectives () {
        return this.#preprocessorDirectives;
    }

    get preprocessorParams () {
        return this.#preprocessorParams;
    }

    get webpackProcessEnv () {
        return this.#webpackProcessEnv;
    }

    get webpackAppConfig () {
        return this.#webpackAppConfig;
    }

    get webpackTemplateParams () {
        return this.#webpackTemplateParams;
    }

    get webpackCacheOptions () {
        return {
            "type": "filesystem",
            "name": path.join( this.#webpack.buildTag, this.name ),
            "compression": "brotli",
            "maxMemoryGenerations": 1,
        };
    }

    get webpackBabelOptions () {
        return createConfig();
    }

    get webpackResolveModules () {
        return [

            //
            path.join( this.context, "node_modules" ),
        ];
    }

    get webpackResolveLoaderModules () {
        return [

            //
            path.join( this.context, "node_modules" ),
        ];
    }

    get webpackResolveAlias () {
        return {
            ...this.sharedResolveAlias,
            "@": path.join( this.context, "src" ),
            "@resources": path.join( this.context, "resources" ),
        };
    }

    get webpackConfig () {
        return this.#webpackConfig;
    }

    get webpackTerserPlugin () {
        this.#webpackTerserPlugin ||= new TerserPlugin( {
            "terserOptions": {
                "compress": {
                    "arrows": false,
                    "collapse_vars": false,
                    "comparisons": false,
                    "computed_props": false,
                    "hoist_funs": false,
                    "hoist_props": false,
                    "hoist_vars": false,
                    "inline": false,
                    "loops": false,
                    "negate_iife": false,
                    "properties": false,
                    "reduce_funcs": false,
                    "reduce_vars": false,
                    "switches": false,
                    "toplevel": false,
                    "typeofs": false,
                    "booleans": true,
                    "if_return": true,
                    "sequences": true,
                    "unused": true,
                    "conditionals": true,
                    "dead_code": true,
                    "evaluate": true,
                },
                "mangle": {
                    "safari10": true,
                },
                "format": {
                    "comments": false,
                },
            },
            "parallel": true,
            "extractComments": false,
        } );

        return this.#webpackTerserPlugin;
    }

    get webpackPreprocessorOptions () {
        return {
            "debug": this.isDevelopment,
            "verbose": this.isDevelopment,
            "directives": {
                ...this.sharedPreprocessorDirectives,
                ...this.preprocessorDirectives,
            },
            "params": {
                ...this.sharedPreprocessorParams,
                ...this.preprocessorParams,
                "isProduction": this.isProduciotn,
                "isDevelopment": this.isDevelopment,
                "isCordova": this.isCordova,
            },
        };
    }

    // public
    init () {
        this._init();
    }

    validateEnv ( env ) {}

    buildWebpackConfig ( { webpackProcessEnv, webpackAppConfig, webpackTemplateParams } ) {
        if ( this.#webpackConfig ) return;

        this.#webpackProcessEnv = webpackProcessEnv;
        this.#webpackAppConfig = webpackAppConfig;
        this.#webpackTemplateParams = webpackTemplateParams;

        const config = this._buildWebpackConfig();

        // patch name
        config.name = this.name;

        // patch stats
        config.stats = "none";

        this.#webpackConfig = config;
    }

    // protected
    _init () {}

    _validateEnv ( env, location ) {

        // apply default env
        const defaultEnvLocation = new URL( "config.yaml", location );

        if ( fs.existsSync( defaultEnvLocation ) ) {
            const defaultEnv = readConfigSync( defaultEnvLocation );

            if ( defaultEnv.env ) mergeObjects( process.env, defaultEnv.env );

            env.build = mergeObjects( {}, defaultEnv.build, env.build );
            env.config = mergeObjects( {}, defaultEnv.config, env.config );
        }

        // validate env schema
        const envSchemaLocation = new URL( "config.schema.yaml", location );

        if ( fs.existsSync( envSchemaLocation ) ) {
            const schema = readConfigSync( envSchemaLocation ),
                ajv = new Ajv( {
                    "coerceTypes": false,
                } ).addSchema( schema );

            // validate build
            if ( ajv.getSchema( "build" ) && !ajv.validate( "build", env.build ) ) {
                return ajv.errors;
            }

            // validate config
            if ( ajv.getSchema( "config" ) && !ajv.validate( "config", env.config ) ) {
                return ajv.errors;
            }

            // validate env
            if ( ajv.getSchema( "env" ) ) {
                const ajv = new Ajv( {
                    "coerceTypes": true,
                } ).addSchema( schema );

                if ( !ajv.validate( "env", process.env ) ) {
                    return ajv.errors;
                }
            }
        }
    }

    _buildWebpackConfig () {
        throw `Webpack component "_buildWebpackConfig" method is not implemented`;
    }
}
