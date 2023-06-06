import WebpackComponent from "#lib/component";
import webpack from "webpack";
import fs from "node:fs";
import path from "node:path";
import { TmpDir } from "#core/tmp";

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

    get webpackEntryImport () {
        throw `webpackEntryImport is required`;
    }

    get webpackEntryFilename () {
        throw `webpackEntryFilename is required`;
    }

    // public
    validateEnv ( env ) {
        return super.validateEnv( env ) || this._validateEnv( env, import.meta.url );
    }

    // protected
    _buildWebpackConfig () {
        return {
            "target": "webworker",
            "mode": this.mode,
            "context": this.context,
            "devtool": this.isDevelopment ? "eval-source-map" : undefined,
            "experiments": { "topLevelAwait": true },
            "cache": this.webpackCacheOptions,

            "entry": {
                "worker": {
                    "import": this.webpackEntryImport,
                    "filename": this.webpackEntryFilename,
                },
            },

            "output": {
                "path": this.tmpPath,
                "publicPath": "auto",
            },

            "resolve": {
                "alias": this.webpackResolveAlias,

                // required by froala, can be replaced with crypto-browserify
                "fallback": {
                    "crypto": false,
                },

                "extensions": [".mjs", ".js", ".jsx", ".vue", ".json", ".wasm"],

                "modules": this.webpackResolveModules,
            },

            "resolveLoader": { "modules": this.webpackResolveLoaderModules },

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
                                "options": this.webpackPreprocessorOptions,
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
                new webpack.DefinePlugin( {
                    "process.env": this.webpackProcessEnv,
                    "process._APP_CONFIG_PLACEHOLDER": this.webpackAppConfig,
                } ),
            ],
        };
    }
}
