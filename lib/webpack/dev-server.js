import WebpackDevServer from "webpack-dev-server";
import { mergeObjects } from "#core/utils";
import net from "node:net";
import tls from "node:tls";
import stream from "node:stream";

const defaultOptions = {
    "server": {
        "type": "https",
    },
    "host": "0.0.0.0",
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
    #options;
    #httpPort;
    #proxyUrl;
    #httpUrl;
    #httpsUrl;

    constructor ( { production, listen, httpPort, httpsPort, proxyUrl } = {} ) {
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
        return ( this.#httpUrl ??= new URL( `http://${this.#options.host}:${this.#httpPort}/` ) ).htrf;
    }

    get httpsUrl () {
        return ( this.#httpsUrl ??= new URL( `https://${this.#options.host}:${this.#options.port}/` ) ).htrf;
    }

    get proxyUrl () {
        return this.#proxyUrl;
    }

    // public
    async start ( compiler, { proxyUrl } = {} ) {
        this.#proxyUrl ??= proxyUrl;

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

            // start https server
            const httpsServer = new WebpackDevServer( this.#options, compiler );
            await httpsServer.start();

            // start http proxy
            await this.#startHttpProxy();
        }
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
