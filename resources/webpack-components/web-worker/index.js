import WebpackComponent from "#lib/component";
import webpack from "webpack";
import fs from "node:fs";
import path from "node:path";
import { TmpDir } from "#core/tmp";

const DefinePlugin = webpack.DefinePlugin;

export default class extends WebpackComponent {
    #tmpPath = new TmpDir();

    // properties
    get buildLevel () {
        return 10;
    }

    get tmpPath () {
        this.#tmpPath ||= new TmpDir();

        return this.#tmpPath.path;
    }

    get entryImport () {
        throw `Entry import is required`;
    }

    get entryFilename () {
        throw `Entry filename is required`;
    }

    // protected
    _buildWebpackConfig ( options ) {
        return {
            "target": "webworker",
            "mode": this.mode,
            "context": this.context,
            "devtool": this.isDevelopment ? "eval-source-map" : undefined,
            "experiments": { "topLevelAwait": true },
            "cache": this.webpackCacheOptions,

            "entry": {
                "worker": {
                    "import": this.entryImport,
                    "filename": this.entryFilename,
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
                "minimizer": [this.webpackTerserPlugin],
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
                                "options": this.webpackBabelOptions,
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
                {
                    "apply": compiler => {
                        if ( !this.isDevServer ) return;

                        compiler.hooks.assetEmitted.tap( "run", ( file, info ) => {

                            // store to the tmp path
                            if ( info.targetPath.startsWith( this.tmpPath ) ) {
                                fs.mkdirSync( path.dirname( info.targetPath ), { "recursive": true } );

                                fs.writeFileSync( info.targetPath, info.content );
                            }
                        } );
                    },
                },
                new DefinePlugin( {
                    "process.env": options.appEnv,
                    "process._APP_CONFIG_PLACEHOLDER": options.appConfig,
                } ),
            ],
        };
    }
}
