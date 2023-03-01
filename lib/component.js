import path from "node:path";
import TerserPlugin from "terser-webpack-plugin";

export default class WebpackComponent {
    #webpack;
    #name;
    #buildOptions;
    #appConfig;
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

    constructor ( webpack, name, { buildOptions, appConfig, sharedPreprocessorDirectives, sharedPreprocessorParams, sharedResolveAlias } = {} ) {
        this.#webpack = webpack;
        this.#name = name;
        this.#buildOptions = buildOptions;
        this.#appConfig = appConfig;
        this.#sharedPreprocessorDirectives = sharedPreprocessorDirectives;
        this.#sharedPreprocessorParams = sharedPreprocessorParams;
        this.#sharedResolveAlias = sharedResolveAlias;
    }

    // properties
    get name () {
        return this.#name;
    }

    get buildOptions () {
        return this.#buildOptions;
    }

    get appConfig () {
        return this.#appConfig;
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

    get schemas () {
        return [];
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
        return {
            "compact": false,
            "sourceType": "unambiguous",

            // NOTE https://github.com/babel/babel/issues/9903
            // NOTE https://github.com/babel/babel/discussions/13826
            "exclude": [/@babel(\/|\\)runtime/, /core-js/],
            "presets": [
                [
                    "@babel/preset-env",
                    {
                        "bugfixes": true,
                        "corejs": 3,
                        "loose": false,
                        "debug": false,
                        "modules": false,
                        "targets": {},
                        "useBuiltIns": "usage",
                        "ignoreBrowserslistConfig": undefined,
                        "exclude": ["es.array.iterator", "es.promise", "es.object.assign", "es.promise.finally"],
                        "shippedProposals": true,
                    },
                ],
            ],
            "plugins": [
                [
                    "@babel/plugin-transform-runtime",
                    {
                        "regenerator": false, // useBuiltIns !== "usage"
                        "corejs": false, // 3, polyfills are injected by preset-env & polyfillsPlugin, so no need to add them again
                        "helpers": true, // useBuiltIns === "usage",
                        "useESModules": true, // !process.env.VUE_CLI_BABEL_TRANSPILE_MODULES,
                    },
                ],
            ],
        };
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

    _buildWebpackConfig () {
        throw `Webpack component "_buildWebpackConfig" method is not implemented`;
    }
}
