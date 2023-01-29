import WebpackComponent from "#lib/component";
import webpack from "webpack";
import { VueLoaderPlugin } from "vue-loader";
import HtmlPlugin from "html-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import TerserPlugin from "terser-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import CssMinimizerPlugin from "css-minimizer-webpack-plugin";
import PoFile from "#core/locale/po-file";
import { parseJsonConfig, parseYamlConfig } from "#core/config";

const DefinePlugin = webpack.DefinePlugin;

export default class extends WebpackComponent {

    // properties
    get isEnabled () {
        return super.isEnabled;
    }

    get schemas () {
        return [

            //
            ...super.schemas,
            new URL( "env.schema.yaml", import.meta.url ),
        ];
    }

    // protected
    _buildWebpackConfig ( options ) {
        return {

            // "target": "web", "browserslist",
            "mode": this.mode,
            "context": this.context,
            "devtool": this.isDevelopment ? "eval-source-map" : undefined,
            "experiments": { "topLevelAwait": true },
            "cache": this.cacheOptions,

            "entry": {
                "app": "./src",
            },

            "output": {
                "path": this.outputPath,
                "publicPath": "auto",
                "filename": "js/[name].[contenthash].js",
                "chunkFilename": "js/[name].[contenthash].js",
                "hashDigestLength": 8,
            },

            "resolve": {
                "alias": this.resolveAlias,

                // required by froala, can be replaced with crypto-browserify
                "fallback": {
                    "crypto": false,
                },

                "extensions": [".mjs", ".js", ".jsx", ".vue", ".json", ".wasm", ".po", ".yaml"],

                "modules": this.resolveModules,
            },

            "resolveLoader": { "modules": this.resolveLoaderModules },

            "optimization": {
                "splitChunks": {
                    "cacheGroups": {
                        "vendors": {
                            "name": "vendors",
                            "test": /[\\/]node_modules[\\/]/,
                            "priority": -10,
                            "chunks": "initial",
                        },
                        "firebase": {
                            "name": "firebase",
                            "test": /@firebase[\\/]/,
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
                    new TerserPlugin( this.terserOptions ),

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
                                "test": /\.worker\.js$/,
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
                                "options": options.preprocessorOptions,
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
                                                "preset": ["default", { "normalizeWhitespace": false }],
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
                        "options": { parseJsonConfig },
                    },

                    // .yaml
                    {
                        "test": /\.yaml$/,
                        "loader": "@softvisio/webpack/loaders/yaml",
                        "options": { parseYamlConfig },
                    },
                ],
            },

            "plugins": [
                new VueLoaderPlugin(),

                new MiniCssExtractPlugin( {
                    "filename": "css/[name].[contenthash].css",
                    "chunkFilename": "css/[name].[contenthash].css",
                } ),

                new DefinePlugin( {
                    "__VUE_OPTIONS_API__": "true",
                    "__VUE_PROD_DEVTOOLS__": "false",
                    "process.env": options.appEnv,
                    "process._APP_CONFIG_PLACEHOLDER": options.appConfig,
                } ),

                new HtmlPlugin( {
                    "scriptLoading": "defer",
                    "template": "public/index.html",
                    "templateParameters": options.templateParams,
                } ),

                new CopyPlugin( {
                    "patterns": [
                        {
                            "from": "public",
                            "globOptions": {
                                "ignore": ["**/index.html"],
                            },
                        },
                    ],
                } ),
            ],
        };
    }
}