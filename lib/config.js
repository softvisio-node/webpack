import { resolve as _resolve } from "#core/utils";

export default class WebpackConfig {
    #schemas = [];
    #mode;
    #context;
    #isDevServer;
    #isCordova;
    #buildOptions;
    #appConfig;
    #preprocessorDirectives;
    #preprocessorParams;

    constructor ( { mode, context, isDevServer, isCordova, buildOptions, appConfig, preprocessorDirectives, preprocessorParams } = {} ) {
        this.#mode = mode;
        this.#context = context;
        this.#isDevServer = isDevServer;
        this.#isCordova = isCordova;
        this.#buildOptions = buildOptions;
        this.#appConfig = appConfig;
        this.#preprocessorDirectives = preprocessorDirectives;
        this.#preprocessorParams = preprocessorParams;
    }

    // properties
    get name () {
        throw `Webpack config name is not defined`;
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

    get context () {
        return this.#context;
    }

    get isDevServer () {
        return this.#isDevServer;
    }

    get isCordova () {
        return this.#isCordova;
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

    get schemas () {
        return [...this.#schemas];
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

    // public
    prepare () {
        this._prepare();
    }

    generate ( options ) {
        const config = this._generate( options );

        // patch name
        config.name = this.name;

        // patch stats
        config.stats = "none";

        // patch output
        config.output.hashFunction ??= "xxhash64";

        return config;
    }

    addSchema ( url, resolve ) {
        if ( resolve ) url = _resolve( url, resolve, { "url": true } );

        this.#schemas.push( url );
    }

    // protected
    _prepare () {}

    _generate ( options ) {
        return {};
    }
}
