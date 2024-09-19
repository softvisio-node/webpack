import WebpackComponent from "#lib/component";
import webpack from "webpack";
import { VueLoaderPlugin } from "vue-loader";
import HtmlPlugin from "html-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import CssMinimizerPlugin from "css-minimizer-webpack-plugin";
import PoFile from "#core/locale/po-file";
import json5 from "#core/json5";
import yaml from "#core/yaml";

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

            // "target": "web", "browserslist",
            "mode": this.mode,
            "context": this.context,
            "devtool": this.isDevelopment
                ? "eval-source-map"
                : undefined,
            "experiments": {
                "asyncWebAssembly": true,
                "layers": true,
                "topLevelAwait": true,
            },
            "cache": this.webpackCacheOptions,

            "entry": {
                "app": "@",
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
                "fallback": {
                    "crypto": false,
                },

                "extensions": [ ".js", ".mjs", ".cjs", ".vue", ".json", ".yaml", ".po", ".wasm", ".jsx" ],

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

                "minimizer": [
                    this.webpackTerserPlugin,

                    new CssMinimizerPlugin( {
                        "parallel": true,
                        "minimizerOptions": {
                            "preset": [
                                "default",
                                {
                                    "discardComments": {
                                        "removeAll": true,
                                    },
                                },
                            ],
                        },
                    } ),
                ],
            },

            "module": {
                "rules": [

                    // js
                    {
                        "test": /\.[cm]?jsx?$/,
                        "resolve": {
                            "fullySpecified": false,
                        },
                        "oneOf": [

                            // web workers *.worker.js
                            {
                                "test": /\.worker\.[cm]?js$/,

                                "type": "asset/resource",
                                "generator": {
                                    "filename": "[name].[hash][ext][query]",
                                },
                            },

                            // other *.js files
                            {
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

                    // vue
                    {
                        "test": /\.vue$/,
                        "use": [
                            {
                                "loader": "vue-loader",
                                "options": {

                                    // XXX "babelParserPlugins": ["jsx", "classProperties", "decorators-legacy"],
                                    "compilerOptions": {
                                        "isCustomElement": tag => tag.startsWith( "ext-" ),
                                    },
                                },
                            },
                            {
                                "loader": "webpack-preprocessor-loader",
                                "options": this.webpackPreprocessorOptions,
                            },
                        ],
                    },

                    // images
                    {
                        "test": /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/,
                        "type": "asset/resource",
                        "generator": {
                            "filename": "img/[name].[hash][ext][query]",
                        },
                    },

                    // media
                    {
                        "test": /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/,
                        "type": "asset/resource",
                        "generator": {
                            "filename": "media/[name].[hash][ext][query]",
                        },
                    },

                    // fonts
                    {
                        "test": /\.(woff2?|eot|ttf|otf)(\?.*)?$/i,
                        "type": "asset/resource",
                        "generator": {
                            "filename": "fonts/[name].[hash][ext][query]",
                        },
                    },

                    // css
                    {
                        "test": /\.css$/,
                        "use": [
                            this.isDevServer
                                ? {
                                    "loader": "vue-style-loader",
                                    "options": {
                                        "sourceMap": false,
                                        "shadowMode": false,
                                    },
                                }
                                : {
                                    "loader": MiniCssExtractPlugin.loader,
                                    "options": {
                                        "esModule": false,
                                    },
                                },
                            {
                                "loader": "css-loader",
                                "options": {
                                    "sourceMap": false,
                                    "importLoaders": 2,
                                },
                            },
                            {
                                "loader": "postcss-loader",
                                "options": {
                                    "sourceMap": false,
                                    "postcssOptions": {
                                        "plugins": {
                                            "cssnano": {
                                                "preset": [ "default", { "normalizeWhitespace": false } ],
                                            },
                                        },
                                    },
                                },
                            },
                        ],
                    },

                    // .po
                    {
                        "test": /\.po$/,
                        "loader": "@softvisio/webpack/loaders/po",
                        "options": { PoFile },
                    },

                    // .json
                    {
                        "test": /\.json$/,
                        "loader": "@softvisio/webpack/loaders/json",
                        "options": { json5 },
                    },

                    // .yaml
                    {
                        "test": /\.yaml$/,
                        "loader": "@softvisio/webpack/loaders/yaml",
                        "options": { yaml },
                    },
                ],
            },

            "plugins": [
                new VueLoaderPlugin(),

                new MiniCssExtractPlugin( {
                    "filename": "css/[name].[contenthash].css",
                    "chunkFilename": "css/[name].[contenthash].css",
                } ),

                new webpack.DefinePlugin( {

                    // https://vuejs.org/api/compile-time-flags.html
                    "__VUE_OPTIONS_API__": "true",
                    "__VUE_PROD_DEVTOOLS__": "false",
                    "__VUE_PROD_HYDRATION_MISMATCH_DETAILS__": "false",

                    "process.env": this.webpackProcessEnv,
                    "process._APP_CONFIG_PLACEHOLDER": this.webpackAppConfig,
                } ),

                new HtmlPlugin( {
                    "scriptLoading": "defer",
                    "template": "public/index.html",
                    "templateParameters": this.webpackTemplateParams,
                } ),

                new CopyPlugin( {
                    "patterns": [
                        {
                            "from": "public",
                            "globOptions": {
                                "ignore": [ "**/index.html" ],
                            },
                        },
                    ],
                } ),
            ],
        };
    }
}
