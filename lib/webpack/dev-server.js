import WebpackDevServer from "webpack-dev-server";
import { mergeObjects } from "#core/utils";
import net from "node:net";
import tls from "node:tls";
import stream from "node:stream";
import path from "node:path";
import fs from "node:fs";

const defaultOptions = {
    "server": {
        "type": "https",
        "options": {
            "cert": null,
            "key": null,
        },
    },
    "host": "0.0.0.0",
    "port": 443,
    "allowedHosts": "all",
    "hot": true,
    "compress": false,
    "historyApiFallback": true,
    "setupExitSignals": true,
    "client": {
        "logging": "none",
        "progress": true,
        "overlay": {
            "errors": true,
            "warnings": false,
            "runtimeErrors": true,
        },
    },
    "headers": {
        "Service-Worker-Allowed": "/",
    },
};

export default class DevServer {
    #webpack;
    #options;
    #httpPort;
    #proxyUrl;
    #httpUrl;
    #httpsUrl;
    #httpsDomainUrl;
    #useCert = false;
    #httpsDomain;

    constructor ( webpack, { production, listen, httpPort, httpsPort, proxyUrl } = {} ) {
        this.#webpack = webpack;
        this.#httpPort = httpPort ?? 80;
        this.#proxyUrl = proxyUrl;

        this.#options = mergeObjects( {}, defaultOptions, {
            "host": listen || "0.0.0.0",
            "port": httpsPort ?? 443,
            "client": {
                "overlay": {
                    "runtimeErrors": !production,
                },
            },
        } );
    }

    // proporties
    get httpUrl () {
        this.#httpUrl ??= new URL( `http://${this.#options.host}:${this.#httpPort}/` ).href;

        return this.#httpUrl;
    }

    get httpsUrl () {
        this.#httpsUrl ??= new URL( `https://${this.#options.host}:${this.#options.port}/` ).href;

        return this.#httpsUrl;
    }

    get httpsDomainUrl () {
        if ( this.#httpsDomainUrl === undefined ) {
            this.#httpsDomainUrl = null;

            if ( this.#httpsDomain && this.#useCert ) {
                this.#httpsDomainUrl = new URL( `https://${this.#httpsDomain}:${this.#options.port}/` ).href;
            }
        }

        return this.#httpsDomainUrl;
    }

    get proxyUrl () {
        return this.#proxyUrl;
    }

    // public
    async start ( compiler, { proxyUrl, httpsDomain, cert, key } = {} ) {
        this.#proxyUrl ??= proxyUrl;
        this.#httpsDomain = httpsDomain;

        // proxy
        if ( this.#proxyUrl ) {
            this.#proxyUrl = new URL( this.#proxyUrl ).href;

            this.#options.proxy = [
                {
                    "ws": true,
                    "target": this.#proxyUrl,
                    context ( path ) {
                        if ( path === "/ws" ) return false;

                        return true;
                    },
                },
            ];
        }

        SSL: if ( cert && key ) {
            cert = path.resolve( this.#webpack.context, cert );

            if ( !fs.existsSync( cert ) ) break SSL;

            key = path.resolve( this.#webpack.context, key );

            if ( !fs.existsSync( key ) ) break SSL;

            this.#options.server.options.cert = cert;
            this.#options.server.options.key = key;

            this.#useCert = true;
        }

        // start https server
        const httpsServer = new WebpackDevServer( this.#options, compiler );
        await httpsServer.start();

        // start http proxy
        await this.#startHttpProxy();
    }

    // private
    #startHttpProxy () {
        const server = new net.Server();

        server.on( "connection", async localSocket => {
            const remoteSocket = await this.#proxyConnect();

            if ( !remoteSocket ) return localSocket.end();

            stream.pipeline( localSocket, remoteSocket, () => {} );
            stream.pipeline( remoteSocket, localSocket, () => {} );
        } );

        // listen
        return new Promise( resolve => {
            server.listen( this.#httpPort, this.#options.host, resolve );
        } );
    }

    async #proxyConnect () {
        return new Promise( resolve => {
            const socket = tls.connect( {
                "host": this.#options.host,
                "port": this.#options.port,
                "rejectUnauthorized": false,
            } );

            socket.once( "error", e => resolve );

            socket.once( "secureConnect", () => {
                socket.off( "error", resolve );

                socket.once( "error", e => {} );

                resolve( socket );
            } );
        } );
    }
}
