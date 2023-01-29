import WebpackComponent from "#lib/component";
import webpack from "webpack";
import TerserPlugin from "terser-webpack-plugin";
import fs from "node:fs";

const DefinePlugin = webpack.DefinePlugin;

export default class extends WebpackComponent {

    // properties
    get buildLevel () {
        return -10;
    }

    get isEnabled () {
        if ( !super.isEnabled ) return false;

        if ( this.isCordova ) return false;

        if ( !this.appConfig.firebase?.web ) return false;

        return true;
    }

    get schemas () {
        return [

            //
            ...super.schemas,
            new URL( "env.schema.yaml", import.meta.url ),
        ];
    }

    // protected
    _prepare () {
        super._prepare();

        this.preprocessorParams.firebaseMessagingWorkerEnabled = this.isEnabled;

        this.preprocessorParams.firebaseMessagingWorkerMixin = fs.existsSync( this.context + "/src/firebase-messaging.worker.js" ) ? true : false;
    }

    _generate ( options ) {
        return {
            "target": "webworker",
            "mode": this.mode,
            "context": this.context,
            "devtool": this.isDevelopment ? "eval-source-map" : undefined,
            "experiments": { "topLevelAwait": true },
            "cache": this.cacheOptions,

            "entry": {
                "firebase": {
                    "import": null, // NOTE rewrite in subclass
                    "filename": "firebase-messaging.worker.js",
                },
            },

            "output": {
                "path": this.tmpPath,
                "publicPath": "auto",
            },

            "resolve": {
                "alias": this.resolveAlias,

                // required by froala, can be replaced with crypto-browserify
                "fallback": {
                    "crypto": false,
                },

                "extensions": [".mjs", ".js", ".jsx", ".vue", ".json", ".wasm"],

                "modules": this.resolveModules,
            },

            "resolveLoader": { "modules": this.resolveLoaderModules },

            "optimization": {
                "minimizer": [new TerserPlugin( this.terserOptions )],
            },

            "module": {
                "rules": [

                    // js
                    {
                        "test": /\.[cm]?jsx?$/,
                        "resolve": {
                            "fullySpecified": false,
                        },
                        "use": [
                            {
                                "loader": "babel-loader",
                                "options": this.babelOptions,
                            },
                            {
                                "loader": "webpack-preprocessor-loader",
                                "options": options.preprocessorOptions,
                            },
                        ],
                    },
                ],
            },

            "plugins": [
                new DefinePlugin( {
                    "process.env": options.appEnv,
                    "process._APP_CONFIG_PLACEHOLDER": options.appConfig,
                } ),
            ],
        };
    }
}
