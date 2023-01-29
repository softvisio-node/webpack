import path from "node:path";

export default class WebpackComponent {
    #webpack;
    #name;
    #buildOptions;
    #appConfig;
    #preprocessorDirectives;
    #preprocessorParams;
    #sharedResolveAlias;
    #webpackConfig;

    constructor ( webpack, name, { buildOptions, appConfig, preprocessorDirectives, preprocessorParams, sharedResolveAlias } = {} ) {
        this.#webpack = webpack;
        this.#name = name;
        this.#buildOptions = buildOptions;
        this.#appConfig = appConfig;
        this.#preprocessorDirectives = preprocessorDirectives;
        this.#preprocessorParams = preprocessorParams;
        this.#sharedResolveAlias = sharedResolveAlias;
    }

    // properties
    get name () {
        return this.#name;
    }

    get buildLevel () {
        return 0;
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

    get buildOptions () {
        return this.#buildOptions;
    }

    get appConfig () {
        return this.#appConfig;
    }

    get preprocessorDirectives () {
        return this.#preprocessorDirectives;
    }

    get preprocessorParams () {
        return this.#preprocessorParams;
    }

    get sharedResolveAlias () {
        return this.#sharedResolveAlias;
    }

    get schemas () {
        return [];
    }

    get isEnabled () {
        return true;
    }

    get terserOptions () {
        return {
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
        };
    }

    get cacheOptions () {
        return {
            "type": "filesystem",
            "compression": "brotli",
            "maxAge": 1000 * 60 * 60 * 24 * 3, // 3 days
            "maxMemoryGenerations": 1,
        };
    }

    get babelOptions () {
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

    get resolveModules () {
        return [path.join( this.context, "node_modules" )];
    }

    get resolveLoaderModules () {
        return [path.join( this.context, "node_modules" )];
    }

    get resolveAlias () {
        return {
            ...this.sharedResolveAlias,
            "@": path.join( this.context, "src" ),
            "@resources": path.join( this.context, "resources" ),
        };
    }

    get webpackConfig () {
        return this.#webpackConfig;
    }

    // public
    prepare () {
        this._prepare();
    }

    buildWebpackConfig ( options ) {
        if ( this.#webpackConfig ) return;

        const config = this._buildWebpackConfig( options );

        // patch name
        config.name = this.name;

        // patch stats
        config.stats = "none";

        // patch output
        config.output.hashFunction ??= "xxhash64";

        this.#webpackConfig = config;
    }

    // protected
    _prepare () {}

    _buildWebpackConfig ( options ) {
        throw `Webpack component "_buildWebpackConfig" method is not implemented`;
    }
}
