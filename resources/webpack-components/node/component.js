import WebpackComponent from "#lib/component";

// import webpack from "webpack";
// import CopyPlugin from "copy-webpack-plugin";

export default class extends WebpackComponent {

    // properties
    get isEnabled () {
        return super.isEnabled;
    }

    // public
    validateEnv ( env ) {
        return super.validateEnv( env ) || this._validateEnv( env, import.meta.url );
    }

    // protected
    _buildWebpackConfig () {
        return {
            "target": "node", // "browserslist"
            "mode": this.mode,
            "context": this.context,
            "devtool": false,
            "experiments": {
                "asyncWebAssembly": true,
                "layers": true,
                "topLevelAwait": true,
            },
            "cache": this.webpackCacheOptions,

            "entry": {
                "main": this.context + "/bin/main.js",
            },

            "output": {
                "path": this.outputPath,
                "publicPath": "auto",
                "filename": "js/[name].[contenthash].js",
                "chunkFilename": "js/[name].[contenthash].js",
                "hashDigestLength": 8,
                "environment": {
                    "asyncFunction": true,
                },
            },

            "resolve": {
                "alias": this.webpackResolveAlias,

                // required by froala, can be replaced with crypto-browserify
                // "fallback": {
                //     "crypto": false,
                // },

                "extensions": [ ".js", ".mjs", ".cjs", ".json", ".yaml", ".po", ".wasm" ],

                "modules": this.webpackResolveModules,
            },

            "resolveLoader": { "modules": this.webpackResolveLoaderModules },

            "optimization": {
                "splitChunks": {
                    "cacheGroups": {
                        "vendors": {
                            "name": "vendors",
                            "test": /[/\\]node_modules[/\\]/,
                            "priority": -10,
                            "chunks": "initial",
                        },
                        "firebase": {
                            "name": "firebase",
                            "test": /@firebase[/\\]/,
                            "priority": -9,
                            "chunks": "all",
                        },
                        "common": {
                            "name": "common",
                            "minChunks": 2,
                            "priority": -20,
                            "chunks": "initial",
                            "reuseExistingChunk": true,
                        },
                    },
                },

                "minimizer": [ this.webpackTerserPlugin ],
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

                    // *.node
                    {
                        "test": /\.node$/,
                        "loader": "node-loader",
                    },
                ],
            },

            "plugins": [

                // new webpack.DefinePlugin( {
                //     "process.env": this.webpackProcessEnv,
                //     "process._APP_CONFIG_PLACEHOLDER": this.webpackAppConfig,
                // } ),
                //
                // new CopyPlugin( {
                //     "patterns": [
                //         {
                //             "from": "public",
                //             "globOptions": {
                //                 "ignore": [ "**/index.html" ],
                //             },
                //         },
                //     ],
                // } ),
            ],
        };
    }
}
